import type { AuditAction, AuditEffect } from "@ntumie/types";
import { isUUID } from "class-validator";
import type { Prisma } from "../generated/prisma/client";

export interface AuditInput {
  hubId: string;
  actorUserId: string;
  collectionId?: string;
  targetUserId?: string;
  resourceId?: string;
  action: AuditAction;
  role?: "viewer" | "contributor";
  effect?: AuditEffect;
}

// Called only inside the same transaction as the protected mutation. There is
// no free-form payload: names, emails, tokens and authored content stay out.
export function recordAudit(tx: Prisma.TransactionClient, input: AuditInput) {
  const { effect, ...event } = input;
  if (effect) {
    const allowed: Partial<Record<AuditAction, readonly string[]>> = {
      "collection.published": ["published", "unpublished"],
      "collection.unpublished": ["published", "unpublished"],
      "link.enabled": ["enabled", "disabled"],
      "link.disabled": ["enabled", "disabled"],
      "link.rotated": ["enabled", "disabled"],
      "share.granted": [
        "none",
        "direct_viewer",
        "direct_contributor",
        "link_viewer",
        "link_contributor",
      ],
      "share.revoked": [
        "none",
        "direct_viewer",
        "direct_contributor",
        "link_viewer",
        "link_contributor",
      ],
    };
    const states = input.action.startsWith("collection.transferred_")
      ? null
      : allowed[input.action];
    if (
      !["success", "no_change"].includes(effect.outcome) ||
      ![effect.beforeState, effect.afterState].every((state) =>
        states === null ? isUUID(state) : states?.includes(state),
      )
    )
      throw new Error("Invalid bounded audit effect");
  }
  return tx.auditLog.create({ data: { ...event, ...effect } });
}
