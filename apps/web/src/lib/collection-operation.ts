"use server";
import { webServerConfig } from "@linkhub/config/web-server";
import type {
  CreateShareRequest,
  LinkSharingResult,
  SetLinkSharingRequest,
  TransferCollectionRequest,
} from "@linkhub/types";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import type { CollectionOperationState } from "../components/collection-operation-fields";
import { formPost } from "./form-server";
import { type ApiPath, safeDocumentReturn, safeReturn } from "./http";
import { keepPendingAction } from "./pending-action";
import { sharePath } from "./sharing";
import { isUuid } from "./validation";

export async function collectionOperation(
  _previous: CollectionOperationState,
  data: FormData,
): Promise<CollectionOperationState> {
  const incoming = await headers();
  if (incoming.get("origin") !== webServerConfig().publicOrigin) throw new Error("Invalid origin");
  const id = String(data.get("id") ?? "");
  const action = String(data.get("action") ?? "");
  if (!isUuid(id)) return { error: "Invalid collection." };
  const base: ApiPath = `/api/v1/collections/${id}`;
  let path = base;
  let method: "POST" | "DELETE" | "PUT" = "POST";
  let body: Record<string, unknown> = {};
  const impactToken = String(data.get("impactToken") ?? "");
  if (["delete", "transfer"].includes(action) && !/^[a-f0-9]{64}$/.test(impactToken))
    return { error: "Reload this page to review what will change." };
  switch (action) {
    case "publish":
    case "unpublish":
      path = `${base}/${action}`;
      break;
    case "delete":
      body = { impactToken };
      method = "DELETE";
      break;
    case "transfer":
      path = `${base}/transfer`;
      body = {
        email: String(data.get("email") ?? "").trim(),
        impactToken,
      } satisfies TransferCollectionRequest;
      break;
    case "grant": {
      const role = String(data.get("role") ?? "viewer");
      if (role !== "viewer" && role !== "contributor") return { error: "Choose a valid role." };
      path = `${base}/shares`;
      body = {
        email: String(data.get("email") ?? "").trim(),
        role,
      } satisfies CreateShareRequest;
      break;
    }
    case "revoke": {
      const userId = String(data.get("userId") ?? "");
      if (!isUuid(userId)) return { error: "Invalid person." };
      path = `${base}/shares/${userId}`;
      method = "DELETE";
      break;
    }
    case "enable_link":
    case "rotate_link":
    case "disable_link":
      path = `${base}/link-sharing`;
      method = "PUT";
      body = {
        enabled: action !== "disable_link",
        ...(action === "rotate_link" ? { rotate: true } : {}),
      } satisfies SetLinkSharingRequest;
      break;
    default:
      return { error: "Choose an available action." };
  }
  const result = await formPost<LinkSharingResult>(
    new Request(webServerConfig().publicOrigin, { headers: incoming }),
    path,
    body,
    false,
    method,
  );
  if (!result.ok && result.status === 401) {
    const target = safeReturn(
      action === "delete" || action === "transfer"
        ? "/manage/collections"
        : action === "publish" || action === "unpublish"
          ? `/c/${id}`
          : sharePath(
              { kind: "collection", id },
              safeDocumentReturn(data.get("returnTo") ?? `/c/${id}`),
            ),
    );
    const labels: Record<string, string> = {
      publish: "publish this collection",
      unpublish: "unpublish this collection",
      delete: "delete this collection",
      transfer: "transfer this collection",
      grant: "grant access to this collection",
      revoke: "remove access to this collection",
      enable_link: "create a share link",
      rotate_link: "replace the share link",
      disable_link: "turn off link access",
    };
    await keepPendingAction({
      path,
      method,
      body,
      target,
      label: labels[action],
      issued: Date.now(),
      ...(method === "PUT" ? { result: "collection-link" as const } : {}),
    });
    redirect(`/sign-in?returnTo=${encodeURIComponent(target)}`);
  }
  if (!result.ok && result.code === "version_conflict" && ["delete", "transfer"].includes(action))
    redirect(
      `/c/${id}/actions?${new URLSearchParams({ action, notice: "impact-changed", returnTo: safeDocumentReturn(data.get("returnTo") ?? `/c/${id}`) })}`,
    );
  if (!result.ok)
    return {
      error:
        result.status === 403 || result.status === 404
          ? "This action is no longer available to you."
          : result.code === "collection_held"
            ? "Distribution is on hold. Contact support for review."
            : "The action could not be completed. Check the details and current access, then try again.",
    };
  if (result.data.token)
    return {
      link: `${webServerConfig().publicOrigin}/c/${id}?s=${encodeURIComponent(result.data.token)}`,
      token: result.data.token,
    };
  if (action === "delete" || action === "transfer") redirect("/manage/collections?notice=done");
  if (!["publish", "unpublish"].includes(action))
    redirect(
      `${sharePath({ kind: "collection", id }, safeDocumentReturn(data.get("returnTo") ?? `/c/${id}`))}&notice=done`,
    );
  redirect(
    `/c/${id}/actions?${new URLSearchParams({
      action,
      notice: "done",
      returnTo: safeDocumentReturn(data.get("returnTo") ?? `/c/${id}`),
    })}`,
  );
}
