"use server";
import { webServerConfig } from "@ntumie/config/web-server";
import type { CreateHeadingResourceRequest, Resource, UpdateResourceRequest } from "@ntumie/types";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import type { SectionEditState } from "../components/section-editor";
import { formPost } from "./form-server";
import type { ApiPath } from "./http";
import { keepPendingAction } from "./pending-action";
import { serverRead } from "./server-api";
import { isUuid } from "./validation";
export async function saveSection(
  _previous: SectionEditState,
  data: FormData,
): Promise<SectionEditState> {
  const incoming = await headers();
  if (incoming.get("origin") !== webServerConfig().publicOrigin)
    throw new Error("Invalid form origin");
  const id = String(data.get("collectionId") ?? ""),
    sectionId = String(data.get("sectionId") ?? "");
  if (!isUuid(id) || (sectionId && !isUuid(sectionId))) throw new Error("Invalid section");
  const draft = {
    title: String(data.get("title") ?? "").slice(0, 1000),
    description: String(data.get("description") ?? "").slice(0, 2000),
    firstItem: String(data.get("firstItem") ?? "").slice(0, 80),
  };
  const [firstItemId, firstItemVersion] = draft.firstItem.split(":");
  const body = sectionId
    ? ({
        description: draft.description,
        version: Number(data.get("version")),
      } satisfies UpdateResourceRequest)
    : ({
        title: draft.title,
        description: draft.description,
        firstItemId,
        firstItemVersion: Number(firstItemVersion),
      } satisfies CreateHeadingResourceRequest);
  const path: ApiPath = `/api/v1/collections/${id}/resources/${sectionId || "heading"}`;
  const method = sectionId ? "PATCH" : "POST";
  const result = await formPost<Resource>(
    new Request(webServerConfig().publicOrigin, { headers: incoming }),
    path,
    body,
    false,
    method,
  );
  if (result.ok) redirect(`/c/${id}?notice=section-saved#section-title-${result.data.id}`);
  if (result.status === 401) {
    await keepPendingAction({
      path,
      method,
      body,
      target: `/c/${id}`,
      label: "save this section",
      success: "section-saved",
      issued: Date.now(),
    });
    redirect(`/sign-in?returnTo=${encodeURIComponent(`/c/${id}`)}`);
  }
  const latest =
    result.code === "version_conflict" && (sectionId || isUuid(firstItemId))
      ? await serverRead<Resource>(
          `/api/v1/collections/${id}/resources/${sectionId || firstItemId}`,
        )
      : null;
  return {
    ...draft,
    ...(latest?.ok
      ? {
          latest: latest.data,
          ...(!sectionId ? { firstItem: `${latest.data.id}:${latest.data.version}` } : {}),
        }
      : {}),
    error:
      result.code === "section_empty"
        ? "That would leave a section empty. Choose a later item so both sections keep at least one item."
        : result.code === "version_conflict"
          ? "This section or its items changed elsewhere. Review the current collection before trying again."
          : result.status === 403 || result.status === 404
            ? "You no longer have permission to edit this section."
            : result.status === 400
              ? "Choose an item and check the heading and description. Descriptions can be up to 500 characters."
              : "We couldn't save the section. Your draft is still here; try again.",
  };
}
