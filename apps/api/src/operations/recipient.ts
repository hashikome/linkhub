import { createHash } from "node:crypto";
import { isUUID } from "class-validator";
import { appError } from "../common/errors/app-exception";
import type { Prisma } from "../generated/prisma/client";
import { cancelInvitations, invitationDigest } from "./invitations";

type Session = { user: { id: string }; session: { id: string } } | null;
export async function invitationContext(
  tx: Prisma.TransactionClient,
  token: unknown,
  session: Session,
) {
  if (typeof token !== "string" || !/^[A-Za-z0-9_-]{43}$/.test(token)) throw appError("not_found");
  const invitation = await tx.serviceInvitation.findUnique({
    where: { tokenHash: invitationDigest(token) },
  });
  if (!invitation || invitation.expiresAt <= new Date()) throw appError("not_found");
  const user = await tx.user.findUnique({ where: { email: invitation.email } });
  if (
    (invitation.inviteeUserId && invitation.inviteeUserId !== user?.id) ||
    (user && user.accountState !== "active")
  )
    throw appError("not_found");
  const sessionMatch = !!session && user?.id === session.user.id && user.emailVerified;
  return { invitation, user, sessionMatch, mismatch: !!session && !sessionMatch };
}
export async function previewInvitation(
  tx: Prisma.TransactionClient,
  token: unknown,
  session: Session,
) {
  const {
    invitation: i,
    user,
    sessionMatch,
    mismatch,
  } = await invitationContext(tx, token, session);
  return {
    id: i.id,
    role: i.role,
    email: i.email,
    state: i.state,
    version: i.version,
    expiresAt: i.expiresAt.toISOString(),
    needsName: !user,
    session: mismatch ? "mismatch" : sessionMatch ? "match" : "none",
  };
}

// Called inside delivery-auth's authority transaction. The email token records
// consent, but it never establishes a session or marks the account verified.
export async function acceptInvitation(
  tx: Prisma.TransactionClient,
  body: Record<string, unknown>,
  session: Session,
  createUser: (email: string, name: string) => Promise<{ id: string }>,
) {
  if (
    Object.keys(body).some(
      (k) => !["token", "name", "operationId", "version", "action"].includes(k),
    ) ||
    typeof body.operationId !== "string" ||
    !isUUID(body.operationId) ||
    !Number.isInteger(body.version) ||
    !["accept", "decline"].includes(body.action as string) ||
    (body.name !== undefined &&
      (typeof body.name !== "string" || !body.name.trim() || body.name.length > 255))
  )
    throw appError("bad_request");
  const {
    invitation: row,
    user,
    sessionMatch,
    mismatch,
  } = await invitationContext(tx, body.token, session);
  if (mismatch) throw appError("invitation_session_mismatch");
  const name = typeof body.name === "string" ? body.name.trim() : null;
  const hash = createHash("sha256")
    .update(JSON.stringify([row.id, body.action, body.version, name]))
    .digest("hex");
  // The token digest is stable for this issuance. Audit authority scopes retry
  // keys without exposing the raw token or requiring a not-yet-created user.
  const authority = `invitation:${row.id}`;
  const replay = await tx.auditLog.findUnique({
    where: { authority_operationId: { authority, operationId: body.operationId } },
  });
  if (replay) {
    if (replay.payloadHash !== hash) throw appError("conflict");
    return { email: row.email, signedIn: sessionMatch, state: replay.afterState, issueCode: false };
  }
  if (row.state !== "pending" || row.version !== body.version) throw appError("conflict");
  if (body.action === "decline") {
    await cancelInvitations(tx, { id: row.id });
    await tx.serviceInvitation.update({ where: { id: row.id }, data: { state: "declined" } });
    await tx.auditLog.create({
      data: {
        category: "operation",
        actorKind: "invitee",
        actorUserId: user?.id,
        authority,
        invitationId: row.id,
        action: "invitation.decline",
        outcome: "success",
        operationId: body.operationId,
        payloadHash: hash,
        afterState: "declined",
        resultVersion: row.version + 1,
      },
    });
    return { email: row.email, signedIn: sessionMatch, state: "declined", issueCode: false };
  }
  await checkInvitationAuthority(tx, row);
  if (!user && !name) throw appError("bad_request");
  const userId = user?.id ?? (await createUser(row.email, name as string)).id;
  await cancelInvitations(tx, { id: row.id });
  await tx.serviceInvitation.update({
    where: { id: row.id },
    data: { state: "verifying", inviteeUserId: userId },
  });
  await tx.auditLog.create({
    data: {
      category: "operation",
      actorKind: "invitee",
      actorUserId: userId,
      authority,
      invitationId: row.id,
      targetUserId: userId,
      action: "invitation.accept_requested",
      operationId: body.operationId,
      payloadHash: hash,
      afterState: "verifying",
      resultVersion: row.version + 1,
      outcome: "success",
    },
  });
  return { email: row.email, signedIn: false, state: "verifying", issueCode: true };
}

async function checkInvitationAuthority(
  tx: Prisma.TransactionClient,
  row: Awaited<ReturnType<typeof invitationContext>>["invitation"],
) {
  if (row.role === "admin") {
    const b = await tx.adminBootstrap.findUnique({ where: { id: 1 } });
    if (
      b?.invitationId !== row.id ||
      b.claimedAt ||
      (await tx.adminGrant.count({ where: { user: { accountState: "active" } } }))
    )
      throw appError("conflict");
  } else if (
    !row.invitedById ||
    !(await tx.adminGrant.findFirst({
      where: { userId: row.invitedById, user: { accountState: "active" } },
    }))
  )
    throw appError("conflict");
}
export async function verificationContext(
  tx: Prisma.TransactionClient,
  token: unknown,
  session: Session,
) {
  const result = await invitationContext(tx, token, session);
  if (result.mismatch) throw appError("invitation_session_mismatch");
  if (result.invitation.state !== "verifying" || !result.user) throw appError("conflict");
  await checkInvitationAuthority(tx, result.invitation);
  return result;
}
export async function finishInvitation(
  tx: Prisma.TransactionClient,
  token: unknown,
  userId: string,
) {
  const { invitation: row, user } = await verificationContext(tx, token, null);
  if (!user || user.id !== userId || !user.emailVerified) throw appError("forbidden");
  const authority = `invitation:${row.id}`;
  if (row.role === "admin") {
    await tx.adminGrant.create({ data: { userId, invitationId: row.id } });
    await tx.adminBootstrap.update({
      where: { id: 1 },
      data: { claimedById: userId, claimedAt: new Date() },
    });
  } else {
    if (
      (await tx.operatorGrant.findUnique({ where: { userId } })) ||
      (await tx.adminGrant.findUnique({ where: { userId } }))
    )
      throw appError("conflict");
    await tx.operatorGrant.create({ data: { userId, authority } });
  }
  await tx.user.update({ where: { id: userId }, data: { operationsVersion: { increment: 1 } } });

  await cancelInvitations(tx, { id: row.id });
  await tx.serviceInvitation.update({
    where: { id: row.id },
    data: { state: "accepted", acceptedById: userId },
  });
  await tx.auditLog.create({
    data: {
      category: "operation",
      actorKind: "user",
      actorUserId: userId,
      invitationId: row.id,
      targetUserId: userId,
      action: "invitation.verified",
      beforeState: "verifying",
      afterState: "accepted",
      resultVersion: row.version + 1,
      outcome: "success",
    },
  });
}
