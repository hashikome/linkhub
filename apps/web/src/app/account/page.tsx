import { type AccountAction, accountActions, type Profile } from "@linkhub/types";
import type { Metadata } from "next";
import { NativeForm } from "../../components/native-form";
import { readAccountFlow, readFlow } from "../../lib/form-server";
import { queryValue, safeReturn } from "../../lib/http";
import { serverRead } from "../../lib/server-api";

export const metadata: Metadata = { title: "Account access and deletion" };
export const dynamic = "force-dynamic";
const labels: Record<AccountAction, string> = {
  deactivate: "Deactivate account",
  delete: "Delete account",
  reactivate: "Reactivate account",
  cancel_deletion: "Cancel deletion",
};
const explanations: Record<AccountAction, string> = {
  deactivate:
    "Your profile and owned collections will be hidden, including from collaborators. Your data stays saved. You can reactivate later. All sessions and service privileges are revoked.",
  delete:
    "Your account will be deactivated now and permanently deleted after 14 days. Your hub and collections will be removed; contributions to other collections will lose your attribution. Your hub handle stays reserved. Export your collections and transfer any that others need before continuing. You can cancel deletion before the deadline.",
  reactivate:
    "Restore an account you deactivated yourself. Your profile and collections become available again, including existing sharing permissions. Old sessions and service privileges stay revoked. Sign in again afterward.",
  cancel_deletion:
    "Cancel a deletion you requested before the 14-day deadline. Your data stays saved and your account remains deactivated until you choose to reactivate it.",
};
const completed: Record<AccountAction, string> = {
  deactivate:
    "Your account is deactivated. Your data is retained and your hub handle remains reserved.",
  delete:
    "Your account is deactivated and deletion is scheduled in 14 days. Cancel before the deadline to keep your data.",
  reactivate: "Your account is active again. Sign in with a new code to continue.",
  cancel_deletion:
    "Deletion is cancelled. Your account remains deactivated; you can reactivate when ready.",
};
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const query = await searchParams;
  const [profile, flow, recovery] = await Promise.all([
    serverRead<Profile>("/api/v1/profile"),
    readAccountFlow(),
    serverRead<{
      action: "reactivate" | "cancel_deletion";
      email: string;
      deletionScheduledFor: string | null;
    }>("/api/v1/auth/account/recovery"),
  ]);
  const done = accountActions.find((value) => value === queryValue(query.done));
  // Recovery proves its own identity, which can differ from the current session.
  if (recovery.ok || !profile.ok || done === "reactivate" || done === "cancel_deletion") {
    const signIn = await readFlow();
    const returnTo = safeReturn(signIn?.returnTo ?? "/hub");
    const signInHref = `/sign-in?returnTo=${encodeURIComponent(returnTo)}`;
    const saving = returnTo.startsWith("/capture/");
    return (
      <section className="reader account-flow verify">
        <h1>
          {recovery.ok ? labels[recovery.data.action] : done ? labels[done] : "Sign in to continue"}
        </h1>
        {query.notice && (
          <p role="alert" className="form-notice error">
            {query.notice === "expired"
              ? "This confirmation expired. Sign in again to continue."
              : "We couldn't confirm the result. Please try again."}
          </p>
        )}
        {recovery.ok ? (
          <>
            <p className="verify-reason">
              {recovery.data.action === "reactivate"
                ? `Your account is deactivated. Reactivate it before ${saving ? "saving your link" : "signing in"}.`
                : `Your account is scheduled for deletion. Cancel deletion to keep your account${saving ? " and return to saving your link" : ""}.`}
            </p>
            <p className="verify-detail">{recovery.data.email}</p>
            <p>
              {recovery.data.action === "reactivate"
                ? "Your profile and collections will become available again. Sign in again afterward to continue."
                : "Cancelling keeps your data. Your account stays deactivated until you reactivate it."}
            </p>
            <NativeForm action="/forms/account-recover">
              <input type="hidden" name="confirm" value="yes" />
              <div className="verify-actions">
                <button type="submit" className="button primary">
                  {labels[recovery.data.action]}
                </button>
              </div>
            </NativeForm>
            <div className="verify-footer">
              <a href={signInHref}>Back to sign in</a>
            </div>
          </>
        ) : (
          <>
            <p role={done ? "status" : undefined}>
              {done
                ? completed[done]
                : "Sign in with your email. If your account needs reactivation or a deletion needs cancelling, we'll guide you after verifying your email."}
            </p>
            <a className="button primary" href={signInHref}>
              Continue to sign in
            </a>
          </>
        )}
      </section>
    );
  }
  const verifying = queryValue(query.step) === "verify" && flow;
  const selected = verifying
    ? flow.action
    : accountActions.find((value) => value === queryValue(query.action));
  const actions: AccountAction[] = ["deactivate", "delete"];
  const notice = queryValue(query.notice);
  return (
    <section className="reader account-lifecycle">
      <a className="back-link" href="/settings">
        Back to Settings
      </a>
      <h1>{selected ? labels[selected] : "Account access and deletion"}</h1>
      {done && (
        <p role="status" className="form-notice">
          {completed[done]}
        </p>
      )}
      {notice && (
        <p role="alert" className="form-notice error">
          {notice === "limited"
            ? "Too many attempts. Wait before requesting another code."
            : notice === "signin-required"
              ? "Your session ended. Sign in again before requesting this account action."
              : notice === "expired"
                ? "This confirmation expired. Request a new code."
                : notice === "invalid"
                  ? "The code is incorrect, expired, or this action is no longer available. Request a new code or contact support."
                  : "We couldn't confirm the result. Check your account state before trying again."}
        </p>
      )}
      {selected ? (
        <>
          <p>{explanations[selected]}</p>
          {verifying ? (
            <>
              <p>
                If this action is available, a code was sent to your account email. Enter it to
                confirm <strong>{labels[selected].toLowerCase()}</strong>.
              </p>
              <NativeForm action="/forms/account-confirm">
                <input type="hidden" name="accountFlowId" value={flow.id} />
                <input type="hidden" name="accountAction" value={selected} />
                <label htmlFor="account-code">Verification code</label>
                <input
                  id="account-code"
                  name="code"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  required
                  maxLength={32}
                />
                <button
                  type="submit"
                  className={`button ${selected === "delete" ? "danger" : "primary"}`}
                >
                  Confirm: {labels[selected].toLowerCase()}
                </button>
              </NativeForm>
              <a href={`/account?action=${selected}`}>Request a new code</a>
            </>
          ) : actions.includes(selected) ? (
            <NativeForm action="/forms/account-send">
              <input type="hidden" name="accountAction" value={selected} />
              <p>We’ll send a confirmation code to {profile.data.email}.</p>
              <button type="submit" className="button">
                Send confirmation code
              </button>
            </NativeForm>
          ) : (
            <p>
              <a href="/sign-in?returnTo=%2Faccount">Sign in</a> before starting this action. For
              operator restrictions, <a href="/support">contact support</a>.
            </p>
          )}
          <p>
            <a href="/account">Back to account options</a>
          </p>
        </>
      ) : (
        actions.map((action) => (
          <section key={action} className="account-field-group">
            <h2>{labels[action]}</h2>
            <p>{explanations[action]}</p>
            <a className="button" href={`/account?action=${action}`}>
              {labels[action]}
            </a>
          </section>
        ))
      )}
    </section>
  );
}
