import type { VerificationPurpose } from "@nslinkhub/types";
import {
  assertValidBaseInput,
  type CodeEmailBaseInput,
  type CodeEmailCopy,
  type RenderedEmail,
  renderCodeEmail,
} from "./code-email.js";

export interface VerificationCodeEmailInput extends CodeEmailBaseInput {
  purpose: VerificationPurpose;
}

const messages: Record<VerificationPurpose, { subject: string } & CodeEmailCopy> = {
  deactivate: {
    subject: "Confirm account deactivation · nslinkhub",
    preview: "Your data stays saved; your profile and collections will be hidden.",
    lead: "Enter this code to deactivate your account and sign out everywhere:",
    note: "You can reactivate later. This does not delete your data.",
  },
  delete: {
    subject: "Confirm account deletion · nslinkhub",
    preview: "Permanent deletion is scheduled after a 14-day grace period.",
    lead: "Enter this code to disable your account and schedule permanent deletion in 14 days:",
    note: "Your hub and collections will be deleted. You can cancel before the deadline.",
  },
  reactivate: {
    subject: "Reactivate your account · nslinkhub",
    preview: "Restore your profile and collections.",
    lead: "Enter this code to reactivate your account:",
    note: "After reactivation, sign in again. Old sessions stay revoked.",
  },
  cancel_deletion: {
    subject: "Cancel account deletion · nslinkhub",
    preview: "Keep your account and saved data.",
    lead: "Enter this code to cancel your scheduled account deletion:",
    note: "Your account stays deactivated until you choose to reactivate it.",
  },
  "sign-in": {
    subject: "Your nslinkhub sign-in code",
    preview: "Sign in or create your nslinkhub account.",
    lead: "Here's your verification code to sign in to nslinkhub:",
  },
  "first-link": {
    subject: "Verify your email to save your first link · nslinkhub",
    preview: "Your first link is ready to save.",
    lead: "Enter this code in nslinkhub to verify your email and save your first link:",
    note: "Your link is saved after you enter the code in the app.",
  },
  continue: {
    subject: "Your code to continue in nslinkhub",
    preview: "Verify your email to continue where you left off.",
    lead: "Enter this code in nslinkhub to sign in and continue:",
  },
  resume: {
    subject: "Sign back in to nslinkhub",
    preview: "Your session ended. Continue your unfinished action.",
    lead: "Your session ended before your action was finished. Enter this code in nslinkhub to sign back in and continue:",
  },
  confirm: {
    subject: "Confirm it's you · nslinkhub",
    preview: "A fresh verification code for your requested action.",
    lead: "Enter this code in nslinkhub to confirm it's you before continuing with your requested action:",
  },
  invitation: {
    subject: "Verify your email to accept your nslinkhub invitation",
    preview: "Your invitation is ready to accept.",
    lead: "Enter this code in nslinkhub to verify your email and activate your invited role:",
    note: "This code is for the invitation you are accepting.",
  },
};

export async function renderVerificationCode(
  input: VerificationCodeEmailInput,
): Promise<RenderedEmail> {
  const errors = assertValidBaseInput(input);
  if (!Object.hasOwn(messages, input.purpose)) errors.push("unsupported purpose");
  if (errors.length) throw new Error(`Invalid verification-code email input: ${errors.join("; ")}`);
  const { subject, ...copy } = messages[input.purpose];
  return renderCodeEmail(subject, input, copy);
}
