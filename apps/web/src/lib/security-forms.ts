import "server-only";
import { webServerConfig } from "@nslinkhub/config/web-server";
import { completeSignIn } from "./complete-sign-in";
import { serverCookie } from "./cookies";
import { flowCookie, formPost, readFlow, redirectResponse, sealFlow } from "./form-server";
import { safeReturn } from "./http";
import { readPendingAction } from "./pending-action";
import type { SecurityStatus } from "./security-types";
import { serverRead } from "./server-api";
import { readOwnProfile } from "./session";

const setupCookie = (value: string) => serverCookie("security_setup", value, value ? 300 : 0);
export async function securityForm(
  action: string,
  request: Request,
  form: URLSearchParams,
): Promise<Response | null> {
  const settings = "/settings/security";
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
    const flow = await readFlow();
    const [profile, status] = await Promise.all([
      readOwnProfile(),
      serverRead<SecurityStatus>("/api/v1/auth/security/status"),
    ]);
    if (
      !profile ||
      !flow ||
      !status.ok ||
      !status.data.verifiedAt ||
      Date.parse(status.data.verifiedAt) < flow.issued - 1000
    )
      return redirectResponse("/sign-in?notice=expired");
    return completeSignIn(request, { ...flow, email: profile.email }, { setCookies: [] });
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
