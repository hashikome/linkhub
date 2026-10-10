"use server";
import { webServerConfig } from "@nslinkhub/config/web-server";
import type { MoveResourceRequest } from "@nslinkhub/types";
import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { formPost } from "./form-server";
import { keepPendingAction } from "./pending-action";
import { isUuid } from "./validation";

export async function moveItem(_previous: string, data: FormData): Promise<string> {
  const incoming = await headers();
  if (incoming.get("origin") !== webServerConfig().publicOrigin)
    throw new Error("Invalid form origin");
  const id = String(data.get("collectionId") ?? "");
  const [item, version, direction] = String(data.get("move") ?? "").split(":");
  if (!isUuid(id) || !isUuid(item)) throw new Error("Invalid item");
  const beforeId = String(data.get("beforeId") ?? "");
  const body: MoveResourceRequest = {
    version: Number(version),
    ...(direction === "up" || direction === "down"
      ? { direction }
      : beforeId
        ? { beforeId, beforeVersion: Number(data.get("beforeVersion")) }
        : {}),
  };
  const path = `/api/v1/collections/${id}/resources/${item}/move` as const;
  const target = `/c/${id}/reorder`;
  const result = await formPost(
    new Request(webServerConfig().publicOrigin, { headers: incoming }),
    path,
    body,
    false,
    "PATCH",
  );
  if (result.ok) {
    revalidatePath(target);
    const cursor = String(data.get("cursor") ?? "");
    redirect(
      `${target}?${new URLSearchParams({ ...(cursor ? { cursor } : {}), notice: "order-saved" })}#reorder-${item}`,
    );
  }
  if (result.status === 401) {
    await keepPendingAction({
      path,
      method: "PATCH",
      body: { ...body },
      target,
      label: "move this item",
      success: "order-saved",
      issued: Date.now(),
    });
    redirect(`/sign-in?returnTo=${encodeURIComponent(target)}`);
  }
  return result.code === "section_empty"
    ? "That move would leave a section empty. Move another item into it first, or move the whole section."
    : result.code === "version_conflict" || result.code === "invalid_reorder"
      ? "The order or an item changed elsewhere. Reload the current order before moving it again."
      : result.status === 403 || result.status === 404
        ? "You no longer have permission to move this item."
        : "We couldn't move this item. Try again.";
}
