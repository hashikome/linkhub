import "server-only";
import { webServerConfig } from "@nslinkhub/config/web-server";
import { type AccountAction, accountActions } from "@nslinkhub/types";
import { cookies } from "next/headers";
import { serverCookie } from "./cookies";
import { type ApiPath, authCookies, postJson, safePath } from "./http";
import { openSignInFlow, type SignInFlow, sealSignInFlow } from "./sign-in-flow";

export function sealFlow(flow: SignInFlow) {
  return sealSignInFlow(flow, webServerConfig().sourceSecret);
}
export async function readFlow(cookieName = "sign_in_flow"): Promise<SignInFlow | null> {
  return openSignInFlow((await cookies()).get(cookieName)?.value, webServerConfig().sourceSecret);
}
export async function formData(request: Request): Promise<URLSearchParams> {
  if (
    request.headers.get("origin") !== webServerConfig().publicOrigin ||
    request.headers.get("sec-fetch-site") === "cross-site"
  )
    throw new Error("origin");
  if (!request.headers.get("content-type")?.startsWith("application/x-www-form-urlencoded"))
    throw new Error("format");
  const reader = request.body?.getReader();
  let size = 0;
  const chunks: Uint8Array[] = [];
  if (reader)
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > 16384) {
        await reader.cancel();
        throw new Error("size");
      }
      chunks.push(value);
    }
  return new URLSearchParams(Buffer.concat(chunks).toString());
}
export function formPost<T>(
  request: Request,
  path: ApiPath,
  body: unknown,
  raw = false,
  method: "POST" | "PATCH" | "DELETE" | "PUT" = "POST",
) {
  const config = webServerConfig();
  const headers = new Headers({
    Accept: "application/json",
    "Content-Type": "application/json",
    Origin: config.publicOrigin,
  });
  const cookie = authCookies(request.headers.get("cookie") ?? "");
  if (cookie) headers.set("cookie", cookie);
  const source = request.headers.get("x-web-form-source");
  if (source) headers.set("x-web-form-source", source);
  return postJson<T>(`${config.apiOrigin}${safePath(path)}`, body, { headers, raw, method });
}
export function redirectResponse(path: string, setCookies: string[] = []) {
  const headers = new Headers({ Location: path, "Cache-Control": "private, no-store, max-age=0" });
  for (const cookie of setCookies) headers.append("Set-Cookie", cookie);
  return new Response(null, { status: 303, headers });
}
export function flowCookie(value: string, maxAge = 600) {
  return serverCookie("sign_in_flow", value, maxAge);
}

export interface InvitationFlow {
  token: string;
  issued: number;
}
export function sealInvitationFlow(flow: InvitationFlow) {
  return sealFlow({ ...flow, email: "", returnTo: "/invitations/review" });
}
export async function readInvitationFlow(): Promise<InvitationFlow | null> {
  const flow = await readFlow("invitation_flow");
  const token = (flow as (SignInFlow & { token?: unknown }) | null)?.token;
  return typeof token === "string" && /^[A-Za-z0-9_-]{43}$/.test(token) && flow
    ? { token, issued: flow.issued }
    : null;
}
export function invitationCookie(value: string, maxAge = 600) {
  return serverCookie("invitation_flow", value, maxAge);
}

export function accountFlowCookie(action: AccountAction, email: string) {
  const flow = {
    email,
    returnTo: "/account",
    issued: Date.now(),
    purpose: action,
    accountFlowId: crypto.randomUUID(),
  };
  return serverCookie("account_flow", sealFlow(flow), 600);
}
export async function readAccountFlow() {
  const flow = await readFlow("account_flow");
  const id = (flow as (SignInFlow & { accountFlowId?: unknown }) | null)?.accountFlowId;
  return flow &&
    typeof id === "string" &&
    /^[a-f0-9-]{36}$/.test(id) &&
    accountActions.includes(flow.purpose as AccountAction)
    ? { email: flow.email, action: flow.purpose as AccountAction, id }
    : null;
}
