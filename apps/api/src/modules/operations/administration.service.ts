import { createHash } from "node:crypto";
import { Injectable, OnModuleInit } from "@nestjs/common";
import type { ServiceInvitationView } from "@nslinkhub/types";
import type { CursorQueryDto } from "../../common/dto/cursor-query.dto";
import { appError } from "../../common/errors/app-exception";
import { PrismaService } from "../../database/prisma.service";
import type { ServiceInvitation } from "../../generated/prisma/client";
import {
  cancelInvitations,
  clearInvitationCode,
  invitationLifetime,
  normalizedEmail,
  prepareAdminInvitation,
  queueInvitation,
} from "../../operations/invitations";
import type { InviteCommandDto, InviteDto, VersionDto } from "./administration.dto";
import { OperationsService, type OperatorRequest } from "./operations.service";

@Injectable()
export class AdministrationService implements OnModuleInit {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ops: OperationsService,
  ) {}
  async onModuleInit() {
    const address = process.env.BOOTSTRAP_ADMIN_EMAIL?.trim();
    if (address) await prepareAdminInvitation(this.prisma, address);
  }
  private async view(row: ServiceInvitation): Promise<ServiceInvitationView> {
    const delivery = row.deliveryId
      ? await this.prisma.emailOutbox.findUnique({
          where: { id: row.deliveryId },
          select: { state: true },
        })
      : null;
    return {
      id: row.id,
      role: row.role as "admin" | "operator",
      email: row.email,
      state:
        ["pending", "verifying"].includes(row.state) && row.expiresAt <= new Date()
          ? "expired"
          : (row.state as ServiceInvitationView["state"]),
      version: row.version,
      createdAt: row.createdAt.toISOString(),
      expiresAt: row.expiresAt.toISOString(),
      delivery: delivery?.state ?? null,
    };
  }
  list(req: OperatorRequest, query: CursorQueryDto) {
    return this.ops.run(
      req,
      false,
      async () => {
        const page = this.ops.page(query, "admin-invitations");
        const rows = await this.prisma.serviceInvitation.findMany({
          where: page.where,
          orderBy: [{ createdAt: "desc" }, { id: "desc" }],
          take: page.limit + 1,
        });
        await this.ops.audit(req, { action: "invitations.list", outcome: "success" });
        return this.ops.paged(await Promise.all(rows.map((row) => this.view(row))), page);
      },
      "admin",
    );
  }
  operators(req: OperatorRequest, query: CursorQueryDto) {
    return this.ops.run(
      req,
      false,
      async () => {
        const page = this.ops.page(query, "operators");
        const rows = await this.ops.accounts(
          {
            AND: [
              page.where,
              { OR: [{ operatorGrant: { isNot: null } }, { adminGrant: { isNot: null } }] },
            ],
          },
          page.limit + 1,
        );
        await this.ops.audit(req, { action: "operators.list", outcome: "success" });
        return this.ops.paged(rows, page);
      },
      "admin",
    );
  }
  private async replay(req: OperatorRequest, operationId: string, payload: unknown) {
    const hash = createHash("sha256").update(JSON.stringify(payload)).digest("hex");
    const previous = await this.prisma.auditLog.findUnique({
      where: { actorUserId_operationId: { actorUserId: req.user.userId, operationId } },
    });
    if (
      previous &&
      (previous.payloadHash !== hash || !previous.afterState || previous.resultVersion === null)
    )
      throw appError("conflict");
    return {
      hash,
      result: previous
        ? {
            id: (previous.invitationId ?? previous.targetUserId) as string,
            state: previous.afterState as string,
            version: previous.resultVersion as number,
          }
        : null,
    };
  }
  create(req: OperatorRequest, dto: InviteDto) {
    return this.ops.run(
      req,
      true,
      async () => {
        const email = normalizedEmail(dto.email);
        const { hash, result } = await this.replay(req, dto.operationId, [
          "invitation.create",
          email,
        ]);
        if (result) return result;
        const user = await this.prisma.user.findUnique({
          where: { email },
          include: { adminGrant: true, operatorGrant: true },
        });
        if (user && (user.accountState !== "active" || user.adminGrant || user.operatorGrant))
          throw appError("conflict");
        await cancelInvitations(this.prisma, { email, expiresAt: { lte: new Date() } });
        if (
          await this.prisma.serviceInvitation.count({
            where: { email, state: { in: ["pending", "verifying"] } },
          })
        )
          throw appError("conflict");
        const invite = await this.prisma.serviceInvitation.create({
          data: {
            role: "operator",
            email,
            inviteeUserId: user?.id,
            invitedById: req.user.userId,
            expiresAt: new Date(Date.now() + invitationLifetime),
          },
        });
        await queueInvitation(this.prisma, invite);
        await this.ops.audit(req, {
          action: "invitation.create",
          invitationId: invite.id,
          targetUserId: user?.id,
          operationId: dto.operationId,
          payloadHash: hash,
          afterState: invite.state,
          resultVersion: invite.version,
          outcome: "success",
        });
        return { id: invite.id, state: invite.state, version: invite.version };
      },
      "admin",
    );
  }
  change(req: OperatorRequest, id: string, dto: InviteCommandDto) {
    return this.ops.run(
      req,
      true,
      async () => {
        const { hash, result } = await this.replay(req, dto.operationId, [
          "invitation.change",
          id,
          dto.action,
          dto.version,
        ]);
        if (result) return result;
        const row = await this.prisma.serviceInvitation.findUnique({ where: { id } });
        if (row?.role !== "operator") throw appError("not_found");
        if (row.version !== dto.version) throw appError("version_conflict");
        if (!["pending", "verifying"].includes(row.state)) throw appError("conflict");
        if (dto.action === "cancel") await cancelInvitations(this.prisma, { id });
        else {
          const user = await this.prisma.user.findUnique({
            where: { email: row.email },
            include: { adminGrant: true, operatorGrant: true },
          });
          if (
            user &&
            (user.accountState !== "active" ||
              user.adminGrant ||
              user.operatorGrant ||
              (row.inviteeUserId && row.inviteeUserId !== user.id))
          )
            throw appError("conflict");
          await clearInvitationCode(this.prisma, row);
          const updated = await this.prisma.serviceInvitation.update({
            where: { id },
            data: {
              state: "pending",
              invitedById: req.user.userId,
              inviteeUserId: row.inviteeUserId ?? user?.id,
              expiresAt: new Date(Date.now() + invitationLifetime),
              version: { increment: 1 },
            },
          });
          await queueInvitation(this.prisma, updated);
        }
        const updated = await this.prisma.serviceInvitation.findUniqueOrThrow({ where: { id } });
        await this.ops.audit(req, {
          action: `invitation.${dto.action}`,
          invitationId: id,
          operationId: dto.operationId,
          payloadHash: hash,
          beforeState: row.state,
          afterState: updated.state,
          resultVersion: updated.version,
          outcome: "success",
        });
        return { id, state: updated.state, version: updated.version };
      },
      "admin",
    );
  }
  revoke(req: OperatorRequest, id: string, dto: VersionDto) {
    return this.ops.run(
      req,
      true,
      async () => {
        const { hash, result } = await this.replay(req, dto.operationId, [
          "operator.revoke",
          id,
          dto.version,
        ]);
        if (result) return result;
        const user = await this.prisma.user.findUnique({
          where: { id },
          include: { adminGrant: true },
        });
        if (!user) throw appError("not_found");
        if (user.adminGrant) throw appError("forbidden");
        if (user.operationsVersion !== dto.version) throw appError("version_conflict");
        await this.prisma.operatorGrant.deleteMany({ where: { userId: id } });
        await cancelInvitations(this.prisma, {
          OR: [{ inviteeUserId: id }, { email: user.email }],
        });
        await this.prisma.user.update({
          where: { id },
          data: { operationsVersion: { increment: 1 } },
        });
        await this.ops.audit(req, {
          action: "operator.revoke",
          targetUserId: id,
          operationId: dto.operationId,
          payloadHash: hash,
          afterState: "revoked",
          resultVersion: dto.version + 1,
          outcome: "success",
          reason: "access_administration",
        });
        return { id, state: "revoked", version: dto.version + 1 };
      },
      "admin",
    );
  }
}
