import { randomUUID } from "node:crypto";
import { webServerConfig } from "@nslinkhub/config/web-server";
import type {
  CaptureLink,
  CreateCommentRequest,
  CreatedShareEntry,
  InvitationAcceptance,
  OperationCommand,
  Profile,
  SendSignInCodeRequest,
  UpdateCommentRequest,
  UpdateProfileRequest,
  VerifySignInCodeRequest,
} from "@nslinkhub/types";
import {
  accountActions,
  isPublicLinkHost,
  maxCaptureLinks,
  operationActions,
  operationReasons,
  signInCodePurposes,
} from "@nslinkhub/types";
import { auditContinuation, auditQuery } from "../../../lib/audit-query";
import type { CaptureDraft } from "../../../lib/capture-draft";
import { draftCookie, draftRoom, readDraft, saveDraft } from "../../../lib/capture-server";
import { serverCookie } from "../../../lib/cookies";
import {
  accountFlowCookie,
  flowCookie,
  formData,
  formPost,
  invitationCookie,
  readAccountFlow,
  readFlow,
  readInvitationFlow,
  redirectResponse,
  sealFlow,
  sealInvitationFlow,
} from "../../../lib/form-server";
import { type ApiPath, safeDocumentReturn, safeReturn, sessionCookie } from "../../../lib/http";
import { sealSearch } from "../../../lib/manage-search";
import {
  accountFingerprint,
  lastAccountCookie,
  type PendingAction,
  pendingActionCookie,
  readLastAccount,
  readPendingAction,
} from "../../../lib/pending-action";
import { serverRead } from "../../../lib/server-api";
import { readSession } from "../../../lib/session";
import { resendTiming } from "../../../lib/sign-in-flow";
import { appearanceCookie } from "../../../lib/theme";
import { captureUrl, isUuid, parseTags } from "../../../lib/validation";
import type { VerificationPurpose } from "../../../lib/verification";

