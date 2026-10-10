import type { Metadata } from "next";
import { redirect } from "next/navigation";
import QRCode from "qrcode";
import { FormNotice } from "../../../components/form-notice";
import { NativeForm } from "../../../components/native-form";
import { PasskeyButton } from "../../../components/passkey-button";
import { readFlow } from "../../../lib/form-server";
import { queryValue } from "../../../lib/http";
import type { SecurityStatus } from "../../../lib/security-types";
import { serverRead } from "../../../lib/server-api";
import { readOwnProfile } from "../../../lib/session";
export const metadata: Metadata = { title: "Account security" };
export const dynamic = "force-dynamic";
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [query, profile, result, setup] = await Promise.all([
    searchParams,
    readOwnProfile(),
    serverRead<SecurityStatus>("/api/v1/auth/security/status"),
    readFlow("security_setup"),
  ]);
  if (!profile) redirect("/sign-in?returnTo=/settings/security");
  if (!result.ok)
    return (
      <section className="reader account-flow">
        <h1>Account security</h1>
        <p>We couldn't load your security settings.</p>
        <a href="/settings/security">Try again</a>
      </section>
    );
  const status = result.data;
  const saved =
    setup?.email === profile.email && Date.now() - setup.issued < 300_000
      ? (setup as typeof setup & { totpURI?: string; backupCodes?: string[] })
      : null;
  const uri = !status.totp ? saved?.totpURI : undefined;
  const qr = uri ? await QRCode.toDataURL(uri, { width: 200, margin: 2 }) : undefined;
  return (
    <section className="reader account-flow security-page">
      <a href="/settings">Back to Settings</a>
      <h1>Account security</h1>
      <p>
        Use a passkey for sign-in with your device's fingerprint, face or PIN. Google and email
        sign-ins also ask for a registered method or recovery code when your account is protected.
      </p>
      <FormNotice code={queryValue(query.notice)} />
      {!status.fresh && (
        <p className="feedback">
          For security, <a href="/sign-in?returnTo=/settings/security">sign in again</a> before
          adding or removing a method.
        </p>
      )}
      <section className="security-section" aria-labelledby="passkeys-heading">
        <h2 id="passkeys-heading">Passkeys</h2>
        <p>
          Keep a second passkey on another device or in a password manager so you have another way
          in.
        </p>
        {status.passkeys.length ? (
          <ul className="security-methods">
            {status.passkeys.map((key) => (
              <li key={key.id}>
                <span>{key.name || "Passkey"}</span>
                <NativeForm action="/forms/security-passkey-remove">
                  <input type="hidden" name="id" value={key.id} />
                  <label>
                    <input type="checkbox" name="confirm" value="yes" required /> Remove this
                    passkey
                  </label>
                  <button type="submit" className="button" disabled={!status.fresh}>
                    Remove
                  </button>
                </NativeForm>
              </li>
            ))}
          </ul>
        ) : (
          <p>No passkeys added yet.</p>
        )}
        {status.fresh && <PasskeyButton register />}
        {status.passkeys.length === 1 && !status.totp && (
          <p className="field-help">
            Removing your last passkey returns this account to email or Google sign-in without a
            second step.
          </p>
        )}
        <p>
          <a href="/support#passkeys">How do I use a passkey?</a>
        </p>
      </section>
      <section className="security-section" aria-labelledby="totp-heading">
        <h2 id="totp-heading">Authenticator app</h2>
        {status.totp ? (
          <>
            <p>
              Your authenticator is enabled. A passkey can sign you in without an authenticator
              code.
            </p>
            <NativeForm action="/forms/security-totp-remove">
              <label>
                <input type="checkbox" name="confirm" value="yes" required /> Remove my
                authenticator{status.passkeys.length ? "" : " and its extra sign-in protection"}
              </label>
              <button type="submit" className="button" disabled={!status.fresh}>
                Remove authenticator
              </button>
            </NativeForm>
          </>
        ) : uri ? (
          <>
            <p>
              Scan this QR code with your authenticator app, then enter its six-digit code to finish
              setup.
            </p>
            {/* biome-ignore lint/performance/noImgElement: local secret-bearing QR data must never go through an image service. */}
            <img src={qr} width={200} height={200} alt="Authenticator setup QR code" />
            <details>
              <summary>Enter a setup key instead</summary>
              <p>
                <code className="security-secret">{new URL(uri).searchParams.get("secret")}</code>
              </p>
              <p>Use time-based codes, six digits, every 30 seconds.</p>
            </details>
            <NativeForm action="/forms/security-totp-confirm">
              <label htmlFor="totp-code">Six-digit code</label>
              <input
                id="totp-code"
                name="code"
                autoComplete="one-time-code"
                inputMode="numeric"
                pattern="[0-9\s\-]{6,12}"
                maxLength={12}
                required
              />
              <button type="submit" className="button primary">
                Enable authenticator
              </button>
            </NativeForm>
          </>
        ) : (
          <>
            <p>
              Add an app such as Google Authenticator, Microsoft Authenticator or a password manager
              that supports time-based codes.
            </p>
            <NativeForm action="/forms/security-totp-start">
              <p className="field-help">
                Setup creates a new set of recovery codes. Save them before leaving this page.
              </p>
              <button type="submit" className="button" disabled={!status.fresh}>
                Set up authenticator
              </button>
            </NativeForm>
          </>
        )}
        <p>
          <a href="/support#authenticator">How do I use an authenticator app?</a>
        </p>
      </section>
      {saved?.backupCodes && (
        <section className="security-section security-recovery">
          <h2>Save your recovery codes</h2>
          <p>
            Keep these somewhere safe outside this account. Each works once, after an email or
            Google sign-in. These codes are shown here for five minutes.
          </p>
          <ul>
            {saved.backupCodes.map((code) => (
              <li key={code}>
                <code>{code}</code>
              </li>
            ))}
          </ul>
          <NativeForm action="/forms/security-dismiss">
            <button type="submit" className="button">
              I've saved my codes
            </button>
          </NativeForm>
        </section>
      )}
      {(status.totp || status.passkeys.length > 0) && (
        <section className="security-section">
          <h2>Recovery codes</h2>
          <p>
            A recovery code can replace your authenticator or passkey after an email or Google
            sign-in. Using one leaves your protection enabled.
          </p>
          <NativeForm action="/forms/security-recovery-rotate">
            <p className="field-help">
              Creating new codes invalidates every previous recovery code.
            </p>
            <button type="submit" className="button" disabled={!status.fresh}>
              Create new recovery codes
            </button>
          </NativeForm>
        </section>
      )}
      {status.google && (
        <section className="security-section">
          <h2>Google sign-in</h2>
          <p>
            Use Google to sign in to this existing account. Your Google account must use the same
            email address.
          </p>
          {status.googleLinked ? (
            <NativeForm action="/forms/security-google-remove">
              <label>
                <input type="checkbox" name="confirm" value="yes" required /> Disconnect Google
              </label>
              <button type="submit" className="button" disabled={!status.fresh}>
                Disconnect
              </button>
            </NativeForm>
          ) : (
            <NativeForm action="/forms/google-link">
              <button type="submit" className="button" disabled={!status.fresh}>
                Connect Google
              </button>
            </NativeForm>
          )}
        </section>
      )}
      <p>
        <a href="/support#account-recovery">How do I recover access?</a>
      </p>
    </section>
  );
}
