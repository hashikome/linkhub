import { randomUUID } from "node:crypto";
import { Injectable, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import { PrismaPg } from "@prisma/adapter-pg";
import { readSecret } from "src/config/secret";
import { type Prisma, PrismaClient } from "src/generated/prisma/client";
import { AUTHORITY_LOCK, authorityContext } from "./authority-context";

// 5436 = postgres default +4, linkhub's stack-wide local port offset.
const DEFAULT_DATABASE_URL = "postgresql://postgres:postgres@127.0.0.1:5436/nslinkhub";

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  constructor() {
    super({
      adapter: new PrismaPg({
        // DATABASE_URL_FILE (deployment secret) > DATABASE_URL > local default.
        connectionString: readSecret("DATABASE_URL") ?? DEFAULT_DATABASE_URL,
      }),
    });
    // All service queries in a product mutation join its authority transaction.
    // Existing nested transaction calls join rather than open another connection.
    // biome-ignore lint/correctness/noConstructorReturn: Preserve Prisma/Nest identity while routing delegates into the request transaction.
    return new Proxy(this, {
      get(target, property, receiver) {
        const tx = authorityContext.getStore();
        if (tx && property === "$transaction")
          return (work: ((client: Prisma.TransactionClient) => unknown) | Promise<unknown>[]) =>
            typeof work === "function" ? work(tx) : Promise.all(work);
        if (tx && typeof property === "string" && property in tx) {
          const value = Reflect.get(tx, property);
          return typeof value === "function" ? value.bind(tx) : value;
        }
        return Reflect.get(target, property, receiver);
      },
    });
  }

  async withAuthority<T>(work: () => Promise<T>): Promise<T> {
    if (authorityContext.getStore()) return work();
    return this.$transaction(
      async (tx) => {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(${AUTHORITY_LOCK}::bigint)`;
        return authorityContext.run(tx, work);
      },
      { maxWait: 10000, timeout: 30000 },
    );
  }

  // A caught row error must not leave PostgreSQL's outer transaction aborted.
  async withSavepoint<T>(work: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T> {
    const tx = authorityContext.getStore();
    if (!tx) return this.$transaction(work);
    const name = `row_${randomUUID().replaceAll("-", "")}`;
    // Identifier is generated here, never supplied by a request.
    await tx.$executeRawUnsafe(`SAVEPOINT ${name}`);
    try {
      const result = await work(tx);
      await tx.$executeRawUnsafe(`RELEASE SAVEPOINT ${name}`);
      return result;
    } catch (error) {
      await tx.$executeRawUnsafe(`ROLLBACK TO SAVEPOINT ${name}`);
      await tx.$executeRawUnsafe(`RELEASE SAVEPOINT ${name}`);
      throw error;
    }
  }

  async onModuleInit() {
    await this.$connect();
  }

  // Readiness ping: proves the authoritative store answers queries.
  async ping(): Promise<void> {
    await this.$queryRaw`SELECT 1`;
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }
}
