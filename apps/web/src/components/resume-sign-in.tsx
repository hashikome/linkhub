"use client";
import { useEffect, useRef } from "react";

export function ResumeSignIn() {
  const form = useRef<HTMLFormElement>(null);
  const submitted = useRef(false);
  useEffect(() => {
    if (submitted.current) return;
    submitted.current = true;
    form.current?.requestSubmit();
  }, []);
  return (
    <form ref={form} action="/forms/auth-complete" method="post">
      <p role="status">Returning to what you were doing…</p>
      <noscript>
        <button className="button primary" type="submit">
          Resume your action
        </button>
      </noscript>
    </form>
  );
}
