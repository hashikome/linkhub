"use client";
import { createShareOpenEvent, type ShareKind, shareAttributionFromParams } from "@nslinkhub/types";
import { useEffect, useRef } from "react";
import { submitForm } from "../lib/http";
import { isUuid } from "../lib/validation";

/** Mount only after successfully loading the resource, never in metadata or prefetch. */
export function ShareOpen({
  shareId,
  kind,
  resourceId,
  token,
}: {
  shareId?: string;
  kind: ShareKind;
  resourceId?: string;
  token?: string;
}) {
  const report = useRef<{ key: string; sent: boolean } | null>(null);
  useEffect(() => {
    if (!shareId || !isUuid(shareId)) return;
    const key = `${shareId}:${kind}:${resourceId ?? ""}`;
    if (report.current?.key !== key) report.current = { key, sent: false };
    const current = report.current;
    const send = () => {
      if (document.visibilityState !== "visible" || current.sent) return;
      current.sent = true;
      const event = createShareOpenEvent({
        ...(kind === "site" ? { kind } : { kind, id: resourceId ?? "" }),
        attribution: shareAttributionFromParams(new URLSearchParams(window.location.search)),
        context: { timezone: Intl.DateTimeFormat().resolvedOptions().timeZone },
      });
      const body = new URLSearchParams({
        shareId,
        kind,
        eventId: event.eventId,
        occurredAt: event.occurredAt ?? "",
        attribution: JSON.stringify(event.attribution),
        context: JSON.stringify(event.context),
      });
      if (resourceId) body.set("id", resourceId);
      if (token) body.set("token", token);
      // Best-effort analytics never blocks reading. The same event ID makes retries safe.
      void submitForm("/forms/share-open", body).then((result) => {
        if (!result.ok && (result.status === 0 || result.status >= 500))
          void submitForm("/forms/share-open", body);
      });
    };
    send();
    document.addEventListener("visibilitychange", send);
    return () => document.removeEventListener("visibilitychange", send);
  }, [shareId, kind, resourceId, token]);
  return null;
}
