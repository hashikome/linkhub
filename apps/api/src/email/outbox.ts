import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes } from "node:crypto";
import {
  type RenderedEmail,
  renderEmailChangeConfirmation,
  renderNewEmailVerification,
  renderVerificationCode,
} from "@linkhub/email";
import type { VerificationPurpose } from "@linkhub/types";
import type { Prisma } from "../generated/prisma/client";

export type EmailKind = "sign-in" | "current-email" | "new-email";
export interface DeliveryPayload extends RenderedEmail {
  to: string;
}
export function emailKey(secret: string, purpose: string, value: string) {
  return createHmac("sha256", secret).update(`email:v1:${purpose}\0${value}`).digest("hex");
}
function encryptionKey(secret: string) {
  return createHmac("sha256", secret).update("email-outbox-encryption:v1").digest();
}
export function seal(payload: DeliveryPayload, secret: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(secret), iv);
  const bytes = Buffer.concat([cipher.update(JSON.stringify(payload)), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), bytes]).toString("base64");
}
export function unseal(value: string, secret: string): DeliveryPayload {
  const bytes = Buffer.from(value, "base64");
  const cipher = createDecipheriv("aes-256-gcm", encryptionKey(secret), bytes.subarray(0, 12));
  cipher.setAuthTag(bytes.subarray(12, 28));
  return JSON.parse(Buffer.concat([cipher.update(bytes.subarray(28)), cipher.final()]).toString());
}
export async function enqueueEmail(
  tx: Prisma.TransactionClient,
  input: {
    secret: string;
    suppressionSecret: string;
    supportUrl: string;
    to: string;
    code: string;
    kind: EmailKind;
    purpose?: VerificationPurpose;
    identifier: string;
    newEmail?: string;
  },
) {
  const base = {
    locale: "en" as const,
    code: input.code,
    supportUrl: input.supportUrl,
    expiresInMinutes: 5,
  };
  const rendered =
    input.kind === "sign-in"
      ? await renderVerificationCode({ ...base, purpose: input.purpose ?? "sign-in" })
      : input.kind === "current-email"
        ? await renderEmailChangeConfirmation({ ...base, newEmail: input.newEmail ?? "" })
        : await renderNewEmailVerification(base);
  return enqueueRenderedEmail(tx, {
    ...input,
    rendered,
    expiresAt: new Date(Date.now() + 300_000),
  });
}

export async function enqueueRenderedEmail(
  tx: Prisma.TransactionClient,
  input: {
    secret: string;
    suppressionSecret: string;
    to: string;
    identifier: string;
    rendered: RenderedEmail;
    expiresAt: Date;
  },
) {
  const challengeKey = emailKey(input.secret, "challenge", input.identifier);
  const recipientKey = emailKey(
    input.suppressionSecret,
    "recipient",
    input.to.trim().toLowerCase(),
  );
  await tx.emailOutbox.updateMany({
    where: { challengeKey, state: "pending" },
    data: { state: "cancelled", payload: null },
  });
  const suppressed = await tx.emailSuppression.findUnique({ where: { recipientKey } });
  return tx.emailOutbox.create({
    data: {
      challengeKey,
      recipientKey,
      expiresAt: input.expiresAt,
      state: suppressed ? "suppressed" : "pending",
      payload: suppressed ? null : seal({ to: input.to, ...input.rendered }, input.secret),
    },
  });
}
// A stable opaque provider key, independent of user/collection identity.
export function deliveryKey(id: string) {
  return createHash("sha256").update(`delivery:v1:${id}`).digest("hex");
}
