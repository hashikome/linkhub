"use client";
import { useEffect, useId, useRef, useState } from "react";

export function AuditIdValue({
  id,
  kind,
  display,
}: {
  id: string;
  kind: string;
  display?: string;
}) {
  const valueId = useId();
  const [status, setStatus] = useState("");
  const [enhanced, setEnhanced] = useState(false);
  const resetTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => setEnhanced(true), []);
  useEffect(() => () => clearTimeout(resetTimer.current), []);
  return (
    <span className="audit-id-copy">
      {enhanced ? (
        <button
          type="button"
          className="audit-id-value"
          title={id}
          aria-label={`Copy ${kind.toLowerCase()} ID`}
          aria-describedby={valueId}
          onClick={async () => {
            clearTimeout(resetTimer.current);
            try {
              await navigator.clipboard.writeText(id);
              setStatus("Copied");
              resetTimer.current = setTimeout(() => setStatus(""), 2000);
            } catch {
              setStatus("Select the ID to copy it.");
            }
          }}
        >
          <code>{status === "Select the ID to copy it." ? id : display || id}</code>
        </button>
      ) : (
        <code title={id}>{display || id}</code>
      )}
      <span id={valueId} className="sr-only">
        {id}
      </span>
      <span role="status" className="meta">
        {status && ` ${status}`}
      </span>
    </span>
  );
}
