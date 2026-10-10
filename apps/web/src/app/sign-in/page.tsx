import type { Metadata } from "next";
import { NativeForm } from "../../components/native-form";
import { SignInOptions } from "../../components/sign-in-options";
import { VerifyStart } from "../../components/verification";
import { readDraft } from "../../lib/capture-server";
import { queryValue, safeReturn } from "../../lib/http";
import { readPendingAction } from "../../lib/pending-action";
import { type VerificationPurpose, verificationCopy } from "../../lib/verification";
export const metadata: Metadata = { title: "Sign in" };
export const dynamic = "force-dynamic";
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const query = await searchParams;
  const returnTo = safeReturn(queryValue(query.returnTo) ?? "/hub");
  const draftId = /^\/capture\/([a-f0-9-]{36})$/.exec(returnTo)?.[1];
  const [draft, pending] = await Promise.all([
    draftId ? readDraft(draftId) : null,
    readPendingAction(),
  ]);
  // The situation decides the words: a waiting first link, an action the
  // session interrupted, signing in to reach something, or plain sign-in.
  const purpose: VerificationPurpose = draft
    ? "first-link"
    : pending?.target === returnTo
      ? "resume"
      : queryValue(query.returnTo)
        ? "continue"
        : "sign-in";
  return (
    <VerifyStart
      alternatives={<SignInOptions returnTo={returnTo} />}
      copy={verificationCopy(purpose, { returnTo, action: pending?.label })}
      purpose={purpose}
      sendAction="/forms/code-send"
      returnTo={returnTo}
      notice={queryValue(query.notice)}
      footer={
        <>
          <a href={draft ? `/capture/${draft.id}` : "/discover"}>
            {draft ? "Back to your link" : "Back to Discover"}
          </a>
          <a href="/account">Reactivate an account or cancel deletion</a>
          {query.notice === "signout-failed" && (
            <NativeForm action="/forms/sign-out">
              <button type="submit" className="button">
                Try signing out again
              </button>
            </NativeForm>
          )}
        </>
      }
    />
  );
}