export async function POST(request: Request, { params }: { params: Promise<{ action: string }> }) {
  const { action } = await params;
  let form: URLSearchParams;
  try {
    form = await formData(request);
  } catch {
    return new Response("Unable to submit this form. Return to the page and try again.", {
      status: 403,
    });
  }
  if (action === "account-send" || action === "account-confirm") {
    const flow = action === "account-confirm" ? await readAccountFlow() : null;
    if (
      action === "account-confirm" &&
      (!flow || form.get("accountFlowId") !== flow.id || form.get("accountAction") !== flow.action)
    )
      return redirectResponse("/account?notice=expired");
    const selected =
      flow?.action ?? accountActions.find((value) => value === form.get("accountAction"));
    if (!selected || (action === "account-confirm" && !flow))
      return redirectResponse("/account?notice=expired");
    const email = flow?.email ?? form.get("email")?.trim().toLowerCase() ?? "";
    const result = await formPost(
      request,
      action === "account-send" ? "/api/v1/auth/account/send" : "/api/v1/auth/account/confirm",
      {
        action: selected,
        email,
        ...(action === "account-confirm"
          ? { code: (form.get("code") ?? "").replace(/[\s-]/g, "") }
          : {}),
      },
      true,
    );
    if (!result.ok)
      return redirectResponse(
        `/account?action=${selected}${flow ? "&step=verify" : ""}&notice=${result.status === 429 ? "limited" : result.status === 401 ? "signin-required" : result.status === 400 ? "invalid" : "unavailable"}`,
      );
    if (action === "account-send")
      return redirectResponse(`/account?action=${selected}&step=verify`, [
        accountFlowCookie(selected, email),
      ]);
    const expiredSessions = sessionCookie(request.headers.get("cookie") ?? "")
      .split(";")
      .filter(Boolean)
      .map((cookie) => serverCookie(cookie.trim().split("=")[0], "", 0));
    return redirectResponse(`/account?done=${selected}`, [
      serverCookie("account_flow", "", 0),
      lastAccountCookie(null),
      pendingActionCookie(null),
      ...expiredSessions,
    ]);
  }
  if (action === "share-create" || action === "share-open") {
    // This is untrusted form input, not a validated ShareRequest/ShareOpenRequest.
    // Preserve optional metadata for the API's forgiving parser and warnings.
    const shareId = form.get("shareId") ?? "";
    if (action === "share-open" && !isUuid(shareId))
      return Response.json({ ok: false, code: "validation_failed" }, { status: 400 });
    const token = form.get("token");
    const query = token ? `?${new URLSearchParams({ s: token })}` : "";
    const target = { kind: form.get("kind"), ...(form.get("id") ? { id: form.get("id") } : {}) };
    const result =
      action === "share-create"
        ? await formPost<CreatedShareEntry>(request, `/api/v1/share${query}`, {
            ...target,
            context: { destination: "copy_link" },
            operationId: form.get("operationId"),
          })
        : await formPost(request, `/api/v1/share/${shareId}/opens${query}`, {
            ...target,
            eventId: form.get("eventId"),
            occurredAt: form.get("occurredAt"),
            attribution: optionalJson(form.get("attribution")),
            context: optionalJson(form.get("context")),
          });
    return Response.json(result, {
      status: result.ok ? (result.status ?? 200) : result.status || 503,
      headers: { "Cache-Control": "private, no-store" },
    });
  }
  if (action === "create-hub") {
    const result = await formPost<{ hubId: string }>(request, "/api/v1/hubs", {});
    if (result.ok) return redirectResponse(`/h/${result.data.hubId}`);
    if (result.status === 401)
      return resumeAfterSignIn({
        path: "/api/v1/hubs",
        body: {},
        target: "/hub",
        label: "create your hub",
        issued: Date.now(),
      });
    return redirectResponse(`/hub?notice=${result.status === 429 ? "limited" : "unavailable"}`);
  }
  if (action === "capture-save") {
    const id = form.get("draftId") ?? "";
    if (!isUuid(id)) return redirectResponse("/capture?notice=invalid");
    const previous = await readDraft(id);
    const back = (notice: string) =>
      redirectResponse(`${previous ? `/capture/${id}` : "/capture"}?notice=${notice}`);
    // One row per link: URL and optional comma-separated tags (titles are
    // resolved from the page, never typed). Rows left empty are ignored; any
    // other unusable address rejects the save.
    const tags = form.getAll("tags");
    const links: CaptureLink[] = [];
    for (const [index, raw] of form.getAll("url").entries()) {
      if (!raw.trim()) continue;
      const url = captureUrl(raw.trim());
      if (!url) return back("link-invalid");
      if (!isPublicLinkHost(new URL(url).hostname)) return back("link-not-public");
      const tagList = parseTags(tags[index]);
      links.push({ url, ...(tagList.length ? { tags: tagList } : {}) });
    }
    const destination = form.get("destination") ?? "";
    if (!links.length || (!["first", "new"].includes(destination) && !isUuid(destination)))
      return back("link-invalid");
    if (links.length > maxCaptureLinks) return back("too-many-links");
    const collectionTitle =
      destination === "new"
        ? form.get("collectionTitle")?.trim().slice(0, 255) || undefined
        : undefined;
    const same =
      previous &&
      JSON.stringify([previous.links, previous.destination, previous.collectionTitle]) ===
        JSON.stringify([links, destination, collectionTitle]);
    const draft: CaptureDraft = {
      id,
      links,
      destination,
      ...(collectionTitle ? { collectionTitle } : {}),
      issued: previous?.issued ?? Date.now(),
      operationId: same ? previous.operationId : previous ? randomUUID() : id,
    };
    try {
      draftCookie(draft);
    } catch {
      return back("too-many-links");
    }
    const room = previous ? [] : await draftRoom();
    // No session cookie: sign in first. An expired session is caught by the
    // save's 401, which keeps the draft the same way.
    if (!sessionCookie(request.headers.get("cookie") ?? ""))
      return redirectResponse(`/sign-in?returnTo=${encodeURIComponent(`/capture/${id}`)}`, [
        ...room,
        draftCookie(draft),
      ]);
    return saveDraft(request, draft, room);
  }
  if (action.startsWith("comment-")) {
    // Every comment write returns to the collection it belongs to (permalink or
    // pretty URL, keeping an explicit share token) at the discussion.
    const returnTo = safeReturn(form.get("returnTo"));
    const token = new URL(returnTo, "http://local.invalid").searchParams.get("s");
    const scoped = token ? `?s=${encodeURIComponent(token)}` : "";
    const back = (notice: string, anchor = "comments") =>
      redirectResponse(
        `${returnTo}${returnTo.includes("?") ? "&" : "?"}notice=${notice}#${anchor}`,
      );
    const id = form.get("id") ?? "";
    if (!isUuid(id)) return back("comment-unavailable");
    const body = (form.get("body") ?? "").trim().slice(0, 2000);
    const parentId = form.get("parentId") ?? "";
    const verbs: Record<string, [string, "POST" | "PATCH" | "DELETE", unknown, string]> = {
      "comment-post": [
        `/api/v1/collections/${id}/comments${scoped}`,
        "POST",
        { body, ...(isUuid(parentId) ? { parentId } : {}) } satisfies CreateCommentRequest,
        "comment-posted",
      ],
      "comment-edit": [
        `/api/v1/comments/${id}`,
        "PATCH",
        { body, version: Number(form.get("version")) } satisfies UpdateCommentRequest,
        "comment-saved",
      ],
      "comment-delete": [`/api/v1/comments/${id}`, "DELETE", {}, "comment-deleted"],
      "comment-hide": [`/api/v1/comments/${id}/hide`, "POST", {}, "done"],
      "comment-show": [`/api/v1/comments/${id}/show`, "POST", {}, "done"],
      "comment-accept": [`/api/v1/comments/${id}/accept`, "POST", {}, "comment-answer"],
      "comment-unaccept": [`/api/v1/comments/${id}/unaccept`, "POST", {}, "done"],
    };
    const verb = verbs[action];
    if (!verb) return back("comment-unavailable");
    if (["comment-post", "comment-edit"].includes(action) && !body) return back("comment-empty");
    const [path, method, payload, success] = verb;
    const result = await formPost<{ id?: string }>(
      request,
      path as ApiPath,
      payload,
      false,
      method,
    );
    if (result.ok)
      return back(
        success,
        result.data?.id && action !== "comment-delete" ? `comment-${result.data.id}` : "comments",
      );
    if (result.status === 401)
      return resumeAfterSignIn({
        path: path as ApiPath,
        method,
        body: payload as Record<string, unknown>,
        target: returnTo,
        anchor: "comments",
        success,
        label: commentLabels[action] ?? "update the discussion",
        issued: Date.now(),
      });
    return back(
      result.code === "comments_disabled"
        ? "comments-off"
        : result.status === 409
          ? "conflict"
          : result.status === 429
            ? "limited"
            : result.status === 400
              ? "comment-empty"
              : "comment-unavailable",
    );
  }
  if (action === "notifications-seen" || action === "notifications-clear") {
    const seen = action === "notifications-seen";
    const result = await formPost(request, `/api/v1/notifications/${seen ? "seen" : "clear"}`, {});
    // "Seen" is a background request from the open Notifications page.
    if (seen) return new Response(null, { status: result.ok ? 204 : result.status || 503 });
    return redirectResponse(
      result.ok
        ? "/notifications?notice=cleared"
        : result.status === 401
          ? "/sign-in?returnTo=%2Fnotifications"
          : "/notifications?notice=unavailable",
    );
  }
  if (action === "theme") {
    const theme = form.get("theme");
    if (!["light", "dark", "system"].includes(theme ?? ""))
      return new Response("Invalid appearance", { status: 400 });
    if (!(await readSession())) return redirectResponse("/sign-in?returnTo=%2Fsettings");
    return redirectResponse(safeDocumentReturn(form.get("returnTo")), [
      appearanceCookie(theme as string),
    ]);
  }
  if (action === "profile-save") {
    const json = request.headers.get("accept")?.includes("application/json");
    const section = form.get("section") === "hub" ? "hub" : "profile";
    const settingsPath = `/settings?section=${section}`;
    const displayName = form.get("displayName")?.trim() ?? "",
      username = form.get("username")?.trim().toLowerCase() ?? "";
    const hubFields = form.has("handle")
      ? {
          showOwner: form.get("showOwner") === "on",
          hubName: form.get("hubName")?.trim() ?? "",
          handle: form.get("handle")?.trim().toLowerCase() ?? "",
          hubDescription: form.get("hubDescription") ?? "",
        }
      : {};
    if (form.get("claimHandle") === "true" && form.get("confirmHandle") !== "on")
      return redirectResponse("/settings?section=hub&notice=handle-confirmation-required");
    const bio = form.get("bio") ?? "";
    const body = {
      displayName,
      username,
      bio,
      ...hubFields,
      ...(form.get("confirmHandle") === "on" ? { confirmHandle: true } : {}),
    } satisfies UpdateProfileRequest;
    if (
      displayName.length > 255 ||
      bio.length > 500 ||
      !/^[a-z0-9]+(-[a-z0-9]+)*$/.test(username) ||
      username.length < 3 ||
      username.length > 20
    )
      return json
        ? Response.json({ ok: false, code: "validation_failed", status: 400 }, { status: 400 })
        : redirectResponse(`${settingsPath}&notice=profile-invalid`);
    const result = await formPost<Profile>(request, "/api/v1/profile", body, false, "PATCH");
    if (json)
      return Response.json(result, {
        status: result.ok ? 200 : result.status || 503,
        headers: { "Cache-Control": "private, no-store" },
      });
    if (!result.ok && result.status === 401)
      return resumeAfterSignIn({
        path: "/api/v1/profile",
        method: "PATCH",
        body,
        target: settingsPath,
        success: "profile-saved",
        label: "save your profile",
        issued: Date.now(),
      });
    return redirectResponse(
      `${settingsPath}&notice=${result.ok ? "profile-saved" : result.code === "username_unavailable" ? "username-unavailable" : result.code === "username_reserved" || result.code === "username_invalid" ? "username-invalid" : result.code === "handle_claimed" ? "handle-claimed" : result.code === "handle_confirmation_required" ? "handle-confirmation-required" : result.code === "handle_unavailable" ? "handle-unavailable" : result.code === "handle_reserved" || result.code === "handle_invalid" ? "handle-invalid" : result.status === 429 ? "limited" : "unavailable"}`,
    );
  }
  if (action === "invitation-open") {
    let token = form.get("token")?.trim() ?? "";
    if (token.includes("#token=")) {
      try {
        token = new URL(token).hash.slice(7);
      } catch {
        token = "";
      }
    }
    if (!/^[A-Za-z0-9_-]{43}$/.test(token))
      return redirectResponse("/invitations/accept?notice=invalid");
    return redirectResponse("/invitations/review", [
      invitationCookie(sealInvitationFlow({ token, issued: Date.now() })),
    ]);
  }
  if (action === "invitation-sign-out") {
    const result = await formPost(request, "/api/v1/auth/sign-out", {}, true);
    return redirectResponse(
      `/invitations/review${result.ok ? "" : "?notice=signout-failed"}`,
      result.ok ? result.setCookies : [],
    );
  }
  if (action === "invitation-resume") {
    const flow = await readInvitationFlow();
    if (!flow) return redirectResponse("/invitations/accept");
    const result = await formPost<InvitationAcceptance>(
      request,
      "/api/v1/auth/invitations/resend",
      { token: flow.token },
      true,
    );
    if (!result.ok)
      return redirectResponse(
        `/invitations/review?notice=${result.status === 429 ? "limited" : "unavailable"}`,
      );
    return redirectResponse("/sign-in/code?notice=sent", [
      flowCookie(
        sealFlow({
          email: result.data.email,
          returnTo: "/manage",
          invitationToken: flow.token,
          issued: Date.now(),
        }),
      ),
    ]);
  }
  if (action === "invitation-respond") {
    const flow = await readInvitationFlow();
    if (!flow) return redirectResponse("/invitations/accept?notice=expired");
    if (!["accept", "decline"].includes(form.get("action") ?? ""))
      return redirectResponse("/invitations/review?notice=invalid");
    const result = await formPost<InvitationAcceptance>(
      request,
      "/api/v1/auth/invitations/accept",
      {
        token: flow.token,
        action: form.get("action"),
        operationId: form.get("operationId"),
        version: Number(form.get("version")),
        ...(form.has("name") ? { name: form.get("name") } : {}),
      },
      true,
    );
    if (!result.ok)
      return redirectResponse(
        `/invitations/review?notice=${result.code === "invitation_session_mismatch" ? "wrong-account" : result.status === 400 ? "invalid" : result.status === 409 ? "conflict" : result.status === 429 ? "limited" : "unavailable"}`,
      );
    if (result.data.state === "declined")
      return redirectResponse("/invitations/review?notice=declined");
    return redirectResponse("/sign-in/code?notice=invitation-accepted", [
      flowCookie(
        sealFlow({
          email: result.data.email,
          returnTo: "/manage",
          invitationToken: flow.token,
          issued: Date.now(),
        }),
      ),
    ]);
  }
  if (action === "confirm-cancel") {
    // Drop the waiting action and go back to where it was started.
    const pending = await readPendingAction();
    return redirectResponse(pending?.target ?? "/manage", [
      pendingActionCookie(null),
      flowCookie("", 0),
    ]);
  }
  if (action === "confirm-send") {
    // A signed-in person confirms it's them: the code goes to their own email.
    const [session, pending] = await Promise.all([readSession(), readPendingAction()]);
    if (!session) return redirectResponse("/sign-in?notice=signin");
    if (!pending) return redirectResponse("/manage?notice=expired");
    const result = await formPost(
      request,
      "/api/v1/auth/code/send",
      { email: session.email, purpose: "confirm" } satisfies SendSignInCodeRequest,
      true,
    );
    const flow = {
      email: session.email,
      returnTo: pending.target,
      purpose: "confirm" as const,
      ...resendTiming(null, result, webServerConfig().codeResendSeconds),
    };
    return redirectResponse(
      `/sign-in/code?notice=${result.ok ? "sent" : result.status === 429 ? "limited" : "unavailable"}${!result.ok && result.retryAfter ? `&wait=${Math.min(result.retryAfter, 600)}` : ""}`,
      [flowCookie(sealFlow(flow))],
    );
  }
  if (action === "code-send" || action === "code-resend") {
    const previous = action === "code-resend" ? await readFlow() : null;
    const email = previous?.email ?? form.get("email")?.trim().toLowerCase();
    const returnTo = previous?.returnTo ?? safeReturn(form.get("returnTo"));
    if (!email || email.length > 254 || !/^\S+@\S+\.\S+$/.test(email))
      return redirectResponse("/sign-in?notice=invalid");
    // The purpose comes from the situation, not the form: a waiting first link,
    // an interrupted action, or plain sign-in (worded by where it leads).
    const purpose: VerificationPurpose =
      previous?.purpose ??
      (previous?.invitationToken
        ? "invitation"
        : /^\/capture\/[a-f0-9-]{36}$/.test(returnTo)
          ? "first-link"
          : (await readPendingAction())?.target === returnTo
            ? "resume"
            : form.get("purpose") === "continue"
              ? "continue"
              : "sign-in");
    const result = await formPost(
      request,
      previous?.invitationToken ? "/api/v1/auth/invitations/resend" : "/api/v1/auth/code/send",
      previous?.invitationToken
        ? { token: previous.invitationToken }
        : ({
            email,
            purpose: signInCodePurposes.find((value) => value === purpose),
          } satisfies SendSignInCodeRequest),
      true,
    );
    // Cooldowns do not change the flow's actual issuance or extend its lifetime.
    const flow = {
      email,
      returnTo,
      purpose,
      ...resendTiming(previous, result, webServerConfig().codeResendSeconds),
      ...(previous?.invitationToken ? { invitationToken: previous.invitationToken } : {}),
    };
    return redirectResponse(
      `/sign-in/code?notice=${result.ok ? (previous ? "resent" : "sent") : result.status === 429 ? "limited" : "unavailable"}${!result.ok && result.retryAfter ? `&wait=${Math.min(result.retryAfter, 600)}` : ""}`,
      [flowCookie(sealFlow(flow), returnTo.startsWith("/capture/") ? 1800 : 600)],
    );
  }
  if (action === "code-verify") {
    const flow = await readFlow();
    if (!flow) return redirectResponse("/sign-in?notice=expired");
    // Pasted codes often carry spaces or dashes ("3368 6575"); only digits count.
    const code = (form.get("code") ?? "").replace(/[\s-]/g, "");
    if (!/^\d{8}$/.test(code)) return redirectResponse("/sign-in/code?notice=invalid");
    const result = await formPost(
      request,
      flow.invitationToken ? "/api/v1/auth/invitations/verify" : "/api/v1/auth/code/verify",
      flow.invitationToken
        ? { token: flow.invitationToken, code }
        : ({ email: flow.email, code } satisfies VerifySignInCodeRequest),
      true,
    );
    if (!result.ok)
      return redirectResponse(
        `/sign-in/code?notice=${result.status === 429 ? "limited" : result.status >= 500 || !result.status ? "unavailable" : "invalid"}${result.retryAfter ? `&wait=${Math.min(result.retryAfter, 600)}` : ""}`,
      );
    const verified = (result.setCookies ?? []).map((cookie) => cookie.split(";")[0]).join("; ");
    // Confirmed: run the action that asked for it, with the new session.
    if (flow.purpose === "confirm" || flow.purpose === "resume") {
      const pending = await readPendingAction();
      const done = [
        ...(result.setCookies ?? []),
        flowCookie("", 0),
        pendingActionCookie(null),
        lastAccountCookie(flow.email),
      ];
      // A waiting action runs only for the person it belongs to.
      if (
        !pending ||
        pending.target !== flow.returnTo ||
        (flow.purpose === "resume" && pending.owner !== accountFingerprint(flow.email))
      )
        return redirectResponse(flow.returnTo, done);
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
        return redirectResponse(destination.pathname + destination.search, done);
      }
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
      return redirectResponse(
        `${pending.target}${join}notice=${notice}${pending.anchor ? `#${pending.anchor}` : ""}`,
        done,
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
  if (action === "sign-out") {
    const result = await formPost(request, "/api/v1/auth/sign-out", {}, true);
    return result.ok
      ? redirectResponse("/?notice=signed-out", [
          ...(result.setCookies ?? []),
          lastAccountCookie(null),
          pendingActionCookie(null),
        ])
      : redirectResponse("/sign-in?notice=signout-failed");
  }
  if (action === "manage-search") {
    if (form.get("page") === "audit") {
      const { filters } = auditQuery(Object.fromEntries(form));
      filters.delete("cursor");
      const result = await serverRead<unknown[]>(`/api/v1/manage/audit?${filters}`);
      if (!result.ok) {
        if (result.status === 401) return redirectResponse("/sign-in?returnTo=%2Fmanage%2Faudit");
        return redirectResponse("/manage/audit?notice=filters-unavailable");
      }
      return redirectResponse(`/manage/audit?${auditContinuation(result.meta)}`);
    }
    // Account searches may include email; keep them sealed in the page URL.
    const query = new URLSearchParams();
    const text = (form.get("q") ?? "").trim().slice(0, 254);
    if (text) query.set("s", sealSearch(text));
    return redirectResponse(`/manage${query.size ? `?${query}` : ""}`);
  }
  if (action === "invitation-create" || action === "invitation-action") {
    const id = form.get("id"),
      verb = form.get("action"),
      operationId = form.get("operationId");
    if (
      !isUuid(operationId ?? "") ||
      (action === "invitation-action" &&
        (!isUuid(id ?? "") || !["resend", "cancel", "revoke"].includes(verb ?? "")))
    )
      return redirectResponse(
        `/manage/${verb === "revoke" ? "team" : "invitations"}?notice=invalid`,
      );
    // Actions return to the page they were taken from (a table row or detail).
    const target = opsReturn(
      form.get("returnTo"),
      verb === "revoke" ? "/manage/team" : "/manage/invitations",
    );
    const path =
      action === "invitation-create"
        ? "/api/v1/operations/operator-invitations"
        : verb === "revoke"
          ? (`/api/v1/operations/operators/${id}/revoke` as const)
          : (`/api/v1/operations/operator-invitations/${id}` as const);
    const body =
      action === "invitation-create"
        ? { email: form.get("email"), operationId }
        : {
            operationId,
            version: Number(form.get("version")),
            ...(verb === "revoke" ? {} : { action: verb }),
          };
    const teamLabel =
      action === "invitation-create"
        ? "invite this operator"
        : verb === "resend"
          ? "resend this invitation"
          : verb === "cancel"
            ? "revoke this invitation"
            : "remove this operator";
    const result = await formPost(request, path, body);
    if (!result.ok && result.code === "recent_auth_required")
      return confirmFirst({ path, body, target, label: teamLabel, issued: Date.now() });
    if (!result.ok && result.status === 401)
      return resumeAfterSignIn({ path, body, target, label: teamLabel, issued: Date.now() });
    return redirectResponse(
      `${target}${target.includes("?") ? "&" : "?"}notice=${result.ok ? "done" : result.status === 409 ? "conflict" : result.status === 403 ? "forbidden" : result.status === 400 ? "invalid" : result.status === 429 ? "limited" : "unavailable"}`,
    );
  }
  if (action === "operation") {
    const selectedAction = operationActions.find((value) => value === form.get("action"));
    const reason = operationReasons.find((value) => value === form.get("reason"));
    const targetId = form.get("targetId") ?? "";
    const operationId = form.get("operationId") ?? "";
    if (!selectedAction || !reason || !isUuid(targetId) || !isUuid(operationId))
      return redirectResponse("/manage?notice=invalid");
    const command = {
      action: selectedAction,
      targetId,
      reason,
      version: Number(form.get("version")),
      operationId,
    } satisfies OperationCommand;
    const target = opsReturn(
      form.get("returnTo"),
      `/manage/${command.action.startsWith("collection.") ? "collections" : "accounts"}/${command.targetId}`,
    );
    const result = await formPost(request, "/api/v1/operations/commands", command);
    if (!result.ok && result.code === "recent_auth_required")
      return confirmFirst({
        path: "/api/v1/operations/commands",
        body: command,
        target,
        label: operationLabels[command.action],
        issued: Date.now(),
      });
    if (!result.ok && result.status === 401)
      return resumeAfterSignIn({
        path: "/api/v1/operations/commands",
        body: command,
        target,
        label: operationLabels[command.action],
        issued: Date.now(),
      });
    return redirectResponse(
      `${target}${target.includes("?") ? "&" : "?"}notice=${result.ok ? "done" : result.status === 409 ? "conflict" : result.status === 403 ? "forbidden" : result.status === 429 ? "limited" : "unavailable"}`,
    );
  }
  return new Response("Not found", { status: 404 });
}

// An operations page to come back to, keeping only its own query (filters,
// search, page); anything else falls back to the action's own page.
function opsReturn(value: string | null, fallback: string) {
  const path = safeReturn(value);
  const parsed = new URL(value ?? "", "http://local.invalid");
  if (!path.startsWith("/manage") || parsed.pathname !== path) return fallback;
  const query = new URLSearchParams();
  for (const key of ["s", "cursor", "action", "from", "to"]) {
    const v = parsed.searchParams.get(key);
    if (v) query.set(key, v.slice(0, 254));
  }
  return `${path}${query.size ? `?${query}` : ""}`;
}

// Sensitive actions confirm it's the signed-in person with a fresh email code,
// then continue where they left off.
function confirmFirst(action: PendingAction) {
  return redirectResponse("/confirm", [pendingActionCookie(action)]);
}
// A session that ended mid-action: sign in, then the action continues — but
// only for the same person (see readLastAccount).
async function resumeAfterSignIn(action: PendingAction) {
  const owner = await readLastAccount();
  return redirectResponse(`/sign-in?returnTo=${encodeURIComponent(action.target)}`, [
    owner ? pendingActionCookie({ ...action, owner }) : pendingActionCookie(null),
  ]);
}
const commentLabels: Record<string, string> = {
  "comment-post": "post your comment",
  "comment-edit": "save your comment",
  "comment-delete": "delete your comment",
  "comment-hide": "hide that comment",
  "comment-show": "show that comment",
  "comment-accept": "mark that answer",
  "comment-unaccept": "unmark that answer",
};
const operationLabels: Record<OperationCommand["action"], string> = {
  "account.suspend": "suspend this account",
  "account.deactivate": "deactivate this account",
  "account.delete": "schedule deletion of this account",
  "account.cancel_deletion": "cancel deletion of this account",
  "account.reactivate": "reactivate this account",
  "sessions.revoke": "sign this account out everywhere",
  "collection.hold": "hold this collection",
  "collection.release": "release this collection",
};

// Malformed optional metadata still reaches the API sanitizer and warning response.
function optionalJson(value: string | null): unknown {
  if (value === null) return undefined;
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}
