import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { NativeForm } from "../../../components/native-form";
import { PasskeyButton } from "../../../components/passkey-button";
import { readFlow } from "../../../lib/form-server";

export const metadata: Metadata = { title: "Continue signing in" };
export const dynamic = "force-dynamic";
export default async function Page() {
  const flow = await readFlow();
  if (!flow?.email || flow.invitationToken || flow.googleConnection) redirect("/sign-in");
  return (
    <section className="reader account-flow verify">
      <h1>{flow.intent === "sign-up" ? "Verify your email" : "Continue signing in"}</h1>
      <p className="verify-reason">
        For <strong>{flow.email}</strong>
      </p>
      <p>Already have a passkey for this account? Use your device to sign in.</p>
      <PasskeyButton email={flow.email} returnTo={flow.returnTo} />
      <NativeForm action="/forms/code-send">
        <input type="hidden" name="email" value={flow.email} />
        <input type="hidden" name="returnTo" value={flow.returnTo} />
        <p className="verify-detail">
          {flow.intent === "sign-up"
            ? "Verify your email, then finish creating your account. If you already have one, we’ll sign you in."
            : "Or get a code in your inbox to continue."}
        </p>
        <button type="submit" className="button">
          Send code
        </button>
      </NativeForm>
      <div className="verify-footer">
        <a
          href={`/${flow.intent === "sign-up" ? "sign-up" : "sign-in"}?returnTo=${encodeURIComponent(flow.returnTo)}`}
        >
          Use a different email
        </a>
      </div>
    </section>
  );
}
