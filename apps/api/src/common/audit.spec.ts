import { expect, it } from "bun:test";
import type { Prisma } from "../generated/prisma/client";
import { recordAudit } from "./audit";

it("rejects authored content and secrets as audit state before touching persistence", () => {
  const tx = {} as Prisma.TransactionClient;
  for (const action of [
    "collection.published",
    "collection.updated",
    "collection.transferred_out",
  ] as const) {
    expect(() =>
      recordAudit(tx, {
        hubId: "unused",
        actorUserId: "unused",
        action,
        effect: {
          beforeState: "private content",
          afterState: "synthetic-secret",
          outcome: "success",
        },
      }),
    ).toThrow("Invalid bounded audit effect");
  }
});
