import "server-only";
import { webServerConfig } from "@ntumie/config/web-server";
import { authenticatedFlow } from "./authenticated-flow";
import { completeSignIn } from "./complete-sign-in";
import { serverCookie } from "./cookies";
import { flowCookie, formPost, readFlow, redirectResponse, sealFlow } from "./form-server";
import { safeReturn } from "./http";
import { readPendingAction } from "./pending-action";
import { serverRead } from "./server-api";
import { readOwnProfile } from "./session";
import { resendTiming } from "./sign-in-flow";

const setupCookie = (value: string) => serverCookie("security_setup", value, value ? 300 : 0);
export async function securityForm(
  action: string,
  request: Request,
  form: URLSearchParams,
): Promise<Response | null> {
  const settings = "/settings/security";
  if (action === "email-start") {
    const intent = form.get("intent") === "sign-up" ? "sign-up" : "sign-in";
    const email = (form.get("email") ?? "").trim().toLowerCase();
    const returnTo = safeReturn(form.get("returnTo") ?? "/hub");
    const result = await formPost(request, "/api/v1/auth/sign-in/identify", { email }, true);
    if (!result.ok)
      return redirectResponse(
        `/${intent}?returnTo=${encodeURIComponent(returnTo)}&notice=${result.status === 400 ? "invalid" : "unavailable"}`,
        result.setCookies ?? [],
      );
    const pending = await readPendingAction();
    return redirectResponse("/sign-in/continue", [
      ...(result.setCookies ?? []),
      flowCookie(
        sealFlow({
          email,
          intent,
          returnTo,
          issued: Date.now(),
          purpose: pending?.target === returnTo ? "resume" : "sign-in",
        }),
      ),
      serverCookie(
        `${webServerConfig().publicOrigin.startsWith("https:") ? "__Secure-" : ""}better-auth.two_factor`,
        "",
        0,
      ),
    ]);
  }
  if (action === "google-cancel" || action === "email-registration-cancel") {
    const previous = await readFlow();
    const returnTo = safeReturn(previous?.returnTo ?? "/hub");
    const result = await formPost(
      request,
      action === "google-cancel"
        ? "/api/v1/auth/google-connection/cancel"
        : "/api/v1/auth/email-registration/cancel",
      {},
      true,
    );
    return redirectResponse(
      result.ok
        ? returnTo === "/hub"
          ? "/sign-in"
          : `/sign-in?returnTo=${encodeURIComponent(returnTo)}`
        : `/sign-up/confirm?method=${action === "google-cancel" ? "google" : "email"}&notice=unavailable`,
      result.ok ? [...(result.setCookies ?? []), flowCookie("", 0)] : [],
    );
  }
  if (action === "google-register" || action === "email-register") {
    const previous = await readFlow();
    const result = await formPost<{ user: { email: string } }>(
      request,
      action === "google-register"
        ? "/api/v1/auth/google-connection/register"
        : "/api/v1/auth/email-registration/confirm",
      {
        confirm: form.get("confirm") === "yes",
        ...(form.get("startHub") === "yes" ? { hubName: (form.get("hubName") ?? "").trim() } : {}),
      },
      true,
    );
    if (!result.ok || !result.data?.user.email)
      return redirectResponse(
        `/sign-up/confirm?method=${action === "google-register" ? "google" : "email"}&notice=${result.status === 404 ? "registration-expired" : result.status === 400 ? "registration-invalid" : "unavailable"}`,
      );
    return completeSignIn(
      request,
      {
        ...previous,
        email: result.data.user.email,
        returnTo: previous?.returnTo ?? "/hub",
        issued: previous?.issued ?? Date.now(),
      },
      result,
    );
  }
  if (action === "google-code-send") {
    const pending = await serverRead<{ email: string; registration: boolean }>(
      "/api/v1/auth/google-connection",
    );
    if (!pending.ok || pending.data.registration)
      return redirectResponse("/sign-in/google?notice=expired");
    const previous = await readFlow();
    const result = await formPost(
      request,
      "/api/v1/auth/code/send",
      { email: pending.data.email, googleConnection: true },
      true,
    );
    const flow = {
      ...previous,
      email: pending.data.email,
      returnTo: previous?.returnTo ?? "/hub",
      googleConnection: true,
      ...resendTiming(null, result, webServerConfig().codeResendSeconds),
    };
    return redirectResponse(
      `/sign-in/code?notice=${result.ok ? "sent" : result.status === 429 ? "limited" : "unavailable"}`,
      [flowCookie(sealFlow(flow)), ...(result.setCookies ?? [])],
    );
  }
  if (action === "auth-start" || action === "google-start" || action === "google-link") {
    const returnTo = safeReturn(form.get("returnTo") ?? "/hub");
    const clearFactor = serverCookie(
      `${webServerConfig().publicOrigin.startsWith("https:") ? "__Secure-" : ""}better-auth.two_factor`,
      "",
      0,
    );
    const pending = await readPendingAction();
    const flow = flowCookie(
      sealFlow({
        email: "",
        intent: form.get("intent") === "sign-up" ? "sign-up" : "sign-in",
        returnTo,
        issued: Date.now(),
        purpose: pending?.target === returnTo ? "resume" : "sign-in",
      }),
    );
    if (action === "auth-start")
      return Response.json(
        { ok: true, data: {} },
        {
          headers: [
            ["Set-Cookie", flow],
            ["Set-Cookie", clearFactor],
            ["Cache-Control", "no-store"],
          ],
        },
      );
    const result = await formPost<{ url: string }>(
      request,
      action === "google-link" ? "/api/v1/auth/link-social" : "/api/v1/auth/sign-in/social",
      { provider: "google" },
      true,
    );
    if (!result.ok || !result.data?.url)
      return redirectResponse(
        `${action === "google-link" ? settings : "/sign-in"}?notice=${!result.ok && result.code === "recent_auth_required" ? "security-reconfirm" : "google-failed"}`,
      );
    const target = new URL(result.data.url);
    if (target.origin !== "https://accounts.google.com")
      return redirectResponse("/sign-in?notice=google-failed");
    return redirectResponse(result.data.url, [
      ...(result.setCookies ?? []),
      ...(action === "google-start" ? [flow, clearFactor] : []),
    ]);
  }
  if (action === "auth-complete") {
    const flow = await authenticatedFlow();
    if (!flow) return redirectResponse("/sign-in?notice=expired");
    return completeSignIn(request, flow, { setCookies: [] });
  }

  if (action === "factor-verify") {
    const flow = await readFlow();
    if (!flow) return redirectResponse("/sign-in?notice=expired");
    const recovery = form.get("method") === "recovery";
    const code = recovery
      ? (form.get("code") ?? "").trim()
      : (form.get("code") ?? "").replace(/[\s-]/g, "");
    const result = await formPost<{ user: { email: string } }>(
      request,
      recovery
        ? "/api/v1/auth/two-factor/verify-backup-code"
        : "/api/v1/auth/two-factor/verify-totp",
      { code },
      true,
    );
    if (!result.ok)
      return redirectResponse(
        `/sign-in/factor?${recovery ? "method=recovery&" : ""}notice=${result.status === 429 ? "limited" : "invalid"}`,
      );
    return completeSignIn(
      request,
      { ...flow, email: result.data?.user.email ?? flow.email },
      result,
    );
  }
  if (action === "security-dismiss") return redirectResponse(settings, [setupCookie("")]);
  const paths = {
    "security-totp-start": "/api/v1/auth/security/totp/start",
    "security-totp-confirm": "/api/v1/auth/security/totp/confirm",
    "security-totp-remove": "/api/v1/auth/security/totp/remove",
    "security-recovery-rotate": "/api/v1/auth/security/recovery/rotate",
    "security-passkey-remove": "/api/v1/auth/security/passkey/remove",
    "security-google-remove": "/api/v1/auth/security/google/remove",
  } as const;
  const path = paths[action as keyof typeof paths];
  if (!path) return null;
  const body = action.endsWith("-remove")
    ? {
        confirm: form.get("confirm") === "yes",
        ...(action === "security-passkey-remove" ? { id: form.get("id") } : {}),
      }
    : action === "security-totp-confirm"
      ? { code: (form.get("code") ?? "").replace(/[\s-]/g, "") }
      : {};
  const result = await formPost<{ totpURI?: string; backupCodes?: string[] }>(
    request,
    path,
    body,
    true,
  );
  if (!result.ok)
    return redirectResponse(
      `${settings}?notice=${result.code === "recent_auth_required" ? "security-reconfirm" : result.status === 429 ? "limited" : "invalid"}`,
    );
  const set = result.setCookies ?? [];
  const profile = await readOwnProfile();
  if (result.data?.backupCodes && profile)
    set.push(
      setupCookie(
        sealFlow({ email: profile.email, returnTo: settings, issued: Date.now(), ...result.data }),
      ),
    );
  else if (action === "security-totp-confirm") {
    const previous = await readFlow("security_setup");
    if (previous)
      set.push(setupCookie(sealFlow({ ...previous, totpURI: undefined } as typeof previous)));
  } else set.push(setupCookie(""));
  return redirectResponse(`${settings}?notice=security-saved`, set);
}
