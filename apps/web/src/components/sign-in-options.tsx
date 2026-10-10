import { serverRead } from "../lib/server-api";
import { NativeForm } from "./native-form";
import { PasskeyButton } from "./passkey-button";

export async function SignInOptions({ returnTo }: { returnTo: string }) {
  const methods = await serverRead<{ google: boolean }>("/api/v1/auth/methods");
  return (
    <div className="signin-alternatives">
      <PasskeyButton returnTo={returnTo} />
      {methods.ok && methods.data.google && (
        <NativeForm action="/forms/google-start">
          <input type="hidden" name="returnTo" value={returnTo} />
          <button type="submit" className="button">
            Continue with Google
          </button>
          <p className="field-help">For existing accounts. Use email below to create an account.</p>
        </NativeForm>
      )}
      <p>Or continue with email</p>
    </div>
  );
}
