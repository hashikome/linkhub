import { type ImportRowView, importRowStatuses } from "@nslinkhub/types";
import { notFound, redirect } from "next/navigation";
import { queryValue } from "../../../../../../lib/http";
import { serverRead } from "../../../../../../lib/server-api";
import { isUuid } from "../../../../../../lib/validation";

// Preserve old draft links while keeping all corrections in the review table.
export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ id: string; rowId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { id, rowId } = await params;
  if (!isUuid(id) || !isUuid(rowId)) notFound();
  const query = await searchParams;
  const status = importRowStatuses.find((s) => s === queryValue(query.status));
  const row = await serverRead<ImportRowView>(`/api/v1/imports/${id}/rows/${rowId}`);
  if (!row.ok) {
    if (row.status === 401)
      redirect(
        `/sign-in?returnTo=${encodeURIComponent(`/manage/import-export/${id}/rows/${rowId}${status ? `?status=${status}` : ""}`)}`,
      );
    notFound();
  }
  redirect(
    `/manage/import-export/${id}?collection=${row.data.collectionKey}&edit=${rowId}${status ? `&status=${status}` : ""}`,
  );
}
