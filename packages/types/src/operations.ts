export const operationReasons = [
  "spam",
  "harmful_content",
  "account_compromise",
  "owner_request",
  "mistake_corrected",
  "review_completed",
  "access_administration",
] as const;
export type OperationReason = (typeof operationReasons)[number];
export const operationActions = [
  "account.suspend",
  "account.deactivate",
  "account.delete",
  "account.cancel_deletion",
  "account.reactivate",
  "sessions.revoke",
  "collection.hold",
  "collection.release",
] as const;
export type OperationAction = (typeof operationActions)[number];
export type AccountOperationAction = Exclude<
  OperationAction,
  "collection.hold" | "collection.release"
>;
export interface OperationCommand {
  action: OperationAction;
  targetId: string;
  reason: OperationReason;
  version: number;
  operationId: string;
}
export interface OperationResult {
  action: OperationAction;
  targetId: string;
  state: string;
  version: number;
}
export interface SessionView {
  hubId: string | null;
  username: string;
  email: string;
  // Notifications newer than the last time the account opened Notifications.
  unreadNotifications: number;
  userId: string;
  name: string;
  operator: boolean;
  admin: boolean;
}
export interface OperatorAccount {
  id: string;
  name: string;
  username: string;
  email: string;
  emailVerified: boolean;
  /** Last completed sign-in; null for accounts without a recorded login. */
  lastLoginAt: string | null;
  hub: { id: string; handle: string; name: string } | null;
  createdAt: string;
  state: "active" | "inactive" | "suspended";
  deletionScheduledFor: string | null;
  availableActions: AccountOperationAction[];
  version: number;
  sessions: number;
  operator: boolean;
  admin: boolean;
}
export interface OperatorAccountSession {
  id: string;
  createdAt: string;
  expiresAt: string;
  verifiedAt: string | null;
  current: boolean;
}
export interface OperatorAccountDetail extends OperatorAccount {
  bio: string | null;
  image: string | null;
  updatedAt: string;
  suspensionReason: string | null;
  suspendedAt: string | null;
  /** Newest 100 unexpired sessions at sessionsAsOf; `sessions` is the total. */
  activeSessions: OperatorAccountSession[];
  sessionsAsOf: string;
}
export interface OperatorCollection {
  id: string;
  hubId: string;
  hubHandle: string | null;
  held: boolean;
  version: number;
  reason: OperationReason | null;
  updatedAt: string | null;
}
export interface ServiceInvitationView {
  id: string;
  role: "admin" | "operator";
  email: string;
  state: "pending" | "verifying" | "accepted" | "declined" | "cancelled" | "expired";
  version: number;
  createdAt: string;
  expiresAt: string;
  delivery: string | null;
}
// Notification center item. Today every notification is a service invitation;
// newest first with unread items leading.
export interface NotificationView {
  id: string;
  kind: "service_invitation";
  role: ServiceInvitationView["role"];
  state: ServiceInvitationView["state"];
  createdAt: string;
  unread: boolean;
}
export interface InvitationResult {
  id: string;
  state: string;
  version: number;
}

export interface InvitationPreview {
  id: string;
  role: "admin" | "operator";
  email: string;
  state: string;
  version: number;
  expiresAt: string;
  needsName: boolean;
  session: "match" | "mismatch" | "none";
}
export interface InvitationAcceptance {
  email: string;
  state: string;
  signedIn: boolean;
}

// Every action the operator audit records, grouped for the audit filter.
export const operatorAuditActions = [
  "admin.bootstrap_invited",
  "admin.recovery_invited",
  "account.suspend",
  "account.deactivate",
  "account.delete",
  "account.cancel_deletion",
  "account.deleted",
  "account.reactivate",
  "sessions.revoke",
  "collection.hold",
  "collection.release",
  "invitation.create",
  "invitation.resend",
  "invitation.cancel",
  "invitation.accept_requested",
  "invitation.verified",
  "invitation.decline",
  "operator.revoke",
  "account.handover",
  "accounts.list",
  "accounts.lookup",
  "collections.list",
  "account.read",
  "collection.inspect",
  "operators.list",
  "invitations.list",
  "sharing.list",
  "sharing.read",
  "sharing.analytics",
  "audit.read",
  "access.denied",
  "action.denied",
] as const;
export type OperatorAuditAction = (typeof operatorAuditActions)[number];
