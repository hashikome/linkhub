import { randomUUID } from "node:crypto";
import type { InvitationPreview } from "@linkhub/types";
import type { Metadata } from "next";
import { FormNotice } from "../../../components/form-notice";
import { LocalTime } from "../../../components/local-time";
import { NativeForm } from "../../../components/native-form";
import { readInvitationFlow } from "../../../lib/form-server";
import { queryValue } from "../../../lib/http";
import { invitationPreview } from "../../../lib/server-api";
export const metadata: Metadata = { title: "Review invitation" };
export const dynamic = "force-dynamic";
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const flow = await readInvitationFlow(),
    query = await searchParams;
  const result = flow ? await invitationPreview<InvitationPreview>(flow.token) : null;
  if (!result?.ok)
    return (
      <section className="reader feedback">
        <h1>Invitation unavailable</h1>
        <p>
          It may have expired or been replaced. Use the latest invitation email, or ask for a new
          one.
        </p>
        <p>
          Already accepted? <a href="/sign-in?returnTo=%2Fmanage">Sign in</a>
        </p>
      </section>
    );
  const invite = result.data;
  return (
    <section className="reader account-flow">
      <h1>{invite.role === "admin" ? "Become the service admin" : "Become a service operator"}</h1>
      <p className="invitation-for">
        Invitation for <strong>{invite.email}</strong>
      </p>
      <FormNotice code={queryValue(query.notice)} />
      {!["pending", "verifying"].includes(invite.state) ? (
        <>
          <p>This invitation is {invite.state}.</p>
          {invite.state === "accepted" && (
            <a href={invite.session === "match" ? "/manage" : "/sign-in?returnTo=%2Fmanage"}>
              Continue to management
            </a>
          )}
        </>
      ) : invite.session === "mismatch" ? (
        <>
          <p>
            You're signed in to a different account. Sign out to continue with the invited email.
            Your current account will not be changed.
          </p>
          <NativeForm action="/forms/invitation-sign-out">
            <button className="button" type="submit">
              Sign out and continue
            </button>
          </NativeForm>
        </>
      ) : invite.state === "verifying" ? (
        <>
          <p>You accepted this invitation. Verify a fresh email code to activate the role.</p>
          <NativeForm action="/forms/invitation-resume">
            <button type="submit" className="button">
              Send a verification code
            </button>
          </NativeForm>
        </>
      ) : (
        <>
          <p className="invitation-role">
            {invite.role === "admin"
              ? "Manage accounts and operators, and moderate public content."
              : "Help manage accounts and moderate public content."}{" "}
            Your actions are recorded. Private collections stay private.
          </p>
          <p className="meta">
            {invite.needsName
              ? "Accepting creates your account and emails you a code to verify it."
              : "Accepting signs you in with a code we email you."}{" "}
            Declining changes nothing. Respond by <LocalTime at={invite.expiresAt} />.
          </p>
          {/* One decision, two buttons: accepting continues to email
              verification, declining changes nothing. No terms to tick. */}
          <NativeForm action="/forms/invitation-respond">
            <input type="hidden" name="version" value={invite.version} />
            <input type="hidden" name="operationId" value={randomUUID()} />
            {invite.needsName && (
              <>
                <label htmlFor="invite-name">Your name</label>
                <input id="invite-name" name="name" required maxLength={255} autoComplete="name" />
              </>
            )}
            <div className="invitation-actions">
              <button className="button primary" type="submit" name="action" value="accept">
                Accept invitation
              </button>
              <button className="button" type="submit" name="action" value="decline" formNoValidate>
                Decline
              </button>
            </div>
          </NativeForm>
        </>
      )}
    </section>
  );
}
