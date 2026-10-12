import { createHash } from "node:crypto";
import { Injectable } from "@nestjs/common";
import type {
  AuditLogEntry,
  ManagedCollection,
  ManagedCollectionAction,
  OperationAction,
  OperationCommand,
  OperationReason,
  OperationResult,
  OperatorAccount,
  OperatorAccountDetail,
  OperatorCollection,
} from "@ntumie/types";
import { isUUID } from "class-validator";
import { revokeAccountAccess } from "../../auth/revoke-account";
import {
  auditPage,
  auditResult,
  auditUsernames,
  resolveAuditFilters,
} from "../../common/audit-query";
import { auditSearchIds } from "../../common/audit-search";
import type { AuditLogQueryDto } from "../../common/dto/audit-query.dto";
import type { CursorQueryDto } from "../../common/dto/cursor-query.dto";
import { AppException, appError } from "../../common/errors/app-exception";
import type { AuthUser } from "../../common/interfaces/auth-user.interface";
import type { RequestWithId } from "../../common/middleware/request-id";
import { decodeCursor, encodeCursor } from "../../common/utils/cursor.util";
import { readSecret } from "../../config/secret";
import { authorityContext } from "../../database/authority-context";
import { PrismaService } from "../../database/prisma.service";
import { Prisma } from "../../generated/prisma/client";
import { availableAccountActions } from "../../operations/account-actions";
import { availableCollections } from "../hubs/availability";
import { CollectionPolicyService } from "../hubs/collection-policy.service";
import type { AccountListQueryDto } from "./operations.dto";

