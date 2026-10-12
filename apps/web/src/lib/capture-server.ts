import "server-only";
import { webServerConfig } from "@ntumie/config/web-server";
import type { CaptureRequest, CaptureResult } from "@ntumie/types";
import { cookies } from "next/headers";
import { type CaptureDraft, draftTtl, fitDraft, openDraft } from "./capture-draft";
import { serverCookie } from "./cookies";
import { formPost, redirectResponse } from "./form-server";
import { isUuid } from "./validation";
export async function readDraft(id: string) {
  const raw = (await cookies()).get(`capture_${id}`)?.value;
  return raw ? openDraft(raw, id, webServerConfig().sourceSecret) : null;
}
export function draftCookie(draft: CaptureDraft, clear = false) {
  const age = clear ? 0 : Math.max(0, Math.ceil(draftTtl - (Date.now() - draft.issued) / 1000));
  return serverCookie(
    `capture_${draft.id}`,
    clear ? "" : fitDraft(draft, webServerConfig().sourceSecret),
    age,
  );
}
export async function draftRoom() {
  const entries = (await cookies())
    .getAll()
    .filter((c) => c.name.startsWith("capture_") && isUuid(c.name.slice(8)));
  const valid = entries
    .map((c) => openDraft(c.value, c.name.slice(8), webServerConfig().sourceSecret))
    .filter((d) => d !== null)
    .sort((a, b) => b.issued - a.issued);
  return valid.slice(2).map((d) => draftCookie(d, true));
}
export async function saveDraft(
  request: Request,
  draft: CaptureDraft,
  extraCookies: string[] = [],
) {
  const body = {
    operationId: draft.operationId,
    startedAt: draft.issued,
    links: draft.links,
    destination: draft.destination,
    published: draft.published ?? true,
    ...(draft.collectionTitle ? { collectionTitle: draft.collectionTitle } : {}),
  } satisfies CaptureRequest;
  const result = await formPost<CaptureResult>(request, "/api/v1/capture", body);
  if (result.ok)
    return redirectResponse(
      `/c/${result.data.collectionId}?notice=${result.data.resourceIds.length > 1 ? "links-saved" : "link-saved"}`,
      [...extraCookies, draftCookie(draft, true)],
    );
  const path = `/capture/${draft.id}`;
  if (result.status === 401)
    return redirectResponse(`/sign-in?returnTo=${encodeURIComponent(path)}&notice=signin`, [
      ...extraCookies,
      draftCookie(draft),
    ]);
  return redirectResponse(
    `${path}?notice=${
      result.code === "capture_destination_required"
        ? "choose-destination"
        : result.code === "link_not_public"
          ? "link-not-public"
          : result.status === 429
            ? "limited"
            : "save-failed"
    }`,
    [...extraCookies, draftCookie(draft)],
  );
}
