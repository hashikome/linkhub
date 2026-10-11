import "server-only";
import { type RecoveryCommand, recoveryProof } from "@linkhub/config/action-recovery";
import { webServerConfig } from "@linkhub/config/web-server";
import { serverSend } from "./server-transport";

export async function recoveryRequest(command: RecoveryCommand) {
  const config = webServerConfig();
  const result = await serverSend<{ payload: string | null }>("/api/v1/action-recovery", command, {
    headers: new Headers({
      "Content-Type": "application/json",
      "x-action-recovery": recoveryProof(command, config.sourceSecret),
    }),
  });
  if (!result.ok) throw new Error("Could not preserve or retrieve the interrupted action");
  return result.data.payload;
}