export type OperatorRequest = RequestWithId & { user: AuthUser };
const reasons: Record<OperationAction, readonly OperationReason[]> = {
  "account.suspend": ["spam", "harmful_content", "account_compromise", "owner_request"],
  "account.deactivate": ["owner_request", "access_administration"],
  "account.delete": ["owner_request", "spam", "harmful_content", "access_administration"],
  "account.cancel_deletion": ["owner_request", "mistake_corrected", "review_completed"],
  "account.reactivate": ["mistake_corrected", "review_completed", "owner_request"],
  "sessions.revoke": ["account_compromise", "owner_request", "access_administration"],
  "collection.hold": ["spam", "harmful_content", "owner_request"],
  "collection.release": ["mistake_corrected", "review_completed", "owner_request"],
};
@Injectable()
export class OperationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly policy: CollectionPolicyService,
  ) {}

  async run<T>(
    req: OperatorRequest,
    mutation: boolean,
    work: () => Promise<T>,
    capability: "operator" | "admin" = "operator",
  ): Promise<T> {
    const result = await this.runWithOutcome(req, mutation, work, capability);
    if ("error" in result) throw result.error;
    return result.value;
  }

  // Return denials as data so callers composing authority transactions can
  // commit their evidence before propagating the error outside the outer lock.
  private async runWithOutcome<T>(
    req: OperatorRequest,
    mutation: boolean,
    work: () => Promise<T>,
    capability: "operator" | "admin" = "operator",
  ) {
    // Operations owns its transaction, including audited denials. Nest's ordinary
    // mutation interceptor deliberately excludes this module.
    return this.prisma.withAuthority(async () => {
      const actor = req.user;
      const session =
        actor.sessionId &&
        (await this.prisma.session.findFirst({
          where: {
            id: actor.sessionId,
            userId: actor.userId,
            expiresAt: { gt: new Date() },
            user: { accountState: "active" },
          },
        }));
      if (!session) return { error: appError("unauthorized") };
      const grant = await this.prisma.operatorGrant.findUnique({ where: { userId: actor.userId } });
      const admin = await this.prisma.adminGrant.findUnique({ where: { userId: actor.userId } });
      const authorized = capability === "admin" ? !!admin : !!admin || !!grant;
      const cookie = /(?:^|;\s*)(?:__Secure-)?better-auth\.session_token=/.test(
        req.headers.cookie ?? "",
      );
      const error =
        !authorized || !cookie || req.headers.authorization
          ? appError("forbidden")
          : mutation && (!session.verifiedAt || session.verifiedAt.getTime() < Date.now() - 300_000)
            ? appError("recent_auth_required")
            : null;
      if (error) {
        await this.audit(req, { action: "access.denied", outcome: "denied" });
        return { error };
      }
      await this.prisma.$executeRawUnsafe("SAVEPOINT operator_work");
      try {
        return { value: await work() };
      } catch (error) {
        if (!(error instanceof AppException)) throw error;
        await this.prisma.$executeRawUnsafe("ROLLBACK TO SAVEPOINT operator_work");
        await this.audit(req, { action: "action.denied", outcome: "denied" });
        return { error };
      }
    });
  }
  async audit(
    req: OperatorRequest,
    data: Omit<Prisma.AuditLogUncheckedCreateInput, "actorKind" | "actorUserId">,
  ) {
    // Capture context now; never reconstruct past hub ownership on reads.
    const hubId = data.collectionId
      ? (
          await this.prisma.collection.findUnique({
            where: { id: data.collectionId },
            select: { hubId: true },
          })
        )?.hubId
      : undefined;
    return this.prisma.auditLog.create({
      data: {
        category: "operation",
        ...data,
        hubId,
        actorKind: "user",
        actorUserId: req.user.userId,
        requestId: (req as RequestWithId).requestId,
      },
    });
  }
  private accountSelect = {
    id: true,
    name: true,
    username: true,
    email: true,
    emailVerified: true,
    lastLoginAt: true,
    createdAt: true,
    accountState: true,
    deletionScheduledFor: true,
    operationsVersion: true,
    hub: { select: { id: true, handle: true, name: true } },
    operatorGrant: { select: { userId: true } },
    adminGrant: { select: { userId: true } },
    _count: { select: { sessions: { where: { expiresAt: { gt: new Date() } } } } },
  } as const;
  async accounts(
    where: Prisma.UserWhereInput,
    take: number,
    at = new Date(),
    actor?: { userId: string; admin: boolean },
  ): Promise<OperatorAccount[]> {
    const rows = await this.prisma.user.findMany({
      where,
      select: {
        ...this.accountSelect,
        _count: { select: { sessions: { where: { expiresAt: { gt: at } } } } },
      },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take,
    });
    return rows.map((u) => {
      const account = {
        id: u.id,
        name: u.name,
        username: u.username,
        email: u.email,
        emailVerified: u.emailVerified,
        lastLoginAt: u.lastLoginAt?.toISOString() ?? null,
        hub: u.hub,
        createdAt: u.createdAt.toISOString(),
        state: u.accountState as OperatorAccount["state"],
        deletionScheduledFor: u.deletionScheduledFor?.toISOString() ?? null,
        version: u.operationsVersion,
        sessions: u._count.sessions,
        operator: !!u.operatorGrant,
        admin: !!u.adminGrant,
      };
      return { ...account, availableActions: availableAccountActions(account, actor) };
    });
  }
  // Exact user IDs, or username/email/hub handle fragments.
  // The search text itself is never written to the audit.
  listAccounts(req: OperatorRequest, query: AccountListQueryDto) {
    return this.run(req, false, async () => {
      const key = query.q?.trim().toLowerCase().replace(/^@/, "") ?? "";
      const page = this.page(query, `accounts:${key}`);
      const match: Prisma.UserWhereInput = key
        ? isUUID(key)
          ? { id: key }
          : {
              OR: [
                { email: { contains: key, mode: "insensitive" } },
                { username: { contains: key } },
                { hub: { handle: { contains: key } } },
              ],
            }
        : {};
      const admin = !!(await this.prisma.adminGrant.findUnique({
        where: { userId: req.user.userId },
      }));
      const rows = await this.accounts({ AND: [page.where, match] }, page.limit + 1, new Date(), {
        userId: req.user.userId,
        admin,
      });
      await this.audit(req, {
        action: key ? "accounts.lookup" : "accounts.list",
        ...(key && rows.length === 1 ? { targetUserId: rows[0].id } : {}),
        outcome: !key || rows.length ? "success" : "no_match",
      });
      return this.paged(rows, page);
    });
  }
  account(req: OperatorRequest, id: string) {
    return this.run(req, false, async () => {
      const at = new Date();
      const admin = !!(await this.prisma.adminGrant.findUnique({
        where: { userId: req.user.userId },
      }));
      const [account] = await this.accounts({ id }, 1, at, { userId: req.user.userId, admin });
      const details =
        account &&
        (await this.prisma.user.findUniqueOrThrow({
          where: { id },
          select: {
            bio: true,
            image: true,
            updatedAt: true,
            suspensionReason: true,
            suspendedAt: true,
            sessions: {
              where: { expiresAt: { gt: at } },
              orderBy: [{ createdAt: "desc" }, { id: "desc" }],
              take: 100,
              select: { id: true, createdAt: true, expiresAt: true, verifiedAt: true },
            },
          },
        }));
      await this.audit(req, {
        action: "account.read",
        targetUserId: account?.id,
        outcome: account ? "success" : "no_match",
      });
      if (!account || !details) return null;
      return {
        ...account,
        bio: details.bio,
        image: details.image,
        updatedAt: details.updatedAt.toISOString(),
        suspensionReason: details.suspensionReason,
        suspendedAt: details.suspendedAt?.toISOString() ?? null,
        sessionsAsOf: at.toISOString(),
        activeSessions: details.sessions.map((s) => ({
          id: s.id,
          createdAt: s.createdAt.toISOString(),
          expiresAt: s.expiresAt.toISOString(),
          verifiedAt: s.verifiedAt?.toISOString() ?? null,
          current: s.id === req.user.sessionId,
        })),
      } satisfies OperatorAccountDetail;
    });
  }
  // One list, with independent content and moderation capabilities. Search is
  // applied inside the authorized query, never used as evidence of access.
  async managedCollections(req: OperatorRequest, query: CursorQueryDto & { q?: string }) {
    const operator = Boolean(
      (await this.prisma.operatorGrant.findUnique({ where: { userId: req.user.userId } })) ||
        (await this.prisma.adminGrant.findUnique({ where: { userId: req.user.userId } })),
    );
    const work = async () => {
      const q = query.q?.trim() ?? "";
      let search: Prisma.CollectionWhereInput = {};
      if (q) {
        let path = q;
        try {
          path = new URL(q, "http://link.invalid").pathname;
        } catch {
          /* No matching link. */
        }
        const rawId = isUUID(q) ? q : /^\/c\/([0-9a-f-]{36})\/?$/i.exec(path)?.[1];
        search = rawId && isUUID(rawId) ? { id: rawId.toLowerCase() } : { id: { in: [] } };
      }
      const page = this.page(query, `managed-collections:${req.user.userId}:${operator}:${q}`);
      const access: Prisma.CollectionWhereInput[] = [
        { hub: { ownerUserId: req.user.userId, owner: { accountState: "active" } } },
        {
          AND: [
            availableCollections(),
            {
              OR: [
                { shares: { some: { userId: req.user.userId, source: "direct" } } },
                {
                  linkSharingEnabled: true,
                  shares: { some: { userId: req.user.userId, source: "link" } },
                },
              ],
            },
          ],
        },
        ...(operator
          ? [
              { AND: [{ published: true }, availableCollections()] },
              { hold: { is: { active: true } } },
            ]
          : []),
      ];
      const where: Prisma.CollectionWhereInput = {
        AND: [{ OR: access }, search, { createdAt: { lte: new Date(page.cutoff) } }],
      };
      // Let PostgreSQL compare the anchor's full timestamp, rather than passing
      // its millisecond-truncated JS Date back as the next page boundary.
      // A removed or newly inaccessible anchor requires an explicit reload.
      if (
        page.cursor &&
        !(await this.prisma.collection.findFirst({
          where: { AND: [where, { id: page.cursor.id }] },
          select: { id: true },
        }))
      )
        throw appError("invalid_cursor");
      const rows = await this.prisma.collection.findMany({
        where,
        ...(page.cursor ? { cursor: { id: page.cursor.id }, skip: 1 } : {}),
        include: { hub: { select: { handle: true } }, hold: true },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        take: page.limit + 1,
      });
      const items = await Promise.all(
        rows.map(async (c) => {
          const rights = await this.policy.resolve(c, req.user);
          const publicRead = operator && (await this.policy.resolve(c, null)).canRead;
          const actions: ManagedCollectionAction[] = [];
          if (rights.canRead) actions.push("open", "share");
          if (rights.canWriteContent) actions.push("history");
          if (rights.canManage) {
            actions.push("edit", "add_link", "delete", "transfer");
            if (c.published) actions.push("unpublish");
            else if (!c.hold?.active) actions.push("publish");
          }
          if (operator && (publicRead || c.hold)) actions.push(c.hold?.active ? "release" : "hold");
          return {
            id: c.id,
            hubId: c.hubId,
            hubHandle: c.hub.handle,
            title: rights.canRead ? c.title : null,
            visibility: rights.canRead
              ? c.published
                ? "published"
                : c.linkSharingEnabled
                  ? "link"
                  : "private"
              : null,
            held: c.hold?.active ?? false,
            updatedAt: rights.canRead
              ? c.updatedAt.toISOString()
              : (c.hold?.updatedAt.toISOString() ?? null),
            availableActions: actions,
            createdAt: c.createdAt.toISOString(),
          } satisfies ManagedCollection & { createdAt: string };
        }),
      );
      if (operator) await this.audit(req, { action: "collections.list", outcome: "success" });
      const result = this.paged(items, page);
      return { ...result, items: result.items.map(({ createdAt: _, ...item }) => item) };
    };
    return operator ? this.run(req, false, work) : this.prisma.withAuthority(work);
  }
  collection(req: OperatorRequest, id: string) {
    return this.run(req, false, async () => {
      const result = await this.collectionInfo(id);
      await this.audit(req, {
        action: "collection.inspect",
        collectionId: result?.id,
        outcome: result ? "success" : "no_match",
      });
      return result;
    });
  }
  private async collectionInfo(id: string): Promise<OperatorCollection | null> {
    const c = await this.prisma.collection.findUnique({
      where: { id },
      include: { hold: true, hub: { select: { handle: true } } },
    });
    if (!c) return null;
    if (!c.hold && !(await this.policy.resolve(c, null)).canRead) return null;
    return {
      id: c.id,
      hubId: c.hubId,
      hubHandle: c.hub?.handle ?? null,
      held: c.hold?.active ?? false,
      version: c.hold?.version ?? 0,
      reason: (c.hold?.reason as OperationReason) ?? null,
      updatedAt: c.hold?.updatedAt.toISOString() ?? null,
    };
  }
  command(req: OperatorRequest, command: OperationCommand) {
    return this.run(req, true, async () => {
      const { action, targetId, reason, version, operationId } = command;
      if (!reasons[action].includes(reason)) throw appError("bad_request");
      const payloadHash = createHash("sha256")
        .update(JSON.stringify([action, targetId, reason, version]))
        .digest("hex");
      const previous = await this.prisma.auditLog.findUnique({
        where: { actorUserId_operationId: { actorUserId: req.user.userId, operationId } },
      });
      if (previous) {
        if (
          previous.payloadHash !== payloadHash ||
          previous.afterState === null ||
          previous.resultVersion === null
        )
          throw appError("conflict");
        return { action, targetId, state: previous.afterState, version: previous.resultVersion };
      }
      let beforeState: string;
      let state: string;
      let resultVersion: number;
      const collectionAction = action.startsWith("collection.");
      if (collectionAction) {
        const current = await this.collectionInfo(targetId);
        if (!current) throw appError("not_found");
        if (current.version !== version) throw appError("version_conflict");
        const held = action === "collection.hold";
        // An inactive historical hold does not authorize a new hold on private content.
        if (held && !current.held) {
          const c = await this.prisma.collection.findUniqueOrThrow({ where: { id: targetId } });
          if (!(await this.policy.resolve(c, null)).canRead) throw appError("not_found");
        }
        beforeState = current.held ? "held" : "clear";
        state = held ? "held" : "clear";
        if (beforeState === state) resultVersion = version;
        else {
          const row = await this.prisma.collectionHold.upsert({
            where: { collectionId: targetId },
            create: { collectionId: targetId, active: held, reason, actorUserId: req.user.userId },
            update: {
              active: held,
              reason,
              actorUserId: req.user.userId,
              version: { increment: 1 },
            },
          });
          resultVersion = row.version;
          await this.prisma.collection.update({
            where: { id: targetId },
            data: { version: { increment: 1 } },
          });
        }
      } else {
        const target = await this.prisma.user.findUnique({
          where: { id: targetId },
          include: { operatorGrant: true, adminGrant: true },
        });
        if (!target) throw appError("not_found");
        const actorAdmin = await this.prisma.adminGrant.findUnique({
          where: { userId: req.user.userId },
        });
        if (["account.delete", "account.cancel_deletion"].includes(action) && !actorAdmin)
          throw appError("forbidden");
        if (target.adminGrant && action !== "sessions.revoke") throw appError("forbidden");
        if (
          !actorAdmin &&
          targetId !== req.user.userId &&
          (target.adminGrant || target.operatorGrant)
        )
          throw appError("forbidden");

        if (target.operationsVersion !== version) throw appError("version_conflict");
        if (
          target.deletionScheduledFor &&
          !["account.delete", "account.cancel_deletion", "sessions.revoke"].includes(action)
        )
          throw appError("forbidden");
        beforeState = target.deletionScheduledFor ? "pending_deletion" : target.accountState;
        state =
          action === "account.suspend"
            ? "suspended"
            : action === "account.deactivate"
              ? "inactive"
              : action === "account.delete"
                ? "pending_deletion"
                : action === "account.cancel_deletion"
                  ? target.accountState
                  : action === "account.reactivate"
                    ? "active"
                    : beforeState;
        if (["account.suspend", "account.deactivate", "account.delete"].includes(action)) {
          if (targetId === req.user.userId) throw appError("forbidden");
        }
        if (action === "sessions.revoke")
          await this.prisma.session.deleteMany({ where: { userId: targetId } });
        if (
          ["suspended", "inactive", "pending_deletion"].includes(state) &&
          beforeState !== state
        ) {
          const tx = authorityContext.getStore();
          if (!tx) throw new Error("Missing authority transaction");
          await revokeAccountAccess(
            tx,
            targetId,
            target.email,
            readSecret("BETTER_AUTH_SECRET") ?? "dev-better-auth-secret",
          );
        }
        const changed =
          beforeState !== state || action === "sessions.revoke" || target.selfDeactivated;
        resultVersion = changed ? version + 1 : version;
        if (changed)
          await this.prisma.user.update({
            where: { id: targetId },
            data: {
              accountState: state === "pending_deletion" ? "inactive" : state,
              ...(action !== "sessions.revoke" ? { selfDeactivated: false } : {}),
              operationsVersion: resultVersion,
              ...(action === "account.delete"
                ? { deletionScheduledFor: new Date(Date.now() + 14 * 86400000) }
                : action === "account.cancel_deletion"
                  ? { deletionScheduledFor: null }
                  : {}),
              ...(action === "sessions.revoke"
                ? {}
                : {
                    suspensionReason: state === "suspended" ? reason : null,
                    suspendedAt: state === "suspended" ? new Date() : null,
                  }),
            },
          });
      }
      await this.audit(req, {
        action,
        reason,
        outcome: beforeState === state && action !== "sessions.revoke" ? "no_change" : "success",
        ...(collectionAction ? { collectionId: targetId } : { targetUserId: targetId }),
        beforeState,
        afterState: state,
        operationId,
        payloadHash,
        resultVersion,
      });
      return { action, targetId, state, version: resultVersion } satisfies OperationResult;
    });
  }
  async managedAudit(req: OperatorRequest, query: AuditLogQueryDto) {
    const result = await this.prisma.withAuthority(async () => {
      const userId = req.user.userId;
      const operator = Boolean(
        (await this.prisma.operatorGrant.findUnique({ where: { userId } })) ||
          (await this.prisma.adminGrant.findUnique({ where: { userId } })),
      );
      const work = async () => {
        const hub = await this.prisma.hub.findUnique({
          where: { ownerUserId: userId },
          select: { id: true },
        });
        const filters = await resolveAuditFilters(this.prisma, query);
        const page = auditPage(
          query,
          `global:${userId}:${operator}:${hub?.id ?? ""}:${JSON.stringify(filters)}`,
        );
        // One table and one keyset. Category preserves the existing authority boundary.
        const accessSql = Prisma.sql`((a.category = 'content' AND a.hub_id = ${hub?.id ?? null}::uuid)
          OR (a.category = 'authentication' AND a.actor_user_id = ${userId}::uuid)
          OR (${operator} AND a.category IN ('operation', 'authentication')))`;
        const searchIds = await auditSearchIds(this.prisma, filters, page, accessSql);
        const rows = await this.prisma.auditLog.findMany({
          // Filtering (including the exact PostgreSQL timestamp cursor) already ran in SQL.
          where: { id: { in: searchIds } },
          orderBy: [{ createdAt: "desc" }, { id: "desc" }],
          take: page.limit + 1,
        });
        await this.prisma.auditLog.create({
          data: {
            category: operator ? "operation" : hub ? "content" : "authentication",
            actorUserId: userId,
            hubId: hub?.id,
            action: "audit.read",
            ...(operator || !hub ? { outcome: "success" } : {}),
          },
        });
        const usernames = await auditUsernames(this.prisma, rows);
        const items: AuditLogEntry[] = rows.map((r) => ({
          id: r.id,
          createdAt: r.createdAt.toISOString(),
          actorKind: r.actorKind,
          actorUserId: r.actorUserId,
          actorUsername: usernames.get(r.actorUserId ?? "") ?? null,
          authority: r.authority,
          hubId: r.hubId,
          targetUserId: r.targetUserId,
          targetUsername: usernames.get(r.targetUserId ?? "") ?? null,
          collectionId: r.collectionId,
          resourceId: r.resourceId,
          invitationId: r.invitationId,
          action: r.action,
          role: r.role,
          reason: r.reason,
          outcome: r.outcome,
          beforeState: r.beforeState,
          afterState: r.afterState,
        }));
        return auditResult(this.prisma, items, page, filters);
      };
      return operator ? this.runWithOutcome(req, false, work) : { value: await work() };
    });
    if ("error" in result) throw result.error;
    return result.value;
  }
  page(query: CursorQueryDto, scope: string) {
    const key = createHash("sha256").update(scope).digest("hex");
    const cursor = query.cursor
      ? decodeCursor<{ id: string; at: string; cutoff: string; scope: string }>(query.cursor)
      : null;
    if (
      query.cursor &&
      (!cursor ||
        !isUUID(cursor.id ?? "") ||
        cursor.scope !== key ||
        !Number.isFinite(Date.parse(cursor.at)) ||
        !Number.isFinite(Date.parse(cursor.cutoff)) ||
        Date.parse(cursor.cutoff) > Date.now())
    )
      throw appError("invalid_cursor");
    const cutoff = cursor?.cutoff ?? new Date().toISOString();
    const where = {
      AND: [
        { createdAt: { lte: new Date(cutoff) } },
        ...(cursor
          ? [
              {
                OR: [
                  { createdAt: { lt: new Date(cursor.at) } },
                  { createdAt: new Date(cursor.at), id: { lt: cursor.id } },
                ],
              },
            ]
          : []),
      ],
    };
    return { where, limit: query.limit ?? 20, cutoff, scope: key, cursor };
  }
  paged<T extends { id: string; createdAt: string }>(
    rows: T[],
    page: { limit: number; cutoff: string; scope: string },
  ) {
    const items = rows.slice(0, page.limit),
      last = items.at(-1);
    return {
      items,
      meta: {
        limit: page.limit,
        nextCursor:
          rows.length > page.limit && last
            ? encodeCursor({
                id: last.id,
                at: last.createdAt,
                cutoff: page.cutoff,
                scope: page.scope,
              })
            : null,
      },
    };
  }
}
