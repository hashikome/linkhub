import "server-only";
import { readDraft, saveDraft } from "./capture-server";
import { flowCookie, formPost, invitationCookie, redirectResponse } from "./form-server";
import { authCookies } from "./http";
import {
  accountFingerprint,
  lastAccountCookie,
  pendingActionCookie,
  readPendingAction,
} from "./pending-action";
import type { SignInFlow } from "./sign-in-flow";
export async function completeSignIn(
  request: Request,
  flow: SignInFlow,
  result: { setCookies?: string[] },
) {
  const verified = result.setCookies?.length
    ? result.setCookies.map((cookie) => cookie.split(";")[0]).join("; ")
    : authCookies(request.headers.get("cookie") ?? "");
  // Confirmed: run the action that asked for it, with the new session.
  if (flow.purpose === "confirm" || flow.purpose === "resume") {
    const pending = await readPendingAction();
    const done = [...(result.setCookies ?? []), flowCookie("", 0), lastAccountCookie(flow.email)];
    // Keep shared recovery data until replay returns, including if this request
    // is interrupted before the API command can run.
    const finish = async (target: string) =>
      redirectResponse(target, [...done, await pendingActionCookie(null)]);
    // A waiting action runs only for the person it belongs to.
    if (
      !pending ||
      pending.target !== flow.returnTo ||
      pending.owner !== accountFingerprint(flow.email)
    )
      return finish(flow.returnTo);
    const headers = new Headers(request.headers);
    headers.set("cookie", verified);
    const replay = await formPost<{ token?: string }>(
      new Request(request.url, { headers }),
      pending.path,
      pending.body,
      false,
      pending.method ?? "POST",
    );
    if (replay.ok && pending.result === "collection-link" && replay.data?.token) {
      const destination = new URL(pending.target, "http://local.invalid");
      destination.searchParams.set("s", replay.data.token);
      destination.searchParams.set("notice", "done");
      return finish(destination.pathname + destination.search);
    }
    const lifecycle = /^\/api\/v1\/collections\/([a-f0-9-]{36})(\/transfer)?$/.exec(pending.path);
    if (
      !replay.ok &&
      replay.code === "version_conflict" &&
      lifecycle &&
      (pending.method === "DELETE" || lifecycle[2])
    )
      return finish(
        `/c/${lifecycle[1]}/actions?action=${lifecycle[2] ? "transfer" : "delete"}&notice=impact-changed`,
      );
    const join = pending.target.includes("?") ? "&" : "?";
    const notice = replay.ok
      ? (pending.success ?? "done")
      : replay.status === 409
        ? "conflict"
        : replay.status === 403
          ? "forbidden"
          : replay.status === 429
            ? "limited"
            : "unavailable";
    return finish(
      `${pending.target}${join}notice=${notice}${pending.anchor ? `#${pending.anchor}` : ""}`,
    );
  }
  const captureId = /^\/capture\/([a-f0-9-]{36})$/.exec(flow.returnTo)?.[1];
  if (!flow.invitationToken && captureId) {
    const draft = await readDraft(captureId);
    if (draft) {
      const headers = new Headers(request.headers);
      headers.set("cookie", verified);
      return saveDraft(new Request(request.url, { headers }), draft, [
        ...(result.setCookies ?? []),
        flowCookie("", 0),
        lastAccountCookie(flow.email),
      ]);
    }
  }
  return redirectResponse(flow.returnTo, [
    ...(result.setCookies ?? []),
    flowCookie("", 0),
    lastAccountCookie(flow.email),
    ...(flow.invitationToken ? [invitationCookie("", 0)] : []),
  ]);
}
