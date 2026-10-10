import type { IsoTimestamp, PersonRef } from "./envelope.js";

export const auditActions = [
  "collection.published",
  "collection.unpublished",
  "collection.deleted",
  "collection.transferred_out",
  "collection.transferred_in",
  "share.granted",
  "share.revoked",
  "link.enabled",
  "link.rotated",
  "link.disabled",
  "hub.handle_changed",
  "hub.name_changed",
  "audit.read",
  // Content changes (ADR-0015): attribution is derived from these.
  "collection.created",
  "collection.updated",
  "item.link_added",
  "item.reference_added",
  "item.section_added",
  "item.updated",
  "item.removed",
  "items.reordered",
  "items.imported",
  "comment.hidden",
  "comment.shown",
  "comment.answer_marked",
  "comment.answer_unmarked",
] as const;
export type AuditAction = (typeof auditActions)[number];

/** Routine reads remain recorded, but may be excluded from the reading view. */
export const auditReadActions = [
  "audit.read",
  "accounts.list",
  "accounts.lookup",
  "account.read",
  "collections.list",
  "collection.inspect",
  "operators.list",
  "invitations.list",
  "sharing.list",
  "sharing.read",
  "sharing.analytics",
] as const;

/** Bounded state evidence, not arbitrary content snapshots. Null on older rows. */
export interface AuditEffect {
  beforeState: string;
  afterState: string;
  outcome: "success" | "no_change";
}

/** Actions that shape a collection's content: their actors are its contributors. */
export const contentActions = [
  "collection.created",
  "collection.updated",
  "item.link_added",
  "item.reference_added",
  "item.section_added",
  "item.updated",
  "item.removed",
  "items.reordered",
  "items.imported",
] as const satisfies readonly AuditAction[];

// One change in a collection's history, as its contributors see it. `item` is
// the item as it is now (null once removed); people appear as everywhere else.
export interface ActivityEntry {
  id: string;
  action: AuditAction;
  actor: PersonRef | null;
  /** The person acted on: shared with, transferred to, whose comment. */
  target: PersonRef | null;
  item: { id: string; kind: import("./common.js").ResourceKind; title: string | null } | null;
  createdAt: IsoTimestamp;
}

/** The single management timeline; internal replay hashes are never exposed. */
export interface AuditLogEntry {
  id: string;
  createdAt: IsoTimestamp;
  actorKind: string;
  actorUserId: string | null;
  actorUsername: string | null;
  authority: string | null;
  hubId: string | null;
  targetUserId: string | null;
  targetUsername: string | null;
  collectionId: string | null;
  resourceId: string | null;
  invitationId: string | null;
  action: string;
  role: string | null;
  reason: string | null;
  outcome: string | null;
  beforeState: string | null;
  afterState: string | null;
}
export const authenticationAuditActions = [
  "account.deactivate.confirm",
  "account.delete.confirm",
  "account.reactivate.confirm",
  "account.cancel_deletion.confirm",
  "code.send",
  "code.verify",
  "email-change.start",
  "email-change.confirm-current",
  "email-change.confirm-new",
] as const;
