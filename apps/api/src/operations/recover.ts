import "dotenv/config";
import { openSync } from "node:fs";
import { hostname, userInfo } from "node:os";
import { createInterface } from "node:readline/promises";
import { ReadStream, WriteStream } from "node:tty";
import { PrismaService } from "../database/prisma.service";
import { normalizedEmail, prepareAdminInvitation } from "./invitations";

// Emergency deployment recovery issues an invitation, never a direct grant.
async function main() {
  const [address, ...extra] = process.argv.slice(2);
  let input = process.stdin,
    output = process.stdout;
  let terminalInput: ReadStream | undefined, terminalOutput: WriteStream | undefined;
  try {
    // Bun --filter pipes package stdio. Read confirmation directly from the
    // controlling terminal so filters work without allowing unattended grants.
    if (!input.isTTY) {
      terminalInput = new ReadStream(openSync("/dev/tty", "r"));
      input = terminalInput as typeof process.stdin;
    }
    if (!output.isTTY) {
      terminalOutput = new WriteStream(openSync("/dev/tty", "w"));
      output = terminalOutput as typeof process.stdout;
    }
  } catch {
    terminalInput?.destroy();
    terminalOutput?.destroy();
    process.stderr.write("An interactive controlling terminal is required.\n");
    process.exitCode = 1;
    return;
  }
  if (!address || extra.length) {
    process.stderr.write(
      "Usage: bun run --filter @linkhub/api admin:recover <email> (interactive terminal required)\n",
    );
    terminalInput?.destroy();
    terminalOutput?.destroy();
    process.exitCode = 1;
    return;
  }
  const prisma = new PrismaService();
  const prompt = createInterface({ input, output });
  try {
    const email = normalizedEmail(address);
    output.write(
      "Recovery is allowed only when no active admin exists. The recipient must verify their email and accept.\n",
    );
    if (
      (await prompt.question("Retype the recipient email to confirm: ")).trim().toLowerCase() !==
      email
    )
      throw new Error("Cancelled");
    await prepareAdminInvitation(
      prisma,
      email,
      true,
      `${userInfo().username}@${hostname()}`.slice(0, 128),
    );
    output.write("Admin invitation queued and audited.\n");
  } catch {
    process.stderr.write(
      "Invitation not created. Check the email, confirmation, database and zero-active-admin requirement.\n",
    );
    process.exitCode = 1;
  } finally {
    prompt.close();
    terminalInput?.destroy();
    terminalOutput?.destroy();
    await prisma.$disconnect();
  }
}
void main();
