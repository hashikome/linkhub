"use client";
import { type ReactNode, useState } from "react";

// Native POST remains authoritative, including without JavaScript. Pending
// feedback prevents accidental repeated submissions; Escape permits a retry.
export function NativeForm({
  action,
  id,
  children,
  encType,
  className,
}: {
  action: string;
  id?: string;
  children: ReactNode;
  encType?: "multipart/form-data";
  className?: string;
}) {
  const [pending, setPending] = useState(false);
  return (
    <form
      id={id}
      action={action}
      method="post"
      encType={encType}
      className={["action-form", className].filter(Boolean).join(" ")}
      aria-busy={pending}
      onSubmit={(event) => {
        if (pending) {
          event.preventDefault();
          return;
        }
        setPending(true);
      }}
      onKeyDown={(event) => {
        if (event.key === "Escape") setPending(false);
      }}
    >
      {children}
      {pending && <p role="status">Submitting… If this stops, press Escape and try again.</p>}
    </form>
  );
}
