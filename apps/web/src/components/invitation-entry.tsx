"use client";

import { useEffect, useRef } from "react";
import { AppForm } from "./app-form";
// Only a read-only preview is submitted automatically; email scanners/GETs
// never accept an invitation. The fragment never reaches HTTP access logs.
export function InvitationEntry() {
  const form = useRef<HTMLFormElement>(null),
    token = useRef<HTMLInputElement>(null);
  useEffect(() => {
    const value = new URLSearchParams(window.location.hash.slice(1)).get("token");
    if (!value || !/^[A-Za-z0-9_-]{43}$/.test(value) || !form.current || !token.current) return;
    token.current.value = value;
    window.history.replaceState(null, "", window.location.pathname);
    form.current.requestSubmit();
  }, []);
  return (
    <>
      <p>
        Check your inbox for your invitation email. Use its Review invitation button to review,
        accept or decline. If you don't see the email, check your spam folder.
      </p>
      <AppForm ref={form} action="/forms/invitation-open" method="post" hidden>
        <input ref={token} type="hidden" name="token" />
      </AppForm>
      <noscript>
        <p>JavaScript is off. Paste the full link from your invitation email to open it here.</p>
        <AppForm action="/forms/invitation-open" method="post" className="action-form">
          <label htmlFor="email-invitation">Invitation link</label>
          <input id="email-invitation" name="token" required autoComplete="off" maxLength={2048} />
          <button type="submit" className="button">
            Review invitation
          </button>
        </AppForm>
      </noscript>
    </>
  );
}
