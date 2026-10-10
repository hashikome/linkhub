import { authenticatedFlow } from "../../../lib/authenticated-flow";
import { completeSignIn } from "../../../lib/complete-sign-in";
import { redirectResponse } from "../../../lib/form-server";

export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  const flow = await authenticatedFlow();
  if (!flow) return redirectResponse("/sign-in?notice=expired");
  // Navigation finishes immediately. Replaying an interrupted write remains POST.
  if (
    flow.purpose === "resume" ||
    flow.purpose === "confirm" ||
    /^\/capture\/[a-f0-9-]{36}$/.test(flow.returnTo)
  )
    return redirectResponse("/sign-in/resume");
  return completeSignIn(request, flow, { setCookies: [] });
}
