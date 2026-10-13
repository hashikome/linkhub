import {
  Body,
  Button,
  Container,
  Head,
  Html,
  Preview,
  render,
  Text,
} from "@react-email/components";
import { EmailFooter, EmailWordmark, type RenderedEmail } from "./code-email.js";

export async function renderServiceInvitation(input: {
  role: "admin" | "operator";
  invitationUrl: string;
  expiresAt: Date;
  supportUrl: string;
}): Promise<RenderedEmail> {
  const url = new URL(input.invitationUrl);
  if (!["http:", "https:"].includes(url.protocol) || url.username || url.password)
    throw new Error("Invalid invitation URL");
  const role = input.role === "admin" ? "service admin" : "service operator";
  const subject = `You're invited to be a ntumie. ${role}`;
  const html = await render(
    <Html lang="en">
      <Head />
      <Preview>{subject}</Preview>
      <Body
        style={{ backgroundColor: "#ffffff", color: "#1a1a1a", fontFamily: "Arial, sans-serif" }}
      >
        <Container style={{ maxWidth: "560px", padding: "40px 24px", margin: "0 auto" }}>
          <EmailWordmark />
          <Text style={{ fontSize: "18px", lineHeight: "28px" }}>
            You have been invited to be a {role}.
          </Text>
          <Text>
            Review the invitation and accept if you want this role. If you are new, enter your name
            to create your account. Everyone must then verify a fresh email code before the role
            becomes active, including people who are already signed in. Opening this email or its
            link does not give you access.
          </Text>
          <Button
            href={url.href}
            style={{
              backgroundColor: "#005f80",
              color: "#ffffff",
              borderRadius: "6px",
              padding: "14px 22px",
              fontSize: "16px",
              fontWeight: 700,
              textDecoration: "none",
            }}
          >
            Review invitation
          </Button>
          <Text>
            This invitation expires on {input.expiresAt.toISOString().slice(0, 10)} (UTC). You can
            decline it or ignore it.
          </Text>
          <Text>Sign in with the email address that received this invitation.</Text>
          <EmailFooter
            supportUrl={input.supportUrl}
            prompt="Not expecting this invitation? You can ignore it; nothing changes."
          />
        </Container>
      </Body>
    </Html>,
  );
  return {
    subject,
    html,
    text: `${subject}\n\nOpen the invitation and explicitly accept if you want this role. New users enter their name to create an account. Everyone must then verify a fresh email code before the role becomes active, including people who are already signed in. Opening the link does not grant access.\n\n${url.href}\n\nExpires ${input.expiresAt.toISOString()} (UTC). You can decline or ignore this invitation. Sign in with the email that received it.\n\nNot expecting this invitation? You can ignore it; nothing changes. Need help? Visit ${input.supportUrl}\n\n© ${new Date().getUTCFullYear()} ntumie.\nGood links belong together.`,
  };
}
