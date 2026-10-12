import "server-only";
import { webServerConfig } from "@ntumie/config/web-server";
import { type ImportDraftView, type ImportSelectionResult, importRowStatuses } from "@ntumie/types";
import { redirectResponse } from "./form-server";
import { type ApiPath, sessionCookie } from "./http";
import { parseImportTags } from "./import-tags";
import { pendingActionCookie, readLastAccount } from "./pending-action";

import { serverSend } from "./server-transport";
import { isUuid } from "./validation";

const home = "/manage/import-export";
function notice(status: number = 0) {
  return status === 409
    ? "conflict"
    : status === 429
      ? "import-limited"
      : status === 413
        ? "import-large"
        : status === 400
          ? "import-invalid"
          : status === 403 || status === 404
            ? "forbidden"
            : "unavailable";
}
export async function importRequest<T>(
  request: Request,
  path: ApiPath,
  body: unknown,
  method: "POST" | "PATCH" | "DELETE" = "POST",
) {
  const config = webServerConfig();
  const headers = new Headers({ Accept: "application/json", Origin: config.publicOrigin });
  const cookie = sessionCookie(request.headers.get("cookie") ?? "");
  if (cookie) headers.set("cookie", cookie);
  if (!(body instanceof FormData)) headers.set("Content-Type", "application/json");
  return serverSend<T>(
    path,
    body,
    {
      method,
      headers,
      timeout: 30_000,
      deleteBody: true,
    },
    request.headers,
  );
}
export async function importForm(action: string, request: Request, form: URLSearchParams) {
  if (!action.startsWith("import-")) return null;
  if (action === "import-hub") {
    const result = await importRequest(request, "/api/v1/hubs", {});
    return redirectResponse(result.ok ? home : `${home}?notice=${notice(result.status)}`);
  }
  const id = form.get("id"),
    version = Number(form.get("version"));
  if (!isUuid(id) || !Number.isInteger(version) || version < 1)
    return redirectResponse(`${home}?notice=import-invalid`);
  const here = `${home}/${id}`;
  let path: ApiPath = `/api/v1/imports/${id}`,
    method: "POST" | "PATCH" | "DELETE" = "POST",
    body: Record<string, unknown> = { version };
  const rowId = form.get("rowId");
  const collectionId = form.get("collectionId");
  const collectionQuery = isUuid(collectionId) ? `collection=${collectionId}` : "";
  const status = importRowStatuses.find((s) => s === form.get("status"));
  const target =
    action === "import-discard"
      ? `${home}?tab=review`
      : `${here}${collectionQuery || status ? "?" : ""}${[collectionQuery, status ? `status=${status}` : ""].filter(Boolean).join("&")}`;
  const withNotice = (value: string) =>
    `${target}${target.includes("?") ? "&" : "?"}notice=${value}`;
  if (action === "import-row") {
    if (!isUuid(rowId)) return redirectResponse(`${here}?notice=import-invalid`);
    path = `${path}/rows/${rowId}`;
    method = "PATCH";
    body = {
      version,
      address: form.get("address") ?? "",
      tags: parseImportTags(form.get("tags")),
      ...(form.has("collectionTitle") ? { collectionTitle: form.get("collectionTitle") } : {}),
      ...(form.has("sectionTitle") ? { sectionTitle: form.get("sectionTitle") } : {}),
    };
  } else if (action === "import-selection") {
    path = `${path}/selection`;
    body = {
      version,
      rowIds: form.getAll("rowIds"),
      action: form.get("selectionAction"),
      ...(form.get("selectionAction") === "place"
        ? { collectionTitle: form.get("collectionTitle") }
        : {}),
    };
  } else if (action === "import-publication") {
    if (!isUuid(collectionId)) return redirectResponse(withNotice("import-invalid"));
    path = `${path}/collections/${collectionId}`;
    method = "PATCH";
    body = { version, published: form.get("published") === "true" };
  } else if (action === "import-collection") {
    if (!isUuid(collectionId)) return redirectResponse(`${here}?notice=import-invalid`);
    path = `${path}/collections/${collectionId}/commit`;
    if (form.has("published")) body.published = form.get("published") === "true";
  } else if (action === "import-discard") {
    if (!isUuid(collectionId)) return redirectResponse(`${home}?tab=review&notice=import-invalid`);
    path = `${path}/collections/${collectionId}`;
    method = "DELETE";
  } else return redirectResponse(`${here}?notice=import-invalid`);
  const result = await importRequest<ImportDraftView | ImportSelectionResult>(
    request,
    path,
    body,
    method,
  );
  const enhanced = request.headers.get("accept")?.includes("application/json");
  if (result.status === 401) {
    const owner = await readLastAccount();
    const response = enhanced
      ? Response.json({ ok: false, code: "unauthenticated" }, { status: 401 })
      : redirectResponse(`/sign-in?returnTo=${encodeURIComponent(target)}`);
    for (const cookie of [
      owner
        ? await pendingActionCookie({
            path,
            method,
            body,
            target,
            owner,
            label: "save your import changes",
            issued: Date.now(),
          })
        : await pendingActionCookie(null),
    ])
      response.headers.append("set-cookie", cookie);
    return response;
  }
  if (enhanced)
    return result.ok
      ? Response.json({ ok: true, data: result.data })
      : Response.json({ ok: false, code: result.code }, { status: result.status || 503 });
  if (!result.ok) return redirectResponse(withNotice(notice(result.status)));
  if (action === "import-discard") return redirectResponse(`${home}?tab=review&notice=done`);
  const next = result.data && ("draft" in result.data ? result.data.draft : result.data);
  if (collectionId && next && !next.collections.some((c) => c.id === collectionId))
    return redirectResponse(`${home}?tab=review&notice=done`);
  return redirectResponse(withNotice(action === "import-collection" ? "import-queued" : "done"));
}
export async function startImport(request: Request) {
  const config = webServerConfig();
  if (
    request.headers.get("origin") !== config.publicOrigin ||
    request.headers.get("sec-fetch-site") === "cross-site"
  )
    return new Response("Forbidden", { status: 403 });
  // Bound the body before parsing multipart; Content-Length is not trusted.
  const limit = 10 * 1024 * 1024 + 65536,
    chunks: Uint8Array[] = [];
  let size = 0;
  try {
    const reader = request.body?.getReader();
    if (reader)
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        size += value.length;
        if (size > limit) {
          await reader.cancel();
          return redirectResponse(`${home}?notice=import-large`);
        }
        chunks.push(value);
      }
    const parsed = await new Request(request.url, {
      method: "POST",
      headers: { "content-type": request.headers.get("content-type") ?? "" },
      body: Buffer.concat(chunks),
    }).formData();
    const body = new FormData(),
      kind = parsed.get("sourceKind");
    if (!["text", "csv", "bookmarks"].includes(String(kind)))
      return redirectResponse(`${home}?notice=import-invalid`);
    body.set("sourceKind", String(kind));
    const file = parsed.get("file");
    if (!(file instanceof File) || !file.size)
      return redirectResponse(`${home}?notice=import-invalid`);
    body.set("file", file);
    const result = await importRequest<ImportDraftView>(request, "/api/v1/imports", body);
    if (result.status === 401)
      return redirectResponse(`/sign-in?returnTo=${encodeURIComponent(home)}`);
    return redirectResponse(
      result.ok && result.data ? `${home}?tab=review` : `${home}?notice=${notice(result.status)}`,
    );
  } catch {
    return redirectResponse(`${home}?notice=import-invalid`);
  }
}
