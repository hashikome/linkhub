import { webServerConfig } from "@nslinkhub/config/web-server";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Support" };
export const dynamic = "force-dynamic";

// Every email footer links here. The contact address is deployment config.
export default function Page() {
  const email = webServerConfig().supportEmail;
  return (
    <section className="reader account-flow support-page">
      <h1>Support</h1>
      <p>
        Questions about nslinkhub, trouble signing in, or an email you didn't expect? We're happy to
        help.
      </p>
      {email ? (
        <p className="support-contact">
          Write to <a href={`mailto:${email}`}>{email}</a> and include the email address you use
          with nslinkhub. Never send your sign-in code; we will never ask for it.
        </p>
      ) : (
        <p className="support-contact">
          Our support inbox isn't set up yet. Please check back soon.
        </p>
      )}
      <h2 id="profile-picture">How do I update my profile picture?</h2>
      <p>
        We use <a href="https://gravatar.com/">Gravatar</a> for profile pictures. Sign in there or
        create an account, then add and verify the same email address you use for nslinkhub. Upload
        a picture and choose it for that email address.
      </p>
      <p>
        Your picture is public on your profile and contributions. Gravatar is optional: when no
        picture is available, we show your generated icon. After updating your picture, allow up to
        an hour for the change to appear, then reload nslinkhub.
      </p>
      <h2 id="passkeys">How do I use a passkey?</h2>
      <p>
        Sign in, open Settings → Security and choose Add a passkey. Your device will ask for a
        fingerprint, face scan or PIN. Give the passkey a name you recognize. Next time, choose Sign
        in with a passkey; you won't need an email or authenticator code.
      </p>
      <p>
        Keep another passkey or your recovery codes somewhere you can reach if you lose your device.
        Passkeys require JavaScript and a supported browser.
      </p>
      <h2 id="authenticator">How do I use an authenticator app?</h2>
      <p>
        Open Settings → Security and choose Set up authenticator. Scan the QR code with your
        authenticator app, or enter the setup key manually. Enter the six-digit code from the app to
        enable it, and save your recovery codes outside this account.
      </p>
      <p>
        After signing in with email or Google, enter the current code from your app. If a code was
        just used, wait for the next one. A registered passkey can also complete sign-in. Removing
        an authenticator requires a recent completed sign-in.
      </p>
      <h2 id="google-sign-in">How do I sign in with Google?</h2>
      <p>
        Google signs you in to an existing nslinkhub account; it cannot create one. Use the same
        email address for both accounts. If Google can't connect automatically, sign in with email
        first, then choose Connect Google in Settings → Security. Any protection you enabled still
        applies.
      </p>
      <h2 id="account-recovery">How do I recover access?</h2>
      <p>
        Try another registered passkey or sign in with email or Google, then choose Use a recovery
        code. Each recovery code works once and leaves your security methods enabled. Once signed
        in, replace a lost method and create a new set of recovery codes; older codes will stop
        working.
      </p>
      <p>
        An email code alone cannot bypass your passkey or authenticator protection. We cannot remove
        that protection through the support inbox. Keep at least one working method or saved
        recovery code. Reactivating an account preserves its security methods.
      </p>
      <h2>Got an email you didn't request?</h2>
      <p>
        You can safely ignore it. A sign-in code does nothing unless someone enters it, and it
        expires after five minutes. Invitations change nothing unless you accept them.
      </p>
    </section>
  );
}
