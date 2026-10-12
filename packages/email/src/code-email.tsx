import {
  Body,
  Container,
  Head,
  Hr,
  Html,
  Link,
  Preview,
  render,
  Text,
} from "@react-email/components";

// Codes-only authentication mail. Navigation links never carry proof.

export interface CodeEmailBaseInput {
  /** Supported locales; copy ships English-first. */
  locale: "en";
  /** The one-time code better-auth minted. */
  code: string;
  /** Support route for unexpected-message recovery (https). */
  supportUrl: string;
  /** Validity window better-auth decided, in minutes (1–60). */
  expiresInMinutes: number;
}

export interface RenderedEmail {
  subject: string;
  html: string;
  text: string;
}

const SUPPORTED_LOCALES = ["en"];
const CODE_RE = /^[0-9]{4,10}$/;

export function assertValidBaseInput(input: CodeEmailBaseInput): string[] {
  const errors: string[] = [];
  if (!SUPPORTED_LOCALES.includes(input.locale)) {
    errors.push(`unsupported locale "${input.locale}"`);
  }
  if (!CODE_RE.test(input.code)) {
    errors.push("code must be 4-10 digits");
  }
  for (const [name, url] of [["supportUrl", input.supportUrl]] as const) {
    if (!/^https:\/\//.test(url)) {
      errors.push(`${name} must be an https:// URL`);
    }
  }
  if (
    !Number.isInteger(input.expiresInMinutes) ||
    input.expiresInMinutes < 1 ||
    input.expiresInMinutes > 60
  ) {
    errors.push("expiresInMinutes must be an integer between 1 and 60");
  }
  return errors;
}

export function expiryPhrase(expiresInMinutes: number): string {
  return expiresInMinutes === 1 ? "1 minute" : `${expiresInMinutes} minutes`;
}

const styles = {
  body: {
    backgroundColor: "#ffffff",
    fontFamily:
      "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
    color: "#1a1a1a",
    margin: 0,
  },
  container: { maxWidth: "560px", margin: "0 auto", padding: "40px 24px" },
  wordmark: { fontSize: "22px", fontWeight: 700, letterSpacing: "-0.02em", margin: 0 },
  lead: { fontSize: "16px", lineHeight: "24px", margin: "28px 0 0" },
  code: {
    fontSize: "32px",
    fontWeight: 600,
    letterSpacing: "0.35em",
    margin: "24px 0 0",
  },
  validity: { fontSize: "16px", lineHeight: "24px", color: "#1a1a1a", margin: "24px 0 0" },
  note: { fontSize: "14px", lineHeight: "21px", color: "#6b7280", margin: "24px 0 0" },
  warning: { fontSize: "15px", lineHeight: "23px", fontWeight: 700, margin: "32px 0 0" },
} as const;

const footerStyles = {
  hr: { borderColor: "#e5e7eb", margin: "40px 0 20px" },
  prompt: { fontSize: "14px", lineHeight: "21px", color: "#4b5563", margin: "0 0 4px" },
  support: { fontSize: "14px", lineHeight: "21px", color: "#4b5563", margin: "0 0 20px" },
  link: { color: "#1e5ba1", textDecoration: "underline" },
  brand: { fontSize: "13px", lineHeight: "18px", fontWeight: 600, color: "#1a1a1a", margin: 0 },
  tagline: { fontSize: "12px", lineHeight: "18px", color: "#6b7280", margin: "2px 0 0" },
} as const;

// Shared email footer: a support prompt linking the support page (which
// lists how to reach us), then "© <year> ntumie." over "Good links belong together.".
export function EmailFooter({
  supportUrl,
  prompt = "Didn't request this? You can safely ignore this email.",
}: {
  supportUrl: string;
  prompt?: string;
}) {
  return (
    <>
      <Hr style={footerStyles.hr} />
      <Text style={footerStyles.prompt}>{prompt}</Text>
      <Text style={footerStyles.support}>
        Need help?{" "}
        <Link href={supportUrl} style={footerStyles.link}>
          Visit support
        </Link>
      </Text>
      <Text style={footerStyles.brand}>© {new Date().getUTCFullYear()} ntumie.</Text>
      <Text style={footerStyles.tagline}>Good links belong together.</Text>
    </>
  );
}

export interface CodeEmailCopy {
  /** Inbox preview line; never contains the code. */
  preview: string;
  /** The sentence introducing the code. */
  lead: string;
  /** Optional muted reassurance line, e.g. "ignore this and nothing changes". */
  note?: string;
}

export function CodeEmail({ input, copy }: { input: CodeEmailBaseInput; copy: CodeEmailCopy }) {
  return (
    <Html lang={input.locale}>
      <Head />
      <Preview>{copy.preview}</Preview>
      <Body style={styles.body}>
        <Container style={styles.container}>
          <Text style={styles.wordmark}>ntumie.</Text>
          <Text style={styles.lead}>{copy.lead}</Text>
          <Text style={styles.code}>{input.code}</Text>
          <Text style={styles.validity}>
            This code is only valid for the next {expiryPhrase(input.expiresInMinutes)}. Enter it in
            the app to continue.
          </Text>
          {copy.note ? <Text style={styles.note}>{copy.note}</Text> : null}
          <Text style={styles.warning}>Do not share this code with anyone.</Text>
          <EmailFooter supportUrl={input.supportUrl} />
        </Container>
      </Body>
    </Html>
  );
}

export async function renderCodeEmail(
  subject: string,
  input: CodeEmailBaseInput,
  copy: CodeEmailCopy,
): Promise<RenderedEmail> {
  const element = <CodeEmail input={input} copy={copy} />;
  return {
    subject,
    html: await render(element),
    text: await render(element, { plainText: true }),
  };
}
