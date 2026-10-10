import { type AuditLogEntry, auditActionLabels, auditStateLabels } from "@nslinkhub/types";

export const auditActionLabel = (action: string) =>
  auditActionLabels[action as keyof typeof auditActionLabels] ?? action;

export function auditTarget(event: AuditLogEntry) {
  const action = event.action;
  if (action.startsWith("invitation.") || action.startsWith("admin.")) return event.invitationId;
  if (action.startsWith("item.")) return event.resourceId;
  if (action.startsWith("hub.")) return event.hubId;
  if (/^(collection\.|items\.|share\.|link\.)/.test(action)) return event.collectionId;
  if (/^(account\.|accounts.lookup|sessions\.|operator\.)/.test(action)) return event.targetUserId;
  if (/^(code\.|email-change\.|security\.)/.test(action)) return event.targetUserId;
  // Comment IDs were never captured; a commenter or parent collection is not the comment.
  return null;
}

export const auditState = (state: string) => auditStateLabels[state] ?? state;
