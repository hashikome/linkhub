import type { Metadata } from "next";
import { FormNotice } from "../../../components/form-notice";
import { NativeForm } from "../../../components/native-form";
import { SignupHub } from "../../../components/signup-hub";
import { readFlow } from "../../../lib/form-server";
import { queryValue } from "../../../lib/http";
import { serverRead } from "../../../lib/server-api";
export const metadata: Metadata = { title: "Create your account" };
export const dynamic = "force-dynamic";
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const query = await searchParams;
  const signup = (await readFlow())?.intent === "sign-up";
  const google = query.method === "google";
  const pending = await serverRead<{ email: string; registration?: boolean }>(
    google ? "/api/v1/auth/google-connection" : "/api/v1/auth/email-registration",
  );
  const ready = pending.ok && (!google || pending.data.registration);
  return (
    <section className="account-flow verify">
      <h1>Create your account</h1>
      {ready && (
        <>
          <p className="verify-reason">
            {signup ? "Your account will use " : "There isn’t a linkhub account for "}
            <strong>{pending.data.email}</strong>
            {signup ? "." : " yet."}
          </p>
        </>
      )}
      <FormNotice
        code={
          ready
            ? queryValue(query.notice)
            : !pending.ok && pending.status !== 404
              ? "unavailable"
              : "registration-expired"
        }
      />
      {ready && (
        <NativeForm action={google ? "/forms/google-register" : "/forms/email-register"}>
          <input type="hidden" name="confirm" value="yes" />
          <SignupHub />
          <div className="verify-actions">
            <button type="submit" className="button primary">
              Create account
            </button>
          </div>
        </NativeForm>
      )}
      <div className="verify-footer">
        <NativeForm action={google ? "/forms/google-cancel" : "/forms/email-registration-cancel"}>
          <p>
            {signup && <>Already have an account? </>}
            <button type="submit" className="text-button">
              {signup ? "Sign in" : "Use a different email"}
            </button>
          </p>
        </NativeForm>
      </div>
    </section>
  );
}
