"use client";
import type { CreatedShareEntry, ShareRequest, ShareTarget } from "@nslinkhub/types";
import { useEffect, useId, useRef, useState } from "react";
import { submitForm } from "../lib/http";

export function ShareLink({
  url,
  label = "Collection link",
  restricted = false,
  target,
  token,
}: {
  url: string;
  label?: string;
  restricted?: boolean;
  target?: ShareTarget;
  token?: string;
}) {
  const inputId = useId();
  const operationId = useRef<string | null>(null);
  const [enhanced, setEnhanced] = useState(false);
  const [status, setStatus] = useState("");
  const [trackedUrl, setTrackedUrl] = useState<string>();
  const [busy, setBusy] = useState(false);
  useEffect(() => setEnhanced(true), []);
  return (
    <div className="action-form">
      <label htmlFor={inputId}>{label}</label>
      <input id={inputId} value={trackedUrl ?? url} readOnly onFocus={(e) => e.target.select()} />
      {restricted && (
        <p className="meta">Only people who already have access can open this link.</p>
      )}
      <div className="form-actions">
        <button
          type="button"
          className="button primary"
          disabled={!enhanced || busy}
          onClick={async () => {
            setBusy(true);
            try {
              let link = trackedUrl ?? url;
              if (target && !trackedUrl) {
                operationId.current ??= crypto.randomUUID();
                const entry = {
                  ...target,
                  operationId: operationId.current,
                } satisfies ShareRequest;
                const body = new URLSearchParams(entry);
                if (token) body.set("token", token);
                const result = await submitForm<CreatedShareEntry>("/forms/share-create", body);
                if (!result.ok) {
                  setStatus("Unable to prepare the link. Try again, or copy the link above.");
                  return;
                }
                link = result.data.resource.url;
                setTrackedUrl(link);
              }
              try {
                await navigator.clipboard.writeText(link);
                setStatus("Link copied.");
              } catch {
                setStatus("Select the link above and copy it.");
              }
            } finally {
              setBusy(false);
            }
          }}
        >
          Copy link
        </button>
      </div>
      <noscript>
        <p className="meta">Select the link above and copy it.</p>
      </noscript>
      <p role="status">{status}</p>
    </div>
  );
}
