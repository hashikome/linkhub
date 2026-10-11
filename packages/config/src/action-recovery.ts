import { createHmac, timingSafeEqual } from "node:crypto";

export const recoveryTtl = 15 * 60;
export const recoveryPayloadLimit = 64 * 1024;
export interface RecoveryCommand {
  operation: "put" | "get" | "delete";
  token: string;
  payload?: string;
}
export function recoveryProof(command: RecoveryCommand, secret: string, issued = Date.now()) {
  const signature = createHmac("sha256", secret)
    .update(
      `web-action-recovery:${issued}:${JSON.stringify([command.operation, command.token, command.payload ?? null])}`,
    )
    .digest("hex");
  return `${issued}.${signature}`;
}
export function validRecoveryProof(
  command: RecoveryCommand,
  proof: string | undefined,
  secret: string | undefined,
  now = Date.now(),
) {
  if (!secret || !proof || !/^\d{13}\.[a-f0-9]{64}$/.test(proof)) return false;
  const issued = Number(proof.split(".")[0]);
  if (issued > now || now - issued > 60_000) return false;
  return timingSafeEqual(Buffer.from(proof), Buffer.from(recoveryProof(command, secret, issued)));
}
