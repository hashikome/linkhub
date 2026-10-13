import { describe, expect, it } from "bun:test";
import { formNavigationResponse } from "../src/lib/form-navigation";
import { submitNavigationForm } from "../src/lib/http";
import { isAppUrl } from "../src/lib/navigation";

describe("interactive navigation boundary", () => {
  it("preserves all flow cookies while converting only opted-in redirects", async () => {
    const headers = new Headers({ Location: "/sign-in/code?notice=sent" });
    headers.append("Set-Cookie", "flow=sealed; HttpOnly; SameSite=Lax");
    headers.append("Set-Cookie", "draft=sealed; HttpOnly; SameSite=Lax");
    const response = new Response(null, { status: 303, headers });
    const native = new Request("https://ntumie.link/forms/code-send", { method: "POST" });
    expect(formNavigationResponse(native, response)).toBe(response);
    const enhanced = new Request(native, { headers: { "X-Form-Navigation": "1" } });
    const result = formNavigationResponse(enhanced, response);
    expect(result.status).toBe(200);
    expect(result.headers.get("Location")).toBeNull();
    expect(result.headers.getSetCookie()).toEqual(headers.getSetCookie());
    expect(await result.json()).toEqual({ redirect: "/sign-in/code?notice=sent", refresh: true });
    const denied = new Response("Forbidden", { status: 403 });
    expect(formNavigationResponse(enhanced, denied)).toBe(denied);
  });
  it("skips the layout refresh only for page-only actions that set no layout cookie", async () => {
    const enhanced = new Request("https://ntumie.link/forms/capture-save", {
      method: "POST",
      headers: { "X-Form-Navigation": "1" },
    });
    const redirect = (...cookies: string[]) => {
      const headers = new Headers({ Location: "/c/1" });
      for (const cookie of cookies) headers.append("Set-Cookie", cookie);
      return new Response(null, { status: 303, headers });
    };
    const refresh = async (response: Response, action?: string) =>
      (await formNavigationResponse(enhanced, response, action).json()).refresh;
    expect(await refresh(redirect("draft=; Max-Age=0"), "capture-save")).toBe(false);
    expect(await refresh(redirect(), "manage-search")).toBe(false);
    expect(await refresh(redirect(), "profile-save")).toBe(true);
    expect(await refresh(redirect(), "notifications-seen")).toBe(true);
    expect(await refresh(redirect())).toBe(true);
    for (const cookie of [
      "__Secure-better-auth.session_token=new; HttpOnly",
      "appearance=dark",
      "resource_same_tab=on",
    ])
      expect(await refresh(redirect(cookie), "capture-save")).toBe(true);
  });
  it("refreshes unless a continuation explicitly declines it", async () => {
    const body = new URLSearchParams();
    const reply = (payload: unknown) =>
      (async () => Response.json(payload)) as unknown as typeof fetch;
    expect(await submitNavigationForm("/forms/theme", body, reply({ redirect: "/" }))).toEqual({
      redirect: "/",
      refresh: true,
    });
    expect(
      await submitNavigationForm(
        "/forms/capture-save",
        body,
        reply({ redirect: "/c/1", refresh: false }),
      ),
    ).toEqual({ redirect: "/c/1", refresh: false });
    expect(
      await submitNavigationForm(
        "/forms/capture-save",
        body,
        reply({ redirect: "/c/1", refresh: "no" }),
      ),
    ).toEqual({ redirect: "/c/1", refresh: true });
  });
  it("submits exactly once, includes submitter data and refuses malformed continuations", async () => {
    let attempts = 0;
    const body = new URLSearchParams({ action: "delete", confirm: "yes" });
    const fake = (async (_path: string, options: RequestInit) => {
      attempts++;
      expect(options.body).toBe(body);
      expect(options.redirect).toBe("error");
      expect(options.credentials).toBe("same-origin");
      expect(new Headers(options.headers).get("X-Form-Navigation")).toBe("1");
      throw new TypeError("connection lost after submission");
    }) as unknown as typeof fetch;
    await expect(submitNavigationForm("/forms/confirm", body, fake)).rejects.toThrow();
    expect(attempts).toBe(1);
    await expect(submitNavigationForm("/forms/../outside", body, fake)).rejects.toThrow(
      "Invalid form path",
    );
    expect(attempts).toBe(1);
    await expect(
      submitNavigationForm("/forms/confirm", body, (async () =>
        Response.json({ ok: true })) as unknown as typeof fetch),
    ).rejects.toThrow("Invalid form continuation");
  });
  it("leaves API, download and provider destinations out of the client router", () => {
    const origin = "https://ntumie.link";
    expect(isAppUrl(new URL("/settings?section=device", origin), origin)).toBe(true);
    for (const path of [
      "/api/v1/export",
      "/forms/code-send",
      "/sign-in/complete",
      "https://accounts.google.com/",
    ])
      expect(isAppUrl(new URL(path, origin), origin)).toBe(false);
  });
});
