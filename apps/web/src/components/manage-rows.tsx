import type {
  HubPerson,
  ManagedCollection,
  ManagedCollectionAction,
  OperatorAccount,
  ServiceInvitationView,
} from "@ntumie/types";
import { collectionActionPath } from "../lib/collection-action-path";
import { shortIds } from "../lib/short-id";
import { ActionPicker } from "./action-picker";
import { AuditIdValue } from "./audit-identity";
import { InvitationAction } from "./invitation-form";
import { LocalTime } from "./local-time";
import type { ManageRow } from "./manage-table";

const role = (a: OperatorAccount) => (a.admin ? "Admin" : a.operator ? "Operator" : "Member");

const delivery: Record<string, string> = {
  pending: "Queued",
  sent: "Sent",
  failed: "Failed",
  suppressed: "Suppressed",
  cancelled: "Cancelled",
  expired: "Expired",
};
const state: Record<ServiceInvitationView["state"], string> = {
  pending: "Pending",
  verifying: "Verifying",
  accepted: "Accepted",
  declined: "Declined",
  cancelled: "Revoked",
  expired: "Expired",
};

export function accountsRows(items: OperatorAccount[]): ManageRow[] {
  return items.map((a) => ({
    id: a.id,
    content: (
      <tr key={a.id} className="account-row">
        <td data-label="Account">
          <div className="ops-account-identity">
            <form action={`/manage/accounts/${a.id}`} method="get">
              <button type="submit" className="ops-primary account-open">
                {a.name || "Unnamed account"}
              </button>
            </form>
            <span className="ops-secondary">{a.username}</span>
          </div>
        </td>
        <td data-label="Email">{a.email}</td>
        <td data-label="Role">{role(a)}</td>
        <td data-label="Status">
          <span className={`ops-status ${a.state}`}>
            {{ active: "Active", inactive: "Inactive", suspended: "Suspended" }[a.state]}
          </span>
          {a.deletionScheduledFor && <span className="ops-secondary">Deletion scheduled</span>}
        </td>
        <td data-label="Member since">
          <LocalTime at={a.createdAt} variant="international" />
        </td>
        <td data-label="Last login">
          {a.lastLoginAt ? (
            <LocalTime at={a.lastLoginAt} variant="international" />
          ) : (
            "Not recorded"
          )}
        </td>
        <td data-label="Sessions">{a.sessions}</td>
      </tr>
    ),
  }));
}

export function peopleRows(items: HubPerson[]): ManageRow[] {
  return items.map((person) => ({
    id: person.userId,
    content: (
      <tr key={person.userId}>
        <td data-label="Username">
          <a className="ops-primary" href={`/${encodeURIComponent(person.username)}`}>
            {person.username}
          </a>
        </td>
        <td data-label="Collections">{person.collectionCount}</td>
      </tr>
    ),
  }));
}

export function teamRows(items: OperatorAccount[]): ManageRow[] {
  return items.map((a) => ({
    id: a.id,
    content: (
      <tr key={a.id}>
        <td data-label="Member">
          <a href={`/manage/accounts/${a.id}`} className="ops-primary">
            {a.name || a.email}
          </a>
          <span className="ops-secondary">{a.email}</span>
        </td>
        <td data-label="Role">{a.admin ? "Admin" : "Operator"}</td>
        <td className="ops-actions">
          {!a.admin && (
            <InvitationAction
              id={a.id}
              version={a.version}
              action="revoke"
              label="Remove"
              returnTo="/manage/team"
              compact
            />
          )}
        </td>
      </tr>
    ),
  }));
}

export function invitationsRows(items: ServiceInvitationView[]): ManageRow[] {
  return items.map((i) => {
    const open = i.role === "operator" && ["pending", "verifying", "expired"].includes(i.state);
    return {
      id: i.id,
      content: (
        <tr key={i.id}>
          <td data-label="Email">
            <span className="ops-primary">{i.email}</span>
            <span className="ops-secondary">{i.role === "admin" ? "Admin" : "Operator"}</span>
          </td>
          <td data-label="Status">{state[i.state]}</td>
          <td data-label="Delivery">{delivery[i.delivery ?? ""] ?? "—"}</td>
          <td data-label="Expires">
            <LocalTime at={i.expiresAt} />
          </td>
          <td className="ops-actions">
            {open && (
              <>
                <InvitationAction
                  id={i.id}
                  version={i.version}
                  action="resend"
                  label="Resend"
                  returnTo="/manage/invitations"
                  compact
                />
                <InvitationAction
                  id={i.id}
                  version={i.version}
                  action="cancel"
                  label="Revoke"
                  returnTo="/manage/invitations"
                  compact
                />
              </>
            )}
          </td>
        </tr>
      ),
    };
  });
}

export const collectionActionLabels: Record<ManagedCollectionAction, string> = {
  open: "View",
  edit: "Edit",
  add_link: "Add a link",
  history: "History",
  share: "Share",
  publish: "Publish",
  unpublish: "Unpublish",
  delete: "Delete",
  transfer: "Transfer ownership",
  hold: "Hold distribution",
  release: "Release hold",
};
export function managedCollectionsRows(
  items: ManagedCollection[],
  returnTo = "/manage/collections",
): ManageRow[] {
  const ids = shortIds(items.map((item) => item.id));
  return items.map((c) => ({
    id: c.id,
    content: (
      <tr key={c.id} className="collection-row">
        <td data-label="Collection">
          <ActionPicker
            label={`Actions for ${c.title ?? c.id}`}
            name={c.title ?? "Held collection"}
            options={c.availableActions.map((value) => ({
              href: collectionActionPath(c.id, value, returnTo),
              label: collectionActionLabels[value],
            }))}
          />
          <span className="ops-secondary">
            <AuditIdValue id={c.id} kind="Collection" display={ids.get(c.id)} />
          </span>
        </td>
        <td data-label="Hub">@{c.hubHandle}</td>
        <td data-label="Visibility">
          {c.visibility
            ? { published: "Published", link: "Link shared", private: "Private" }[c.visibility]
            : "Not available"}
        </td>
        <td data-label="Status">{c.held ? "On hold" : "Active"}</td>
        <td data-label="Updated">
          {c.updatedAt ? <LocalTime at={c.updatedAt} variant="international" /> : "—"}
        </td>
      </tr>
    ),
  }));
}
