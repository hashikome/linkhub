import { createHash } from "node:crypto";
import { BadRequestException, HttpException, Injectable } from "@nestjs/common";
import { publicOrigins } from "@ntumie/config/public-origins";
import type {
  ApiWarning,
  CreatedShareEntry,
  CursorMeta,
  ShareAnalytics,
  ShareContext,
  ShareDescriptor,
  ShareEntry,
  ShareKind,
} from "@ntumie/types";
import { isUUID } from "class-validator";
import { appError } from "../../common/errors/app-exception";
import type { AuthUser } from "../../common/interfaces/auth-user.interface";
import { decodeCursor, encodeCursor } from "../../common/utils/cursor.util";
import { PrismaService } from "../../database/prisma.service";
import { Prisma, type ShareEntry as StoredShareEntry } from "../../generated/prisma/client";
import { CollectionsService } from "../collections/collections.service";
import { OperationsService, type OperatorRequest } from "../operations/operations.service";
import { UsersService } from "../users/users.service";
import {
  payloadHash as hashPayload,
  readAttribution,
  readContext,
  readOccurredAt,
} from "./share-metadata";
import {
  ShareAnalyticsQueryDto,
  ShareDetailQueryDto,
  ShareListQueryDto,
  ShareOpenDto,
  ShareRequestDto,
  ShareTargetDto,
} from "./share-query.dto";

