import {
  assertValidBaseInput,
  type CodeEmailBaseInput,
  type RenderedEmail,
  renderCodeEmail,
} from "./code-email.js";

// Step two of the account-email change: sent to the NEW address after the
// current address confirmed. Verifying completes the change; all sessions are
// then revoked and the account signs in with this address.
export interface NewEmailVerificationInput extends CodeEmailBaseInput {}

export async function renderNewEmailVerification(
  input: NewEmailVerificationInput,
): Promise<RenderedEmail> {
  const errors = assertValidBaseInput(input);
  if (errors.length > 0) {
    throw new Error(`Invalid new-email verification input: ${errors.join("; ")}`);
  }
  return renderCodeEmail("Verify your new ntumie. email", input, {
    preview: "Verify your new ntumie. email",
    lead: "Here's your verification code to verify this address as the new email for your ntumie. account:",
    note: "If you didn't expect this, you can ignore this email and nothing will change.",
  });
}
