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
      <h2>Got an email you didn't request?</h2>
      <p>
        You can safely ignore it. A sign-in code does nothing unless someone enters it, and it
        expires after five minutes. Invitations change nothing unless you accept them.
      </p>
    </section>
  );
}
