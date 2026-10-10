"use client";
import { type AuditLogEntry, auditReadActions } from "@nslinkhub/types";
import { useEffect, useRef, useState } from "react";
import { auditActionLabel, auditTarget } from "../lib/audit-presentation";
import { type Failure, readJson } from "../lib/http";
import { shortIds } from "../lib/short-id";
import { AuditEffect, AuditOutcome } from "./audit-effect";
import { AuditIdValue } from "./audit-identity";
import { Retry } from "./feedback";
import { LocalTime } from "./local-time";

export function AuditEvents({
  initial,
  nextCursor,
  filters,
}: {
  initial: AuditLogEntry[];
  nextCursor?: string | null;
  filters: string;
}) {
  const [items, setItems] = useState(initial);
  const [cursor, setCursor] = useState(nextCursor);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<Failure>();
  const [announcement, setAnnouncement] = useState("");
  const active = useRef<AbortController | null>(null);
  const table = useRef<HTMLTableElement>(null);
  const params = new URLSearchParams(filters);
  if (cursor) params.set("cursor", cursor);
  const href = `/manage/audit?${params}`;
  useEffect(() => {
    const stop = () => active.current?.abort();
    window.addEventListener("reader:suspend", stop);
    return () => {
      stop();
      window.removeEventListener("reader:suspend", stop);
    };
  }, []);
  useEffect(() => {
    if (announcement && !cursor) table.current?.focus({ preventScroll: true });
  }, [announcement, cursor]);
  async function more() {
    if (!cursor || active.current) return;
    const controller = new AbortController();
    active.current = controller;
    setPending(true);
    setError(undefined);
    const result = await readJson<AuditLogEntry[]>(`/manage/audit/more?${params}`, {
      timeout: 10000,
      signal: controller.signal,
    });
    if (controller.signal.aborted) return;
    active.current = null;
    setPending(false);
    if (!result.ok) {
      if ([401, 403].includes(result.status)) {
        window.location.reload();
        return;
      }
      setError(result);
      return;
    }
    const seen = new Set(items.map((item) => item.id));
    const additions = result.data.filter((item) => {
      if (seen.has(item.id)) return false;
      seen.add(item.id);
      return true;
    });
    setItems((current) => [...current, ...additions]);
    setCursor(result.meta?.nextCursor);
    setAnnouncement(
      `${additions.length} more events loaded.${result.meta?.nextCursor ? "" : " All events loaded."}`,
    );
  }
  const ids = shortIds(
    items.flatMap((event) =>
      [
        event.id,
        event.actorUserId,
        event.targetUserId,
        event.hubId,
        event.collectionId,
        event.resourceId,
        event.invitationId,
      ].filter((id): id is string => !!id),
    ),
  );
  return (
    // biome-ignore lint/a11y/noNoninteractiveTabindex: The scrollable event region needs keyboard focus for Page Up/Down and End.
    <section className="ops-table-scroll" aria-label="Audit events" tabIndex={0}>
      <noscript>
        <p className="meta">Times shown in UTC.</p>
      </noscript>
      {items.length ? (
        <table className="ops-table" ref={table} tabIndex={-1} aria-busy={pending}>
          <caption className="sr-only">Audit Log, newest first</caption>
          <thead>
            <tr>
              <th scope="col">Timestamp</th>
              <th scope="col">Actor</th>
              <th scope="col">Action</th>
              <th scope="col">Target</th>
              <th scope="col">Outcome</th>
              <th scope="col">Change</th>
            </tr>
          </thead>
          <tbody>
            {items.map((event) => {
              const targetId = auditTarget(event);
              return (
                <tr key={event.id}>
                  <td data-label="Timestamp">
                    <LocalTime at={event.createdAt} variant="international" />
                  </td>
                  <td data-label="Actor">
                    {event.actorUsername && (
                      <span className="ops-secondary" title="Current username">
                        {event.actorUsername}
                      </span>
                    )}
                    {event.actorUserId ? (
                      <AuditIdValue
                        id={event.actorUserId}
                        kind="User"
                        display={ids.get(event.actorUserId)}
                      />
                    ) : (
                      event.authority || event.actorKind
                    )}
                  </td>
                  <td data-label="Action">
                    <span className="ops-primary">{auditActionLabel(event.action)}</span>
                  </td>
                  <td data-label="Target">
                    {targetId ? (
                      <AuditIdValue id={targetId} kind="Target" display={ids.get(targetId)} />
                    ) : (auditReadActions as readonly string[]).includes(event.action) ? (
                      "No individual target"
                    ) : (
                      "Not recorded"
                    )}
                  </td>
                  <td data-label="Outcome">
                    <AuditOutcome event={event} />
                  </td>
                  <td data-label="Change">
                    <AuditEffect event={event} />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      ) : (
        <p className="empty">No events match these filters.</p>
      )}
      <p className="sr-only" role="status">
        {announcement}
      </p>
      {(cursor || error) && (
        <div className="continuation">
          {error && (
            <p role="status">
              {error.code === "invalid_cursor"
                ? "These results have changed. Reload to see the latest events."
                : "Couldn't load more. Your current events are still here."}
            </p>
          )}
          {error?.code === "invalid_cursor" ? (
            <a className="button" href={`/manage/audit?${filters}`}>
              Reload events
            </a>
          ) : error ? (
            <Retry seconds={error.retryAfter} action={() => void more()} />
          ) : (
            <a
              className="button"
              href={href}
              aria-disabled={pending}
              onClick={(event) => {
                if (
                  event.button !== 0 ||
                  event.metaKey ||
                  event.ctrlKey ||
                  event.shiftKey ||
                  event.altKey
                )
                  return;
                event.preventDefault();
                void more();
              }}
            >
              {pending ? "Loading…" : "Load more"}
            </a>
          )}
        </div>
      )}
    </section>
  );
}
