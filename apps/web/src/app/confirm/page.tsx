import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { VerifyStart } from "../../components/verification";
import { readPendingAction } from "../../lib/pending-action";
import { readSession } from "../../lib/session";
import { verificationCopy } from "../../lib/verification";
export const metadata: Metadata = { title: "Confirm it's you" };
export const dynamic = "force-dynamic";

// Step-up for sensitive actions: the person is signed in, so the code goes to
// their own address; nothing is sent until they choose to. Cancel drops the
// waiting action and returns to where it started.
export default async function Page() {
  const [session, pending] = await Promise.all([readSession(), readPendingAction()]);
  if (!session) redirect("/sign-in?notice=signin");
  if (!pending) redirect("/manage");
  return (
    <VerifyStart
      copy={verificationCopy("confirm", { action: pending.label })}
      purpose="confirm"
      email={session.email}
      sendAction="/forms/confirm-send"
      cancelAction="/forms/confirm-cancel"
    />
  );
}
