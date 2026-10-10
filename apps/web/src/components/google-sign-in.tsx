import { serverRead } from "../lib/server-api";
import { NativeForm } from "./native-form";
export async function GoogleSignIn({
  returnTo,
  intent = "sign-in",
}: {
  returnTo: string;
  intent?: "sign-in" | "sign-up";
}) {
  const methods = await serverRead<{ google: boolean }>("/api/v1/auth/methods");
  if (!methods.ok || !methods.data.google) return null;
  return (
    <>
      <div className="auth-divider">
        <span>or</span>
      </div>
      <NativeForm action="/forms/google-start">
        <input type="hidden" name="returnTo" value={returnTo} />
        <input type="hidden" name="intent" value={intent} />
        <button type="submit" className="button">
          Continue with Google
        </button>
      </NativeForm>
    </>
  );
}
