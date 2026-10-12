import { randomUUID } from "node:crypto";
import type { AccountOperationAction, OperationAction, OperationReason } from "@ntumie/types";
import { readSession } from "../lib/session";
import { ManageNavigation, type OpsTab } from "./manage-navigation";
import { NativeForm } from "./native-form";

export async function OperatorNav() {
  const session = await readSession();
  if (!session) return null;
  const { operator, admin, hubId } = session;
  const tabs: [OpsTab, string, string][] = [];
  if (operator) tabs.push(["accounts", "/manage", "Accounts"]);
  if (hubId) tabs.push(["people", "/manage/people", "Access"]);
  if (operator || hubId) tabs.push(["collections", "/manage/collections", "Collections"]);
  if (hubId) tabs.push(["imports", "/manage/import-export", "Import"]);
  if (admin)
    tabs.push(
      ["team", "/manage/team", "Team"],
      ["invitations", "/manage/invitations", "Invitations"],
    );
  if (operator || admin) tabs.push(["analytics", "/manage/analytics", "Analytics"]);
  if (operator || hubId) tabs.push(["audit", "/manage/audit", "Audit Log"]);
  return tabs.length ? <ManageNavigation tabs={tabs} /> : null;
}

const choices: Record<OperationAction, OperationReason[]> = {
  "account.suspend": ["spam", "harmful_content", "account_compromise", "owner_request"],
  "account.deactivate": ["owner_request", "access_administration"],
  "account.delete": ["owner_request", "spam", "harmful_content", "access_administration"],
  "account.cancel_deletion": ["owner_request", "mistake_corrected", "review_completed"],
  "account.reactivate": ["review_completed", "mistake_corrected", "owner_request"],
  "sessions.revoke": ["account_compromise", "owner_request", "access_administration"],
  "collection.hold": ["spam", "harmful_content", "owner_request"],
  "collection.release": ["review_completed", "mistake_corrected", "owner_request"],
};
const labels: Record<OperationReason, string> = {
  spam: "Spam",
  harmful_content: "Harmful content",
  account_compromise: "Account compromise",
  owner_request: "Owner request",
  mistake_corrected: "Mistake corrected",
  review_completed: "Review completed",
  access_administration: "Access administration",
};
const restrictive = (action: OperationAction) =>
  ["account.suspend", "account.deactivate", "account.delete", "collection.hold"].includes(action);

export const accountActionLabels: Record<AccountOperationAction, string> = {
  "sessions.revoke": "Sign out everywhere",
  "account.deactivate": "Deactivate",
  "account.suspend": "Suspend",
  "account.reactivate": "Reactivate",
  "account.delete": "Delete account",
  "account.cancel_deletion": "Cancel deletion",
};

// The fields every operation submits. The required reason plus a clearly
// labelled button is the deliberate step; there is no extra confirmation box.
function OperationFields({
  action,
  targetId,
  version,
  label,
}: {
  action: OperationAction;
  targetId: string;
  version: number;
  label: string;
}) {
  const field = `${action}-reason`;
  return (
    <>
      <input type="hidden" name="action" value={action} />
      <input type="hidden" name="targetId" value={targetId} />
      <input type="hidden" name="version" value={version} />
      <input type="hidden" name="operationId" value={randomUUID()} />
      <label htmlFor={field}>Reason</label>
      <select id={field} name="reason" required defaultValue="">
        <option value="" disabled>
          Select a reason
        </option>
        {choices[action].map((reason) => (
          <option key={reason} value={reason}>
            {labels[reason]}
          </option>
        ))}
      </select>
      <button type="submit" className={`button ${restrictive(action) ? "danger" : ""}`}>
        {label}
      </button>
    </>
  );
}

// A full section on an account or collection page.
export function OperationForm({
  action,
  targetId,
  version,
  label,
  consequence,
}: {
  action: OperationAction;
  targetId: string;
  version: number;
  label: string;
  consequence: string;
}) {
  return (
    <section className="operation-section">
      <h2>{label}</h2>
      <p>{consequence}</p>
      <NativeForm action="/forms/operation">
        <OperationFields action={action} targetId={targetId} version={version} label={label} />
      </NativeForm>
    </section>
  );
}
