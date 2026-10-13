"use client";

import { startAuthentication, startRegistration } from "@simplewebauthn/browser";
import { useEffect, useRef, useState } from "react";
import { type PasskeyPath, submitForm, submitPasskey } from "../lib/http";
import { navigateInApp } from "../lib/navigation";
import { AppForm } from "./app-form";

class PasskeyRequestError extends Error {}

async function post<T>(path: PasskeyPath, body: unknown = {}): Promise<T> {
  const result = await submitPasskey<T>(path, body);
  if (!result.ok)
    throw new PasskeyRequestError(
      result.code === "recent_auth_required"
        ? "Sign in again before changing your security settings."
        : "We couldn't verify your passkey. Try again or use another sign-in method.",
    );
  return result.data;
}
export function PasskeyButton({
  register = false,
  returnTo = "/hub",
  pending = false,
  email,
  googleConnection = false,
}: {
  register?: boolean;
  returnTo?: string;
  pending?: boolean;
  email?: string;
  googleConnection?: boolean;
}) {
  const [supported, setSupported] = useState<boolean | null>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const [codes, setCodes] = useState<string[]>([]),
    [name, setName] = useState("");
  const finish = useRef<HTMLFormElement>(null);
  useEffect(() => setSupported(!!window.PublicKeyCredential), []);
  return (
    <div className="security-passkey">
      {register && (
        <>
          <label htmlFor="passkey-name">Passkey name</label>
          <input
            id="passkey-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={100}
            placeholder="For example, my phone"
          />
        </>
      )}
      <button
        className={`button ${register ? "" : "primary"}`}
        type="button"
        disabled={!supported || busy || codes.length > 0}
        onClick={async () => {
          setError("");
          setBusy(true);
          try {
            if (register) {
              const optionsJSON = await post<
                Parameters<typeof startRegistration>[0]["optionsJSON"]
              >("/security/passkey/options");
              const response = await startRegistration({ optionsJSON });
              const result = await post<{ backupCodes?: string[] }>("/security/passkey/verify", {
                response,
                name: name.trim() || "Passkey",
              });
              if (result.backupCodes) setCodes(result.backupCodes);
              else navigateInApp("/settings/security?notice=security-saved");
            } else {
              if (!pending && !email && !googleConnection) {
                const started = await submitForm(
                  "/forms/auth-start",
                  new URLSearchParams({ returnTo }),
                );
                if (!started.ok)
                  throw new PasskeyRequestError("Couldn't start sign-in. Please try again.");
              }
              const optionsJSON = await post<
                Parameters<typeof startAuthentication>[0]["optionsJSON"]
              >("/passkey/generate-authenticate-options", {
                continueSignIn: pending,
                ...(email ? { email } : {}),
                ...(googleConnection ? { googleConnection: true } : {}),
              });
              const response = await startAuthentication({ optionsJSON });
              await post("/passkey/verify-authentication", { response });
              finish.current?.requestSubmit();
            }
          } catch (cause) {
            setError(
              cause instanceof PasskeyRequestError
                ? cause.message
                : cause instanceof Error && cause.name === "NotAllowedError"
                  ? "Passkey sign-in was cancelled. Try again or use another method."
                  : "We couldn't use this passkey. Try again or use another sign-in method.",
            );
          } finally {
            setBusy(false);
          }
        }}
      >
        {busy ? "Waiting for your device…" : register ? "Add a passkey" : "Sign in with a passkey"}
      </button>
      {supported === false && (
        <p>
          This browser does not support passkeys. Use email and your authenticator or recovery code
          instead.
        </p>
      )}
      <noscript>
        <p>
          Passkeys need JavaScript and a supported browser. You can use an email code and your
          authenticator or recovery code instead.
        </p>
      </noscript>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {codes.length > 0 && (
        <div className="security-recovery">
          <h3>Save your recovery codes</h3>
          <p>
            Keep these somewhere safe outside this account. Each code works once, after an email or
            Google sign-in.
          </p>
          <ul>
            {codes.map((code) => (
              <li key={code}>
                <code>{code}</code>
              </li>
            ))}
          </ul>
          <a className="button" href="/settings/security">
            I've saved my codes
          </a>
        </div>
      )}
      {!register && (
        <AppForm ref={finish} action="/forms/auth-complete" method="post" hidden>
          <button type="submit">Continue</button>
        </AppForm>
      )}
    </div>
  );
}
