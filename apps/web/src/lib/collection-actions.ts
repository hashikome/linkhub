"use server";
import { webServerConfig } from "@nslinkhub/config/web-server";
import type { Collection, UpdateCollectionRequest } from "@nslinkhub/types";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import type { CollectionEditState } from "../components/collection-editor";
import { formPost } from "./form-server";
import { keepPendingAction } from "./pending-action";
import { serverRead } from "./server-api";
import { isUuid } from "./validation";

export async function saveCollection(
  _previous: CollectionEditState,
  data: FormData,
): Promise<CollectionEditState> {
  const incoming = await headers();
  if (incoming.get("origin") !== webServerConfig().publicOrigin)
    throw new Error("Invalid form origin");
  const id = String(data.get("id") ?? "");
  if (!isUuid(id)) throw new Error("Invalid collection");
  const draft = {
    title: String(data.get("title") ?? "").slice(0, 255),
    description: String(data.get("description") ?? "").slice(0, 5000),
    comments: data.get("comments") === "on",
  };
  const patch = {
    title: draft.title.trim(),
    description: draft.description,
    commentsEnabled: draft.comments,
    version: Number(data.get("version")),
  } satisfies UpdateCollectionRequest;
  const result = await formPost<Collection>(
    new Request(webServerConfig().publicOrigin, { headers: incoming }),
    `/api/v1/collections/${id}`,
    patch,
    false,
    "PATCH",
  );
  if (result.ok) redirect(`/c/${id}?notice=collection-saved`);
  // The session ended mid-save: sign in, then the save continues.
  if (result.status === 401) {
    await keepPendingAction({
      path: `/api/v1/collections/${id}`,
      method: "PATCH",
      body: patch,
      target: `/c/${id}`,
      success: "collection-saved",
      label: "save this collection",
      issued: Date.now(),
    });
    redirect(`/sign-in?returnTo=${encodeURIComponent(`/c/${id}`)}`);
  }
  const latest =
    result.status === 409 ? await serverRead<Collection>(`/api/v1/collections/${id}`) : null;
  return {
    ...draft,
    ...(latest?.ok ? { latest: latest.data } : {}),
    error:
      result.status === 401
        ? "Your session ended. Sign in again, then retry saving."
        : result.status === 409
          ? "This collection changed elsewhere since you opened it. Your draft is still here."
          : result.status === 400
            ? "Check the collection name and description."
            : "We couldn't save your collection. Your edits are still here; try again.",
  };
}
