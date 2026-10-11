import { webServerConfig } from "@linkhub/config/web-server";
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
        Questions about linkhub, trouble signing in, or an email you didn't expect? We're happy to
        help.
      </p>
      {email ? (
        <p className="support-contact">
          Write to <a href={`mailto:${email}`}>{email}</a> and include the email address you use
          with linkhub. Never send your sign-in code; we will never ask for it.
        </p>
      ) : (
        <p className="support-contact">
          Our support inbox isn't set up yet. Please check back soon.
        </p>
      )}
      <p>
        <a href="/support/imports">Importing bookmarks, CSV and text files</a>
      </p>
      <h2 id="profile-picture">How do I update my profile picture?</h2>
      <p>
        We use <a href="https://gravatar.com/">Gravatar</a> for profile pictures. Sign in there or
        create an account, then add and verify the same email address you use for linkhub. Upload a
        picture and choose it for that email address.
      </p>
      <p>
        Your picture is public on your profile and contributions. Gravatar is optional: when no
        picture is available, we show your generated icon. After updating your picture, allow up to
        an hour for the change to appear, then reload linkhub.
      </p>
      <h2 id="passkeys">How do I use a passkey?</h2>
      <p>
        Sign in, open Settings → Security and choose Add a passkey. Your device will ask for a
        fingerprint, face scan or PIN. Give the passkey a name you recognize. Next time, continue
        with your email, then choose Sign in with a passkey. You won't need an email or
        authenticator code. A passkey can also finish Google sign-in.
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
      <h2 id="create-account">How do I create an account?</h2>
      <p>
        Choose Create an account from Sign in, then continue with your email or Google. After
        verification, review your email and choose Create account. You can select Start with a hub
        and give it a name, or create a hub later. Its initial handle matches your username; both
        can be changed in Settings under their usual rules.
      </p>
      <h2 id="google-sign-in">How do I sign in with Google?</h2>
      <p>
        Choose Continue with Google and use the email for your linkhub account. If a first-time
        check is needed, verify an email code or use a registered passkey to sign in. Any protection
        you enabled still applies.
      </p>
      <p>
        If that email has no account here, we'll tell you before creating one. Choose Create account
        to continue with your verified Google email and name, without another email code. If you
        already have an account, choose Sign in to return and use your account's email or the
        correct Google account. Your Google email must always match your account email. You can
        always continue with email instead. Saving your first link and accepting an invitation use
        email verification directly.
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
