"use client";
import { useEffect, useId, useRef, useState } from "react";

export function ActionPicker({
  label,
  name,
  options,
}: {
  label: string;
  name: string;
  options: { href: string; label: string }[];
}) {
  const [ready, setReady] = useState(false);
  const dialog = useRef<HTMLDialogElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const headingId = useId();
  const descriptionId = useId();
  useEffect(() => setReady(true), []);
  if (!options.length) return <span className="ops-primary">{name}</span>;
  const choices = (
    <ul className="action-choices">
      {options.map((option) => {
        return (
          <li key={option.href}>
            <a
              href={option.href}
              onClick={(event) => {
                if (!event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey)
                  dialog.current?.close();
              }}
            >
              {option.label}
            </a>
          </li>
        );
      })}
    </ul>
  );
  return (
    <>
      <button
        ref={trigger}
        type="button"
        className="ops-primary collection-open action-trigger"
        aria-label={label}
        aria-haspopup="dialog"
        disabled={!ready}
        onClick={() => dialog.current?.showModal()}
      >
        {name}
      </button>
      <dialog
        ref={dialog}
        className="action-dialog"
        aria-labelledby={headingId}
        aria-describedby={descriptionId}
        onClose={() => trigger.current?.focus()}
      >
        <header className="action-dialog-heading">
          <h2 id={headingId}>Actions</h2>
          <p id={descriptionId}>{name}</p>
        </header>
        {choices}
        <footer className="action-dialog-footer">
          <button type="button" className="button" onClick={() => dialog.current?.close()}>
            Close
          </button>
        </footer>
      </dialog>
      <noscript>
        <style>{".action-trigger { display: none; }"}</style>
        <details className="action-menu">
          <summary className="ops-primary collection-open" aria-label={label}>
            {name}
          </summary>
          {choices}
        </details>
      </noscript>
    </>
  );
}
