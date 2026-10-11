import type { AccountOperationAction, OperatorAccount } from "@linkhub/types";

export function availableAccountActions(
  account: Pick<
    OperatorAccount,
    "id" | "state" | "sessions" | "operator" | "admin" | "deletionScheduledFor"
  >,
  actor?: { userId: string; admin: boolean },
): AccountOperationAction[] {
  if (
    !actor ||
    (!actor.admin && (account.operator || account.admin) && actor.userId !== account.id)
  )
    return [];
  const actions: AccountOperationAction[] = account.sessions > 0 ? ["sessions.revoke"] : [];
  if (account.admin || account.id === actor.userId) return actions;
  if (account.deletionScheduledFor)
    return actor.admin ? [...actions, "account.cancel_deletion"] : actions;
  if (account.state === "active") actions.push("account.deactivate", "account.suspend");
  else {
    actions.push("account.reactivate");
    if (account.state === "inactive") actions.push("account.suspend");
  }
  if (actor.admin) actions.push("account.delete");
  return actions;
}
