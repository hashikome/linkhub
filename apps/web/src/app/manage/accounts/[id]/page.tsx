import type { AccountOperationAction, OperatorAccountDetail, SessionView } from "@nslinkhub/types";
import type { Metadata } from "next";
import { FormNotice } from "../../../../components/form-notice";
import { InvitationAction } from "../../../../components/invitation-form";
import { LocalTime } from "../../../../components/local-time";
import { OperatorFailure } from "../../../../components/operator-failure";
import {
  accountActionLabels,
  OperationForm,
  OperatorNav,
} from "../../../../components/operator-ui";
import { TimeZoneFallbackNote } from "../../../../components/time-zone";
import { failure, queryValue } from "../../../../lib/http";
import { operatorRead } from "../../../../lib/operator-read";
import { serverRead } from "../../../../lib/server-api";
import { isUuid } from "../../../../lib/validation";
export const metadata: Metadata = { title: "Account details" };
export const dynamic = "force-dynamic";
export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { id } = await params,
    query = await searchParams;
  if (!isUuid(id)) return <OperatorFailure error={failure("not_found", 404)} />;
  const result = await operatorRead<OperatorAccountDetail | null>(
    `/api/v1/operations/accounts/${id}`,
    `/manage/accounts/${id}`,
  );
  if (!result.ok) return <OperatorFailure error={result} />;
  if (!result.data) return <OperatorFailure error={failure("not_found", 404)} />;
  const a = result.data,
    session = await serverRead<SessionView>("/api/v1/session");
  const requestedAction = queryValue(query.action) as AccountOperationAction | undefined;
  const selectedAction =
    requestedAction && a.availableActions.includes(requestedAction) ? requestedAction : undefined;
  return (
    <section className="reader ops-page account-profile">
      <OperatorNav current="accounts" />
      <header className="account-profile-heading">
        <h1>{a.name || "Account details"}</h1>
        <a href={`/${encodeURIComponent(a.username)}`}>{a.username}</a>
      </header>
      <FormNotice code={queryValue(query.notice)} />
      <TimeZoneFallbackNote />
      <dl className="account-details">
        <dt>User ID</dt>
        <dd>{a.id}</dd>
        <dt>Email</dt>
        <dd>
          {a.email} ({a.emailVerified ? "verified" : "unverified"})
        </dd>
        <dt>Hub</dt>
        <dd>{a.hub ? <a href={`/h/${a.hub.id}`}>{a.hub.name}</a> : "No hub"}</dd>
        <dt>Bio</dt>
        <dd>{a.bio || "Not provided"}</dd>
        <dt>Role</dt>
        <dd>{a.admin ? "Admin" : a.operator ? "Operator" : "Member"}</dd>
        <dt>Status</dt>
        <dd>{{ active: "Active", inactive: "Inactive", suspended: "Suspended" }[a.state]}</dd>
        {a.state === "suspended" && (
          <>
            <dt>Suspended</dt>
            <dd>
              {a.suspendedAt ? (
                <LocalTime at={a.suspendedAt} variant="international" />
              ) : (
                "Not recorded"
              )}
            </dd>
            <dt>Suspension reason</dt>
            <dd>{a.suspensionReason?.replaceAll("_", " ") || "Not recorded"}</dd>
          </>
        )}
        {a.deletionScheduledFor && (
          <>
            <dt>Deletion scheduled</dt>
            <dd>
              <LocalTime at={a.deletionScheduledFor} variant="international" />
            </dd>
          </>
        )}
        <dt>Member since</dt>
        <dd>
          <LocalTime at={a.createdAt} variant="international" />
        </dd>
        <dt>Account updated</dt>
        <dd>
          <LocalTime at={a.updatedAt} variant="international" />
        </dd>
        <dt>Last login</dt>
        <dd>
          {a.lastLoginAt ? (
            <LocalTime at={a.lastLoginAt} variant="international" />
          ) : (
            "Not recorded"
          )}
        </dd>
        <dt>Active sessions</dt>
        <dd>{a.sessions}</dd>
      </dl>
      <section className="operation-section" aria-labelledby="active-sessions-heading">
        <h2 id="active-sessions-heading">Active sessions</h2>
        {a.activeSessions.length === 0 ? (
          <p>No active sessions.</p>
        ) : (
          <>
            {a.sessions > a.activeSessions.length && (
              <p className="meta">
                Showing the newest {a.activeSessions.length} of {a.sessions} active sessions.
              </p>
            )}
            <table className="ops-table">
              <thead>
                <tr>
                  <th scope="col">Session</th>
                  <th scope="col">Started</th>
                  <th scope="col">Last verified</th>
                  <th scope="col">Expires</th>
                </tr>
              </thead>
              <tbody>
                {a.activeSessions.map((s) => (
                  <tr key={s.id}>
                    <td data-label="Session">
                      <div>
                        <span title={s.id}>{s.id.split("-").at(-1)}</span>
                        {s.current && <span className="ops-secondary">Your current session</span>}
                      </div>
                    </td>
                    <td data-label="Started">
                      <LocalTime at={s.createdAt} variant="international" />
                    </td>
                    <td data-label="Last verified">
                      {s.verifiedAt ? (
                        <LocalTime at={s.verifiedAt} variant="international" />
                      ) : (
                        "Not recorded"
                      )}
                    </td>
                    <td data-label="Expires">
                      <LocalTime at={s.expiresAt} variant="international" />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        )}
      </section>
      <section id="account-action" className="operation-section">
        <h2>Account actions</h2>
        <div className="account-actions">
          {a.availableActions.map((action) => (
            <a
              className="button"
              key={action}
              href={`/manage/accounts/${id}?${new URLSearchParams({ action })}#account-action`}
            >
              {accountActionLabels[action]}
            </a>
          ))}
          {a.availableActions.length === 0 && <p className="meta">No available actions.</p>}
        </div>
        {requestedAction && !selectedAction && (
          <p role="status">
            That action is no longer available. Choose one of the available actions.
          </p>
        )}
        {selectedAction && (
          <OperationForm
            action={selectedAction}
            targetId={id}
            version={a.version}
            label={actionDetails[selectedAction].label}
            consequence={actionDetails[selectedAction].consequence}
          />
        )}
      </section>
      {session.ok && session.data.admin && a.operator && !a.admin && (
        <section className="operation-section">
          <h2>Remove operator access</h2>
          <p>
            The account stays active. Restoring this role requires a new invitation and acceptance.
          </p>
          <InvitationAction
            id={id}
            version={a.version}
            action="revoke"
            label="Remove operator access"
            returnTo={`/manage/accounts/${id}`}
          />
        </section>
      )}
      <p className="account-history">
        <a href={`/manage/audit?${new URLSearchParams({ targetId: id })}`}>
          View this account's audit history
        </a>
      </p>
    </section>
  );
}

const actionDetails: Record<AccountOperationAction, { label: string; consequence: string }> = {
  "sessions.revoke": {
    label: "End all sessions",
    consequence:
      "Sign this account out on every device. An active account can sign in again. If this is your account, you will also be signed out.",
  },
  "account.suspend": {
    label: "Suspend account",
    consequence:
      "Block sign-in, end all sessions and remove operator access. Hide the account's hub and shared content from others. Its records and settings are preserved.",
  },
  "account.deactivate": {
    label: "Deactivate account",
    consequence:
      "Make this account inactive, block sign-in, end all sessions and remove operator access. Its hub and shared content become unavailable to others. Reactivation requires an explicit action.",
  },
  "account.reactivate": {
    label: "Reactivate account",
    consequence:
      "Allow fresh sign-in. Existing publication and sharing may become available again, except for collections still on hold. Revoked sessions and operator access stay revoked.",
  },
  "account.delete": {
    label: "Delete account",
    consequence:
      "Deactivate this account immediately and schedule permanent deletion in 14 days. This deletes the account, its hub and owned collections. Contributions to other hubs remain without the account identity. An admin can cancel before deletion; completed deletion cannot be undone.",
  },
  "account.cancel_deletion": {
    label: "Cancel deletion",
    consequence:
      "Cancel the scheduled permanent deletion. The account stays inactive. Reactivate it separately if access should be restored.",
  },
};
