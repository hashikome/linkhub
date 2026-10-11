import { FormNotice } from "./form-notice";
import { GoogleSignIn } from "./google-sign-in";
import { NativeForm } from "./native-form";

export async function AuthEntry({
  intent,
  returnTo,
  notice,
  reason,
}: {
  intent: "sign-in" | "sign-up";
  returnTo: string;
  notice?: string;
  reason?: string;
}) {
  const signup = intent === "sign-up";
  return (
    <section className="account-flow verify auth-entry">
      <h1>{signup ? "Create your account" : "Sign in to linkhub"}</h1>
      {reason && <p className="verify-reason">{reason}</p>}
      <FormNotice code={notice} />
      <NativeForm action="/forms/email-start">
        <input type="hidden" name="intent" value={intent} />
        <input type="hidden" name="returnTo" value={returnTo} />
        <label htmlFor="email">Email address</label>
        <input id="email" name="email" type="email" autoComplete="email" required maxLength={254} />
        <button type="submit" className="button primary">
          Continue with email
        </button>
      </NativeForm>
      <GoogleSignIn returnTo={returnTo} intent={intent} />
      <div className="verify-footer">
        <p>
          {signup ? "Already have an account?" : "New here?"}{" "}
          <a href={`/${signup ? "sign-in" : "sign-up"}?returnTo=${encodeURIComponent(returnTo)}`}>
            {signup ? "Sign in" : "Create an account"}
          </a>
        </p>
        {notice === "signout-failed" && (
          <NativeForm action="/forms/sign-out">
            <button type="submit" className="text-button">
              Try signing out again
            </button>
          </NativeForm>
        )}
      </div>
    </section>
  );
}
