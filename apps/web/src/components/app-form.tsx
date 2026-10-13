"use client";
import { type ComponentProps, useEffect, useRef, useState } from "react";
import { submitNavigationForm } from "../lib/http";
import { navigateInApp, refreshInApp } from "../lib/navigation";

export function AppForm({ onSubmit, children, ...props }: ComponentProps<"form">) {
  const inFlight = useRef(false);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  const [pending, setPending] = useState(false);
  const [failed, setFailed] = useState(false);
  return (
    <form
      {...props}
      aria-busy={pending || props["aria-busy"]}
      onSubmit={async (event) => {
        onSubmit?.(event);
        if (event.defaultPrevented) return;
        const form = event.currentTarget;
        const submitter = (event.nativeEvent as SubmitEvent).submitter;
        const button =
          submitter instanceof HTMLButtonElement || submitter instanceof HTMLInputElement
            ? submitter
            : null;
        // Named controls (for example action or method) can shadow DOM properties.
        const target = button?.getAttribute("formtarget") ?? form.getAttribute("target");
        if (target && target !== "_self") return;
        const url = new URL(
          button?.getAttribute("formaction") ?? form.getAttribute("action") ?? window.location.href,
          window.location.href,
        );
        const method = (
          button?.getAttribute("formmethod") ??
          form.getAttribute("method") ??
          "get"
        ).toLowerCase();
        if (url.origin !== window.location.origin || !["get", "post"].includes(method)) return;
        if (method === "post" && !/^\/forms\/[a-z-]+$/.test(url.pathname)) return;
        event.preventDefault();
        if (inFlight.current) return;
        const data = new FormData(form, submitter);
        const encoded = new URLSearchParams();
        for (const [key, value] of data)
          encoded.append(key, typeof value === "string" ? value : value.name);
        if (method === "get") {
          url.search = encoded.toString();
          navigateInApp(url.pathname + url.search + url.hash, false, false);
          return;
        }
        inFlight.current = true;
        setPending(true);
        setFailed(false);
        if (button) button.disabled = true;
        try {
          const body =
            (button?.getAttribute("formenctype") ?? form.getAttribute("enctype")) ===
            "multipart/form-data"
              ? data
              : encoded;
          const { redirect, refresh } = await submitNavigationForm(url.pathname, body);
          if (mounted.current) navigateInApp(redirect, false, refresh);
        } catch {
          setFailed(true);
        } finally {
          inFlight.current = false;
          setPending(false);
          if (button) button.disabled = false;
        }
      }}
    >
      {children}
      {pending && (
        <p className="meta" role="status">
          Submitting…
        </p>
      )}
      {failed && (
        <div className="form-feedback" role="alert">
          <p>
            We couldn’t confirm the result. Your entries are still here. Check the current state
            before submitting again.
          </p>
          <button className="button" type="button" onClick={refreshInApp}>
            Check current state
          </button>
        </div>
      )}
    </form>
  );
}
