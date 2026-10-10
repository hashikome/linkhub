import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { ResumeSignIn } from "../../../components/resume-sign-in";
import { authenticatedFlow } from "../../../lib/authenticated-flow";

export const metadata: Metadata = { title: "Returning to your action" };
export const dynamic = "force-dynamic";
export default async function Page() {
  if (!(await authenticatedFlow())) redirect("/sign-in?notice=expired");
  return (
    <section className="reader account-flow verify">
      <ResumeSignIn />
    </section>
  );
}
