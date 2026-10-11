import { Injectable } from "@nestjs/common";
import { RedisClient } from "bun";
import { readSecret } from "src/config/secret";

// 6383 = redis default +4, linkhub's stack-wide local port offset.
const DEFAULT_REDIS_URL = "redis://127.0.0.1:6383";
const READINESS_TIMEOUT_MS = 1_500;

async function withinReadinessTimeout<T>(operation: Promise<T>): Promise<T> {
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      operation,
      new Promise<never>((_, reject) => {
        timeout = setTimeout(() => {
          reject(new Error("Redis queue readiness check timed out"));
        }, READINESS_TIMEOUT_MS);
      }),
    ]);
  } finally {
    clearTimeout(timeout);
  }
}

// Pings the queue Redis (the async backbone reserved for email/notification
// delivery). A fresh, non-reconnecting client per check: readiness must
// observe the dependency as it is right now, and the API holds no standing
// Redis connection until the email worker wires BullMQ.
@Injectable()
export class RedisQueueReadinessService {
  async ping(): Promise<void> {
    const client = new RedisClient(readSecret("REDIS_URL") ?? DEFAULT_REDIS_URL, {
      autoReconnect: false,
      connectionTimeout: 1_000,
      enableOfflineQueue: false,
      maxRetries: 0,
    });

    try {
      await withinReadinessTimeout(
        (async () => {
          await client.connect();
          const response = await client.send("PING", []);
          if (response !== "PONG") {
            throw new Error("Redis queue readiness check returned an unexpected response");
          }
        })(),
      );
    } finally {
      client.close();
    }
  }
}
