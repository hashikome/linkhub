import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { FormNotice } from "../../../components/form-notice";
import { NativeForm } from "../../../components/native-form";
import { PasskeyButton } from "../../../components/passkey-button";
import { readFlow } from "../../../lib/form-server";
import { queryValue } from "../../../lib/http";
export const metadata: Metadata = { title: "Confirm your sign-in" };
export const dynamic = "force-dynamic";
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const flow = await readFlow();
  if (!flow) redirect("/sign-in?notice=expired");
  const query = await searchParams;
  const recovery = queryValue(query.method) === "recovery";
  return (
    <section className="reader account-flow verify">
      <h1>Confirm your sign-in</h1>
      <p>
        Your account has extra protection. Use a registered passkey, or continue with your
        authenticator or a recovery code.
      </p>
      <FormNotice code={queryValue(query.notice)} />
      <PasskeyButton pending returnTo={flow.returnTo} />
      <NativeForm action="/forms/factor-verify">
        <input type="hidden" name="method" value={recovery ? "recovery" : "totp"} />
        <label htmlFor="factor-code">
          {recovery ? "Recovery code" : "Six-digit authenticator code"}
        </label>
        <input
          id="factor-code"
          name="code"
          autoComplete="one-time-code"
          autoCapitalize="none"
          spellCheck={false}
          inputMode={recovery ? "text" : "numeric"}
          required
          maxLength={recovery ? 11 : 12}
        />
        <button type="submit" className="button primary">
          Verify and continue
        </button>
      </NativeForm>
      <p>
        <a href={recovery ? "/sign-in/factor" : "/sign-in/factor?method=recovery"}>
          {recovery ? "Use an authenticator code" : "Use a recovery code"}
        </a>
      </p>
      <div className="verify-footer">
        {flow.googleConnection ? (
          <NativeForm action="/forms/google-cancel">
            <button type="submit" className="button">
              Cancel
            </button>
          </NativeForm>
        ) : (
          <a href="/sign-in">Start again</a>
        )}
        <a href="/support#account-recovery">Help with account recovery</a>
      </div>
    </section>
  );
}
