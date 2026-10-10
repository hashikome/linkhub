import { createHash, randomBytes } from "node:crypto";
import { publicOrigins } from "@nslinkhub/config/public-origins";
import { renderServiceInvitation } from "@nslinkhub/email";
import { isEmail } from "class-validator";
import { appError } from "../common/errors/app-exception";
import type { PrismaService } from "../database/prisma.service";
import { emailConfig } from "../email/config";
import { emailKey, enqueueRenderedEmail } from "../email/outbox";
import type { Prisma, ServiceInvitation } from "../generated/prisma/client";

export const invitationLifetime = 7 * 86400_000;
export function normalizedEmail(value: string) {
  const email = value.trim().toLowerCase();
  if (email.length > 254 || !isEmail(email)) throw appError("bad_request");
  return email;
}
export async function queueInvitation(tx: Prisma.TransactionClient, invite: ServiceInvitation) {
  const token = randomBytes(32).toString("base64url");
  await tx.serviceInvitation.update({
    where: { id: invite.id },
    data: { tokenHash: invitationDigest(token) },
  });
  const config = emailConfig();
  const origin = new URL(publicOrigins(process.env).webOrigin);
  if (!["http:", "https:"].includes(origin.protocol) || origin.username || origin.password)
    throw appError("service_unavailable");
  const rendered = await renderServiceInvitation({
    role: invite.role as "admin" | "operator",
    invitationUrl: new URL(`/invitations/accept#token=${token}`, origin).href,
    expiresAt: invite.expiresAt,
    supportUrl: config.supportUrl,
  });
  const mail = await enqueueRenderedEmail(tx, {
    secret: config.secret,
    suppressionSecret: config.suppressionSecret,
    to: invite.email,
    identifier: `service-invitation:${invite.id}`,
    rendered,
    expiresAt: invite.expiresAt,
  });
  return tx.serviceInvitation.update({ where: { id: invite.id }, data: { deliveryId: mail.id } });
}
export async function cancelInvitations(
  tx: Prisma.TransactionClient,
  where: Prisma.ServiceInvitationWhereInput,
) {
  const pending = await tx.serviceInvitation.findMany({
    where: { AND: [{ state: { in: ["pending", "verifying"] } }, where] },
    select: { id: true, deliveryId: true, version: true },
  });
  if (!pending.length) return;
  for (const row of pending) await clearInvitationCode(tx, row);
  await tx.emailOutbox.updateMany({
    where: {
      id: { in: pending.flatMap((i) => (i.deliveryId ? [i.deliveryId] : [])) },
      state: "pending",
    },
    data: { state: "cancelled", payload: null },
  });
  await tx.serviceInvitation.updateMany({
    where: { id: { in: pending.map((i) => i.id) } },
    data: { state: "cancelled", version: { increment: 1 } },
  });
}
export async function invalidateAccountInvitations(
  tx: Prisma.TransactionClient,
  userId: string,
  email: string,
) {
  await cancelInvitations(tx, {
    OR: [{ inviteeUserId: userId }, { email }, { invitedById: userId }],
  });
}

// Startup prepares one invitation; it never creates users or role grants. An
// existing singleton prevents implicit re-grant/re-send on every app restart.
export async function prepareAdminInvitation(
  prisma: PrismaService,
  address: string,
  recovery = false,
  authority = "startup",
) {
  const email = normalizedEmail(address);
  return prisma.withAuthority(async () => {
    const bootstrap = await prisma.adminBootstrap.findUnique({ where: { id: 1 } });
    if (bootstrap && !recovery) {
      return { created: false, id: bootstrap.invitationId };
    }
    if (await prisma.adminGrant.count({ where: { user: { accountState: "active" } } })) {
      if (recovery) throw appError("conflict");
      return { created: false, id: null };
    }
    const user = await prisma.user.findUnique({ where: { email } });
    if (user && user.accountState !== "active") throw appError("forbidden");
    await cancelInvitations(prisma, { OR: [{ role: "admin" }, { email }] });
    const invite = await prisma.serviceInvitation.create({
      data: {
        role: "admin",
        email,
        inviteeUserId: user?.id,
        expiresAt: new Date(Date.now() + invitationLifetime),
      },
    });
    await queueInvitation(prisma, invite);
    await prisma.adminBootstrap.upsert({
      where: { id: 1 },
      create: { id: 1, invitationId: invite.id },
      update: { invitationId: invite.id, claimedById: null, claimedAt: null },
    });
    await prisma.auditLog.create({
      data: {
        category: "operation",
        actorKind: "deployment",
        authority,
        action: recovery ? "admin.recovery_invited" : "admin.bootstrap_invited",
        invitationId: invite.id,
        targetUserId: user?.id,
        reason: "access_administration",
        outcome: "success",
      },
    });
    return { created: true, id: invite.id };
  });
}

export const invitationDigest = (token: string) =>
  createHash("sha256").update(`service-invitation:v1:${token}`).digest("hex");

export const invitationCodeIdentifier = (row: { id: string; version: number }) =>
  `invitation-code:${row.id}:${row.version}`;
export async function clearInvitationCode(
  tx: Prisma.TransactionClient,
  row: { id: string; version: number },
) {
  const identifier = invitationCodeIdentifier(row);
  await tx.verification.deleteMany({ where: { identifier } });
  await tx.emailOutbox.updateMany({
    where: {
      challengeKey: emailKey(emailConfig().secret, "challenge", identifier),
      state: "pending",
    },
    data: { state: "cancelled", payload: null },
  });
}