@Injectable()
export class SharingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly operations: OperationsService,
    private readonly collections: CollectionsService,
    private readonly users: UsersService,
  ) {}

  async create(
    body: ShareRequestDto,
    viewer: AuthUser,
    token?: string,
  ): Promise<CreatedShareEntry> {
    const descriptor = await this.resolve(body, viewer, token, body.message);
    const warnings: ApiWarning[] = [];
    const context = readContext(body.context, warnings);
    if (warnings.length) throw new BadRequestException();
    if (context && "destination" in context) {
      const destination = context.destination;
      if (destination !== null && (typeof destination !== "string" || destination.length > 100))
        throw new BadRequestException();
      if (typeof destination === "string" && destination.trim())
        context.destination = destination.trim();
      else delete context.destination;
    }
    const payloadHash = hashPayload([
      descriptor.kind,
      descriptor.id,
      body.message?.trim() || null,
      context,
    ]);
    const previous = body.operationId
      ? await this.prisma.shareEntry.findUnique({
          where: {
            createdByUserId_operationId: {
              createdByUserId: viewer.userId,
              operationId: body.operationId,
            },
          },
        })
      : null;
    if (previous && previous.payloadHash !== payloadHash) throw appError("conflict");
    const row =
      previous ??
      (await this.prisma.shareEntry.create({
        data: {
          createdByUserId: viewer.userId,
          operationId: body.operationId,
          payloadHash: body.operationId ? payloadHash : null,
          kind: descriptor.kind,
          resourceId: descriptor.id,
          message: descriptor.message,
          context: context === null ? Prisma.DbNull : (context as Prisma.InputJsonObject),
        },
      }));
    return this.present(row, descriptor);
  }

  async get(
    id: string,
    query: ShareDetailQueryDto,
    req: OperatorRequest,
    token?: string,
  ): Promise<ShareEntry> {
    if (query.scope !== "service") {
      const row = await this.prisma.shareEntry.findFirst({
        where: { id, createdByUserId: req.user.userId },
      });
      if (!row) throw appError("not_found");
      return this.hydrate(row, req.user, token);
    }
    return this.operations.run(
      req,
      false,
      async () => {
        const entry = await this.prisma.shareEntry.findUnique({ where: { id } });
        if (!entry) throw appError("not_found");
        await this.operations.audit(req, { action: "sharing.read", outcome: "success" });
        return this.metadata(entry);
      },
      "admin",
    );
  }

  async list(
    query: ShareListQueryDto,
    req: OperatorRequest,
    token?: string,
  ): Promise<{ items: ShareEntry[]; meta: CursorMeta }> {
    if (query.scope === "service")
      return this.operations.run(
        req,
        false,
        async () => {
          // Service analytics exposes metadata, never other people's authored messages.
          if (query.message) throw new BadRequestException();
          const result = await this.listEntries(query, req.user, token);
          await this.operations.audit(req, { action: "sharing.list", outcome: "success" });
          return result;
        },
        "admin",
      );
    return this.listEntries(query, req.user, token);
  }

  private async listEntries(
    query: ShareListQueryDto,
    viewer: AuthUser,
    token?: string,
  ): Promise<{ items: ShareEntry[]; meta: CursorMeta }> {
    const limit = query.limit ?? 20;
    const service = query.scope === "service";
    const filters = {
      scope: query.scope ?? "mine",
      q: query.q?.trim() || "",
      id: query.id?.toLowerCase() || "",
      kind: query.kind || "",
      resourceId: query.resourceId?.toLowerCase() || "",
      message: query.message?.trim() || "",
      destination: query.destination?.trim() || "",
    };
    const scope = createHash("sha256")
      .update(JSON.stringify([viewer.userId, filters]))
      .digest("hex");
    const cursor = query.cursor ? decodeCursor<{ id: string; scope: string }>(query.cursor) : null;
    if (
      query.cursor &&
      (!cursor || typeof cursor.id !== "string" || !isUUID(cursor.id) || cursor.scope !== scope)
    )
      throw appError("invalid_cursor");
    // Prisma contains uses LIKE: user text must remain a literal substring.
    const contains = (text: string) => ({
      contains: text.replace(/[\\%_]/g, "\\$&"),
      mode: "insensitive" as const,
    });
    const destinationContains = (text: string) => ({
      context: {
        path: ["destination"],
        string_contains: text.replace(/[\\%_]/g, "\\$&"),
        mode: "insensitive" as const,
      },
    });
    const where: Prisma.ShareEntryWhereInput = {
      ...(service ? {} : { createdByUserId: viewer.userId }),
      AND: [
        ...(cursor ? [{ id: { lt: cursor.id } }] : []),
        ...(filters.id ? [{ id: filters.id }] : []),
        ...(filters.kind ? [{ kind: filters.kind }] : []),
        ...(filters.resourceId ? [{ resourceId: filters.resourceId }] : []),
        ...(filters.message ? [{ message: contains(filters.message) }] : []),
        ...(filters.destination ? [destinationContains(filters.destination)] : []),
        ...(filters.q
          ? [
              {
                OR: [
                  ...(isUUID(filters.q) ? [{ id: filters.q }, { resourceId: filters.q }] : []),
                  ...(!service ? [{ message: contains(filters.q) }] : []),
                  destinationContains(filters.q),
                ],
              },
            ]
          : []),
      ],
    };
    const rows = await this.prisma.shareEntry.findMany({
      where,
      orderBy: { id: "desc" },
      take: limit + 1,
    });
    const page = rows.slice(0, limit);
    return {
      items: service
        ? page.map((row) => this.metadata(row))
        : await Promise.all(page.map((row) => this.hydrate(row, viewer, token))),
      meta: {
        limit,
        nextCursor: rows.length > limit ? encodeCursor({ id: page.at(-1)?.id, scope }) : null,
      },
    };
  }

  async analytics(query: ShareAnalyticsQueryDto, req: OperatorRequest): Promise<ShareAnalytics> {
    const scope = query.scope ?? "mine";
    const calculate = async () => {
      if (query.from && query.to && new Date(query.from) >= new Date(query.to))
        throw new BadRequestException();
      if (scope === "resource") {
        if (!query.kind || !query.resourceId || query.kind === "site")
          throw new BadRequestException();
        const id = query.resourceId;
        const owned =
          query.kind === "profile"
            ? id.toLowerCase() === req.user.userId.toLowerCase()
            : query.kind === "hub"
              ? await this.prisma.hub.findFirst({
                  where: { id, ownerUserId: req.user.userId },
                  select: { id: true },
                })
              : await this.prisma.collection.findFirst({
                  where: { id, hub: { ownerUserId: req.user.userId } },
                  select: { id: true },
                });
        if (!owned) throw appError("not_found");
      }
      const where: Prisma.ShareEntryWhereInput = {
        ...(scope === "mine" ? { createdByUserId: req.user.userId } : {}),
        ...(query.kind ? { kind: query.kind } : {}),
        ...(query.resourceId ? { resourceId: query.resourceId } : {}),
        createdAt: {
          ...(query.from ? { gte: new Date(query.from) } : {}),
          ...(query.to ? { lt: new Date(query.to) } : {}),
        },
      };
      const clauses: Prisma.Sql[] = [Prisma.sql`TRUE`];
      if (scope === "mine") clauses.push(Prisma.sql`created_by_user_id = ${req.user.userId}::uuid`);
      if (query.kind) clauses.push(Prisma.sql`kind = ${query.kind}`);
      if (query.resourceId) clauses.push(Prisma.sql`resource_id = ${query.resourceId}::uuid`);
      if (query.from) clauses.push(Prisma.sql`created_at >= ${new Date(query.from)}`);
      if (query.to) clauses.push(Prisma.sql`created_at < ${new Date(query.to)}`);
      const [destinations, kinds] = await this.prisma.$transaction(
        [
          this.prisma.$queryRaw<
            { destination: string | null; count: bigint; opens: bigint }[]
          >(Prisma.sql`
            SELECT CASE WHEN jsonb_typeof(context->'destination') = 'string'
              THEN context->>'destination' ELSE NULL END AS destination,
              count(*) AS count, coalesce(sum(open_count), 0)::bigint AS opens
            FROM share_entries WHERE ${Prisma.join(clauses, " AND ")}
            GROUP BY 1 ORDER BY count(*) DESC, destination ASC LIMIT 100
          `),
          this.prisma.shareEntry.groupBy({
            by: ["kind"],
            where,
            _count: { _all: true },
            _sum: { openCount: true },
            orderBy: { kind: "asc" },
          }),
        ],
        { isolationLevel: "RepeatableRead" },
      );
      return {
        scope,
        opens: kinds.reduce((sum, group) => sum + (group._sum.openCount ?? 0), 0),
        total: kinds.reduce((sum, group) => sum + group._count._all, 0),
        otherDestinationCount:
          kinds.reduce((sum, group) => sum + group._count._all, 0) -
          destinations.reduce((sum, group) => sum + Number(group.count), 0),
        byDestination: destinations.map((group) => ({
          destination: group.destination,
          count: Number(group.count),
          opens: Number(group.opens),
        })),
        byKind: kinds.map((group) => ({
          kind: group.kind as ShareKind,
          count: group._count._all,
          opens: group._sum.openCount ?? 0,
        })),
      };
    };
    if (scope !== "service") return calculate();
    return this.operations.run(
      req,
      false,
      async () => {
        const result = await calculate();
        await this.operations.audit(req, { action: "sharing.analytics", outcome: "success" });
        return result;
      },
      "operator",
    );
  }

  private metadata(row: StoredShareEntry): ShareEntry {
    return { ...this.present(row, null), message: null, context: null };
  }

  private resource(descriptor: ShareDescriptor): NonNullable<ShareEntry["resource"]> {
    return {
      kind: descriptor.kind,
      id: descriptor.id,
      name: descriptor.name,
      url: descriptor.url,
      path: descriptor.path,
      access: descriptor.access,
      capabilities: descriptor.capabilities,
    };
  }

  private trackedResource(
    descriptor: ShareDescriptor,
    shareId: string,
  ): NonNullable<ShareEntry["resource"]> {
    const url = new URL(descriptor.url);
    url.searchParams.set("via", shareId);
    return { ...this.resource(descriptor), url: url.href, path: url.pathname + url.search };
  }

  async recordOpen(id: string, body: ShareOpenDto, viewer: AuthUser | null, token?: string) {
    return this.prisma.withAuthority(async () => {
      const row = await this.prisma.shareEntry.findUnique({ where: { id } });
      if (!row || row.kind !== body.kind || row.resourceId !== (body.id?.toLowerCase() ?? null))
        throw appError("not_found");
      // Knowing a tracking ID cannot bypass the resource policy or restore a token.
      await this.resolve(body, viewer, token);
      const warnings: ApiWarning[] = [];
      const attribution = readAttribution(body.attribution, warnings);
      const context = readContext(body.context, warnings);
      const occurredAt = readOccurredAt(body.occurredAt, warnings);
      const added = await this.prisma.shareOpen.createMany({
        data: {
          shareId: id,
          eventId: body.eventId,
          attribution: attribution ?? Prisma.DbNull,
          context: context === null ? Prisma.DbNull : (context as Prisma.InputJsonObject),
          occurredAt,
          // Matching content is analytical evidence only, never an acceptance/deduplication key.
          payloadHash: hashPayload([row.kind, row.resourceId, attribution, context]),
        },
        skipDuplicates: true,
      });
      if (added.count)
        await this.prisma.shareEntry.update({
          where: { id },
          data: { openCount: { increment: 1 } },
        });
      return { recorded: true as const, created: added.count > 0, warnings };
    });
  }

  private async hydrate(
    row: StoredShareEntry,
    viewer: AuthUser,
    token?: string,
  ): Promise<ShareEntry> {
    try {
      const descriptor = await this.resolve(
        { kind: row.kind as ShareKind, id: row.resourceId ?? undefined },
        viewer,
        token,
      );
      return this.present(row, descriptor);
    } catch (error) {
      // Keep the creator's historical message, but never resurrect inaccessible content.
      if (error instanceof HttpException && error.getStatus() === 404)
        return this.present(row, null);
      throw error;
    }
  }

  private present(row: StoredShareEntry, descriptor: ShareDescriptor): CreatedShareEntry;
  private present(row: StoredShareEntry, descriptor: null): ShareEntry;
  private present(row: StoredShareEntry, descriptor: ShareDescriptor | null): ShareEntry {
    const resource = descriptor ? this.trackedResource(descriptor, row.id) : null;
    return {
      id: row.id,
      kind: row.kind as ShareKind,
      resourceId: row.resourceId,
      createdByUserId: row.createdByUserId,
      createdAt: row.createdAt.toISOString(),
      openCount: row.openCount,
      message: row.message,
      context: row.context as ShareContext | null,
      resource,
    };
  }

  async resolve(
    query: ShareTargetDto,
    viewer: AuthUser | null,
    token?: string,
    message?: string,
  ): Promise<ShareDescriptor> {
    const id = query.id ?? "";
    let path = "/",
      name = "ntumie.";
    let access: ShareDescriptor["access"] = "public";
    let canManageAccess = false;
    let resourceId: string | null = null;
    switch (query.kind) {
      case "profile": {
        const person = await this.users.getPublicPerson({ id });
        name = person.name.trim() || person.username;
        resourceId = person.id;
        path = `/people/${person.id}`;
        break;
      }
      case "hub": {
        const { hub } = await this.collections.getHubPage(id, { limit: 1 });
        name = hub.name;
        resourceId = hub.id;
        path = `/h/${hub.id}`;
        break;
      }
      case "collection": {
        const context = await this.collections.getShareContext(id, viewer, token);
        name = context.title;
        resourceId = context.id;
        path = `/c/${context.id}${context.token ? `?s=${encodeURIComponent(context.token)}` : ""}`;
        access = context.access;
        canManageAccess = context.canManageAccess;
        break;
      }
    }
    return {
      kind: query.kind,
      id: resourceId,
      name,
      message: message?.trim() || `Share ${query.kind}`,
      path,
      url: new URL(path, publicOrigins(process.env).webOrigin).href,
      access,
      capabilities: { canManageAccess },
    };
  }
}
