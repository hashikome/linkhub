import { expect, it } from "bun:test";
import { type AuditLogEntry, authenticationAuditActions } from "@nslinkhub/types";
import { auditActionLabel, auditTarget } from "../src/lib/audit-presentation";

const event: AuditLogEntry = {
  id: "event-id",
  createdAt: "2026-10-10T00:00:00.000Z",
  actorKind: "user",
  actorUserId: "account-id",
  actorUsername: "reader",
  authority: null,
  hubId: null,
  targetUserId: "account-id",
  targetUsername: "reader",
  collectionId: null,
  resourceId: null,
  invitationId: null,
  action: "security.sign_in.email",
  role: null,
  reason: null,
  outcome: "success",
  beforeState: null,
  afterState: null,
};

it("offers each completed sign-in method in audit filters with an account target", () => {
  for (const [method, label] of [
    ["email", "Sign in with email"],
    ["google", "Sign in with Google"],
    ["passkey", "Sign in with passkey"],
    ["totp", "Sign in with authenticator"],
    ["recovery", "Sign in with recovery code"],
  ] as const) {
    const action = `security.sign_in.${method}` as const;
    expect(authenticationAuditActions).toContain(action);
    expect(auditActionLabel(action)).toBe(label);
    expect(auditTarget({ ...event, action })).toBe(event.targetUserId);
  }
  expect(auditActionLabel("code.verify")).toBe("Verify sign-in code");
  expect(auditTarget({ ...event, targetUserId: null })).toBeNull();
});
