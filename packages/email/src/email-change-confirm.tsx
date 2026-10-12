import {
  assertValidBaseInput,
  type CodeEmailBaseInput,
  type RenderedEmail,
  renderCodeEmail,
} from "./code-email.js";

// Step one of the account-email change (the account/hub handover mechanism):
// sent to the CURRENT address to confirm the change intent. Shows the target
// address — the current owner must see exactly where the account is going.
// Nothing changes unless this is confirmed.
export interface EmailChangeConfirmationInput extends CodeEmailBaseInput {
  /** The address the account would move to (content, not the recipient). */
  newEmail: string;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function renderEmailChangeConfirmation(
  input: EmailChangeConfirmationInput,
): Promise<RenderedEmail> {
  const errors = assertValidBaseInput(input);
  if (!EMAIL_RE.test(input.newEmail)) {
    errors.push("newEmail must be a valid email address");
  }
  if (errors.length > 0) {
    throw new Error(`Invalid email-change confirmation input: ${errors.join("; ")}`);
  }
  return renderCodeEmail("Confirm your ntumie. email change", input, {
    preview: "Confirm your ntumie. email change",
    lead: `You asked to change your ntumie. account email to ${input.newEmail}. Here's your verification code to confirm this change:`,
    note: "If you didn't request this change, you can ignore this email — nothing changes without this confirmation.",
  });
}
