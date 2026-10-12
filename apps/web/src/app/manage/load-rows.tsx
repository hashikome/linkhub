"use server";
import type {
  HubPerson,
  ManagedCollection,
  OperatorAccount,
  ServiceInvitationView,
  SessionView,
} from "@ntumie/types";
import {
  accountsRows,
  invitationsRows,
  managedCollectionsRows,
  peopleRows,
  teamRows,
} from "../../components/manage-rows";
import type { ManageRow } from "../../components/manage-table";
import { type ApiPath, failure, type Result, withCursor } from "../../lib/http";
import { openSearch } from "../../lib/manage-search";
import { serverRead } from "../../lib/server-api";

type List = "managed-collections" | "accounts" | "people" | "team" | "invitations";

// A continuation read returns server-rendered rows so operation forms retain
// their server-generated IDs. Each request uses the current session and API policy.
export async function loadManageRows(
  kind: List,
  sealed: string,
  cursor: string,
): Promise<Result<ManageRow[]>> {
  if (
    typeof cursor !== "string" ||
    cursor.length > 4096 ||
    typeof sealed !== "string" ||
    sealed.length > 4096
  )
    return failure("invalid_cursor", 400);
  const session = await serverRead<SessionView>("/api/v1/session");
  if (!session.ok) return session;
  switch (kind) {
    case "managed-collections": {
      const params = new URLSearchParams({ cursor, ...(sealed ? { q: sealed } : {}) });
      const result = await serverRead<ManagedCollection[]>(`/api/v1/manage/collections?${params}`);
      const here = `/manage/collections${sealed ? `?${new URLSearchParams({ q: sealed })}` : ""}`;
      return result.ok ? { ...result, data: managedCollectionsRows(result.data, here) } : result;
    }
    case "accounts": {
      const q = openSearch(sealed);
      const params = new URLSearchParams({ cursor });
      if (q) params.set("q", q);
      const result = await serverRead<OperatorAccount[]>(
        `/api/v1/operations/accounts?${params}` as ApiPath,
      );
      return result.ok ? { ...result, data: accountsRows(result.data) } : result;
    }
    case "people": {
      const result = await serverRead<HubPerson[]>(withCursor("/api/v1/me/people", cursor));
      return result.ok ? { ...result, data: peopleRows(result.data) } : result;
    }
    case "team": {
      const result = await serverRead<OperatorAccount[]>(
        withCursor("/api/v1/operations/operators", cursor),
      );
      return result.ok ? { ...result, data: teamRows(result.data) } : result;
    }
    case "invitations": {
      const result = await serverRead<ServiceInvitationView[]>(
        withCursor("/api/v1/operations/operator-invitations", cursor),
      );
      return result.ok ? { ...result, data: invitationsRows(result.data) } : result;
    }
    default:
      return failure("not_found", 404);
  }
}
