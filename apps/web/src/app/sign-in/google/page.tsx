import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { FormNotice } from "../../../components/form-notice";
import { NativeForm } from "../../../components/native-form";
import { PasskeyButton } from "../../../components/passkey-button";
import { VerifyStart } from "../../../components/verification";
import { queryValue } from "../../../lib/http";
import { serverRead } from "../../../lib/server-api";
import { googleConnectionCopy } from "../../../lib/verification";

export const metadata: Metadata = { title: "Continue signing in" };
export const dynamic = "force-dynamic";
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const pending = await serverRead<{ email: string; registration: boolean }>(
    "/api/v1/auth/google-connection",
  );
  if (!pending.ok)
    return (
      <section className="reader account-flow verify">
        <h1>Continue signing in</h1>
        <FormNotice code={pending.status === 404 ? "expired" : "unavailable"} />
        <NativeForm action="/forms/google-cancel">
          <button type="submit" className="button">
            Back to sign in
          </button>
        </NativeForm>
      </section>
    );
  const notice = queryValue((await searchParams).notice);
  if (pending.data.registration)
    redirect(
      `/sign-up/confirm?method=google${notice ? `&notice=${encodeURIComponent(notice)}` : ""}`,
    );
  return (
    <VerifyStart
      copy={googleConnectionCopy}
      alternatives={<PasskeyButton googleConnection email={pending.data.email} />}
      purpose="sign-in"
      email={pending.data.email}
      sendAction="/forms/google-code-send"
      cancelAction="/forms/google-cancel"
      notice={notice}
    />
  );
}
