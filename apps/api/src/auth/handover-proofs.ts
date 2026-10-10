import type { AuthContext } from "better-auth";
import { emailKey } from "../email/outbox";

interface HandoverBinding {
  userId: string;
  sessionId: string;
  currentEmail: string;
  newEmail: string;
}

export function handoverIdentifiers(secret: string, binding: HandoverBinding) {
  // Retained for revoking historical intents; email changes are unavailable.
  // JSON preserves field boundaries: native `${old}-${new}` does not.
  const scope = JSON.stringify([
    binding.userId,
    binding.sessionId,
    binding.currentEmail,
    binding.newEmail,
  ]);
  return {
    current: `handover-current:${emailKey(secret, "handover", scope)}`,
    next: `handover-new:${emailKey(secret, "handover", scope)}`,
  };
}

export function bindProofIdentifiers(
  context: Pick<AuthContext, "internalAdapter">,
  names: Map<string, string>,
) {
  const resolve = (identifier: string) => names.get(identifier) ?? identifier;
  const adapter = context.internalAdapter;
  // Bind only this request's fully initialized context, before invoking OTP
  // endpoints. Delegate every proof operation to better-auth, including atomic
  // consume and wrong-attempt recreation. Never fall back to a native key.
  context.internalAdapter = {
    ...adapter,
    createVerificationValue: (data) =>
      adapter.createVerificationValue({ ...data, identifier: resolve(data.identifier) }),
    findVerificationValue: (identifier) => adapter.findVerificationValue(resolve(identifier)),
    consumeVerificationValue: (identifier) => adapter.consumeVerificationValue(resolve(identifier)),
    deleteVerificationByIdentifier: (identifier) =>
      adapter.deleteVerificationByIdentifier(resolve(identifier)),
    updateVerificationByIdentifier: (identifier, data) =>
      adapter.updateVerificationByIdentifier(resolve(identifier), {
        ...data,
        ...(data.identifier === undefined ? {} : { identifier: resolve(data.identifier) }),
      }),
    reserveVerificationValue: (data) =>
      adapter.reserveVerificationValue({ ...data, identifier: resolve(data.identifier) }),
  };
}
