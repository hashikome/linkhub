import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { NativeForm } from "../../../components/native-form";
import { readFlow } from "../../../lib/form-server";
import { readOwnProfile } from "../../../lib/session";
export const metadata: Metadata = { title: "Continue signing in" };
export const dynamic = "force-dynamic";
export default async function Page() {
  if (!(await readFlow()) || !(await readOwnProfile())) redirect("/sign-in?notice=expired");
  return (
    <section className="reader account-flow verify">
      <h1>Continue signing in</h1>
      <p>Your sign-in has been verified. Continue to return to what you were doing.</p>
      <NativeForm action="/forms/auth-complete">
        <button type="submit" className="button primary">
          Continue
        </button>
      </NativeForm>
    </section>
  );
}
