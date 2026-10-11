import { createHash, randomBytes } from "node:crypto";
import { ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import type {
  CollectionShareView,
  CursorMeta,
  HubPage,
  HubPerson,
  OperationReason,
  SavedCollection,
  ShareDescriptor,
  SharedCollection,
  Collection as WireCollection,
} from "@linkhub/types";
import { type ActivityEntry, auditActions, contentActions } from "@linkhub/types";
import { isUUID } from "class-validator";
import { CursorQueryDto } from "src/common/dto/cursor-query.dto";
import { AuthUser } from "src/common/interfaces/auth-user.interface";
import { decodeCursor, encodeCursor } from "src/common/utils/cursor.util";
import { toVersionEtag } from "src/common/utils/etag.util";
import { PrismaService } from "src/database/prisma.service";
import { Collection, Hub, Prisma } from "src/generated/prisma/client";
import { type AuditInput, recordAudit } from "../../common/audit";
import { appError } from "../../common/errors/app-exception";
import { personRefs } from "../../common/people";
import { wireToken } from "../../common/utils/wire-token";
import { emailConfig } from "../../email/config";
import { availableCollections } from "../hubs/availability";
import { CollectionPolicyService } from "../hubs/collection-policy.service";
import { ensurePersonalHub } from "../hubs/hub-onboarding";
import { HubsService } from "../hubs/hubs.service";
import { applyCollectionImpact, collectionImpact } from "./collection-impact";
import { CollectionImpactDto } from "./dto/collection-impact.dto";
import { CreateCollectionDto } from "./dto/create-collection.dto";
import { CreateShareDto } from "./dto/create-share.dto";
import { SetLinkSharingDto } from "./dto/set-link-sharing.dto";
import { TransferCollectionDto } from "./dto/transfer-collection.dto";
import { UpdateCollectionDto } from "./dto/update-collection.dto";

@Injectable()
export class CollectionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly hubs: HubsService,
    private readonly policy: CollectionPolicyService,
  ) {}

  // --- creation -----------------------------------------------------------

  async createHub(user: AuthUser): Promise<{ hubId: string }> {
    const hub = await ensurePersonalHub(this.prisma, user.userId);
    return { hubId: hub.id };
  }

  async create(user: AuthUser, dto: CreateCollectionDto) {
    const hubId = (await ensurePersonalHub(this.prisma, user.userId)).id;
    return this.createInHub(user, hubId, dto);
  }

  // --- settings / lifecycle ----------------------------------------------

  async update(id: string, user: AuthUser, dto: UpdateCollectionDto) {
    const collection = await this.requireCollection(id);
    await this.policy.requireManage(collection, user);

    if (dto.published === true) await this.policy.requireUnrestricted(collection);
    if (Number(dto.version) !== Number(collection.version)) {
      throw appError("version_conflict");
    }

    if (dto.slug && dto.slug !== collection.slug) {
      const exists = await this.prisma.collection.findUnique({
        where: { hubId_slug: { hubId: collection.hubId, slug: dto.slug } },
        select: { id: true },
      });
      if (exists) {
        throw appError("slug_conflict");
      }
    }

    // Details that shape the collection's content make its owner a contributor
    // (ADR-0015); publishing is recorded on its own.
    const detailsChanged =
      (dto.slug !== undefined && dto.slug !== collection.slug) ||
      (dto.title !== undefined && dto.title !== collection.title) ||
      (dto.description !== undefined && dto.description !== collection.description) ||
      (dto.commentsEnabled !== undefined && dto.commentsEnabled !== collection.commentsEnabled);
    const events: AuditEvent[] = [
      ...(detailsChanged ? [{ action: "collection.updated" as const }] : []),
      ...(dto.published === undefined || dto.published === collection.published
        ? []
        : [
            {
              action: dto.published ? "collection.published" : "collection.unpublished",
              effect: {
                beforeState: collection.published ? "published" : "unpublished",
                afterState: dto.published ? "published" : "unpublished",
                outcome: "success",
              },
            } as const,
          ]),
    ];
    const saved = await this.mutateOwned(collection, user, events, async (tx) => {
      const current = await tx.collection.findUniqueOrThrow({
        where: { id: collection.id, hubId: collection.hubId },
      });
      if (current.version !== collection.version) throw appError("version_conflict");
      return tx.collection.update({
        include: collectionTags,
        where: { id: collection.id, hubId: collection.hubId, version: collection.version },
        data: {
          slug: dto.slug ?? collection.slug,
          title: dto.title ?? collection.title,
          description: dto.description ?? collection.description,
          published: dto.published ?? collection.published,
          commentsEnabled: dto.commentsEnabled ?? collection.commentsEnabled,
          version: { increment: 1 },
        },
      });
    });
    return this.toPublicCollection(saved);
  }

  async impact(id: string, user: AuthUser, action: "delete" | "transfer") {
    return this.prisma.withAuthority(async () => {
      const collection = await this.requireCollection(id);
      await this.policy.requireManage(collection, user);
      return (await collectionImpact(this.prisma, collection, action)).view;
    });
  }

  async remove(id: string, user: AuthUser, dto: CollectionImpactDto = {}) {
    const collection = await this.requireCollection(id);
    await this.policy.requireManage(collection, user);
    await this.mutateOwned(collection, user, { action: "collection.deleted" }, async (tx) => {
      const current = await tx.collection.findUniqueOrThrow({
        where: { id, hubId: collection.hubId },
      });
      await applyCollectionImpact(tx, current, user.userId, "delete", dto.impactToken);
      await tx.collection.delete({ where: { id: collection.id, hubId: collection.hubId } });
    });
    return { id, deleted: true };
  }

  async setPublished(id: string, user: AuthUser, published: boolean) {
    const collection = await this.requireCollection(id);
    await this.policy.requireManage(collection, user);
    if (published) await this.policy.requireUnrestricted(collection);
    const event: AuditEvent = {
      action: published ? "collection.published" : "collection.unpublished",
    };
    const saved = await this.mutateOwned(collection, user, event, async (tx) => {
      const current = await tx.collection.findUniqueOrThrow({ where: { id } });
      event.effect = {
        beforeState: current.published ? "published" : "unpublished",
        afterState: published ? "published" : "unpublished",
        outcome: current.published === published ? "no_change" : "success",
      };
      return tx.collection.update({
        include: collectionTags,
        where: { id: collection.id },
        data: { published, version: { increment: 1 } },
      });
    });
    return this.toPublicCollection(saved);
  }

  async setLinkSharing(id: string, user: AuthUser, dto: SetLinkSharingDto) {
    const collection = await this.requireCollection(id);
    await this.policy.requireManage(collection, user);

    if (!dto.enabled) {
      // Disabling clears the token so an old link can never be resurrected.
      const event: AuditEvent = { action: "link.disabled" };
      await this.mutateOwned(collection, user, event, async (tx) => {
        const current = await tx.collection.findUniqueOrThrow({ where: { id } });
        event.effect = {
          beforeState: current.linkSharingEnabled ? "enabled" : "disabled",
          afterState: "disabled",
          outcome: current.linkSharingEnabled || current.shareTokenHash ? "success" : "no_change",
        };
        return tx.collection.update({
          include: collectionTags,
          where: { id: collection.id },
          data: {
            linkSharingEnabled: false,
            shareTokenHash: null,
            version: { increment: 1 },
          },
        });
      });
      return { collectionId: collection.id, linkSharingEnabled: false };
    }

    await this.policy.requireUnrestricted(collection);
    let token: string | undefined;
    const event: AuditEvent = { action: dto.rotate ? "link.rotated" : "link.enabled" };
    await this.mutateOwned(collection, user, event, async (tx) => {
      const current = await tx.collection.findUniqueOrThrow({
        where: { id: collection.id, hubId: collection.hubId },
      });
      // Decide from locked state: ordinary enable must never restore a
      // token invalidated by a concurrent rotation or disable.
      let shareTokenHash = current.shareTokenHash;
      if (!shareTokenHash || dto.rotate === true) {
        token = randomBytes(24).toString("base64url");
        shareTokenHash = createHash("sha256").update(token).digest("hex");
      }
      event.effect = {
        beforeState: current.linkSharingEnabled ? "enabled" : "disabled",
        afterState: "enabled",
        outcome: !current.linkSharingEnabled || token ? "success" : "no_change",
      };
      return tx.collection.update({
        include: collectionTags,
        where: { id: collection.id },
        data: {
          linkSharingEnabled: true,
          shareTokenHash,
          version: { increment: 1 },
        },
      });
    });

    return {
      collectionId: collection.id,
      linkSharingEnabled: true,
      // Raw token is shown once, only when freshly minted.
      ...(token ? { token, queryParam: `?s=${token}` } : {}),
    };
  }

  // --- direct sharing -----------------------------------------------------

  async createShare(id: string, user: AuthUser, dto: CreateShareDto) {
    const collection = await this.requireCollection(id);
    await this.policy.requireManage(collection, user);

    await this.policy.requireUnrestricted(collection);
    const target = await this.prisma.user.findFirst({
      where: { email: dto.email.trim().toLowerCase(), accountState: "active" },
      select: { id: true },
    });
    if (!target) {
      throw new NotFoundException("No account found for that email");
    }

    const role = dto.role ?? "viewer";
    const event: AuditEvent = { action: "share.granted", targetUserId: target.id, role };
    await this.mutateOwned(collection, user, event, async (tx) => {
      const previous = await tx.collectionShare.findUnique({
        where: { collectionId_userId: { collectionId: id, userId: target.id } },
      });
      event.effect = {
        beforeState: previous ? `${previous.source}_${previous.role}` : "none",
        afterState: `direct_${role}`,
        outcome: previous?.source === "direct" && previous.role === role ? "no_change" : "success",
      };
      return tx.collectionShare.upsert({
        where: {
          collectionId_userId: { collectionId: collection.id, userId: target.id },
        },
        update: { role, source: "direct" },
        create: {
          collectionId: collection.id,
          userId: target.id,
          role,
          source: "direct",
        },
      });
    });

    return { collectionId: collection.id, userId: target.id, role };
  }

  async removeShare(id: string, user: AuthUser, targetUserId: string) {
    const collection = await this.requireCollection(id);
    await this.policy.requireManage(collection, user);
    const event: AuditEvent = { action: "share.revoked", targetUserId };
    await this.mutateOwned(collection, user, event, async (tx) => {
      const previous = await tx.collectionShare.findUnique({
        where: { collectionId_userId: { collectionId: id, userId: targetUserId } },
      });
      event.effect = {
        beforeState: previous ? `${previous.source}_${previous.role}` : "none",
        afterState: "none",
        outcome: previous ? "success" : "no_change",
      };
      return tx.collectionShare.deleteMany({
        where: { collectionId: collection.id, userId: targetUserId },
      });
    });
    return { collectionId: collection.id, userId: targetUserId, removed: true };
  }

  async listShares(id: string, user: AuthUser): Promise<CollectionShareView[]> {
    const collection = await this.requireCollection(id);
    await this.policy.requireManage(collection, user);
    const shares = await this.prisma.collectionShare.findMany({
      where: { collectionId: collection.id },
      include: { user: { select: { id: true, name: true, email: true } } },
      orderBy: { createdAt: "asc" },
    });
    return shares.map((share) => ({
      userId: share.userId,
      displayName: share.user.name,
      // Display names are not unique, so direct shares echo back the email the
      // owner shared with. Link-source viewers never gave the owner their
      // email, so it is not exposed for them.
      email: share.source === "direct" ? share.user.email : null,
      role: wireToken(share.role, ["viewer", "contributor"]),
      source: wireToken(share.source, ["direct", "link"]),
    }));
  }

  // --- ownership transfer -------------------------------------------------

  // Google-Drive ownership transfer: only the current owner can transfer, and
  // only to a user who is already a contributor. The collection moves into
  // the recipient's hub (their "MyDrive"); the previous owner keeps contributor
  // access (lands in their shared/); the immutable creator is untouched.
  async transfer(id: string, user: AuthUser, dto: TransferCollectionDto) {
    const collection = await this.requireCollection(id);
    await this.policy.requireManage(collection, user); // owner-only

    await this.policy.requireUnrestricted(collection);
    const recipient = await this.prisma.user.findFirst({
      where: { email: dto.email.trim().toLowerCase(), accountState: "active" },
      select: { id: true },
    });
    if (!recipient) {
      throw new NotFoundException("No account found for that email");
    }
    if (recipient.id === user.userId) {
      throw appError("invalid_transfer");
    }

    // Drive rule: the recipient must already be a contributor on the collection.
    const share = await this.prisma.collectionShare.findUnique({
      where: { collectionId_userId: { collectionId: collection.id, userId: recipient.id } },
      select: { role: true },
    });
    if (share?.role !== "contributor") {
      throw appError("transfer_requires_contributor");
    }

    const recipientHub = await ensurePersonalHub(this.prisma, recipient.id);

    const conflict = await this.prisma.collection.findFirst({
      where: {
        hubId: recipientHub.id,
        slug: collection.slug,
      },
      select: { slug: true },
    });
    if (conflict) {
      throw appError("slug_conflict");
    }

    const previousOwnerId = user.userId;
    await this.mutateOwned(
      collection,
      user,
      {
        action: "collection.transferred_out",
        targetUserId: recipient.id,
        effect: { beforeState: collection.hubId, afterState: recipientHub.id, outcome: "success" },
      },
      async (tx) => {
        // Share management takes the same collection lock. Recheck after
        // acquiring it so a concurrent revocation cannot authorize transfer.
        const currentShare = await tx.collectionShare.findUnique({
          where: { collectionId_userId: { collectionId: collection.id, userId: recipient.id } },
          select: { role: true },
        });
        if (currentShare?.role !== "contributor") throw appError("transfer_requires_contributor");
        const current = await tx.collection.findUniqueOrThrow({
          where: { id, hubId: collection.hubId },
        });
        await applyCollectionImpact(tx, current, user.userId, "transfer", dto.impactToken);
        await recordAudit(tx, {
          hubId: recipientHub.id,
          actorUserId: user.userId,
          collectionId: collection.id,
          targetUserId: recipient.id,
          action: "collection.transferred_in",
          effect: {
            beforeState: collection.hubId,
            afterState: recipientHub.id,
            outcome: "success",
          },
        });
        await tx.collection.update({
          where: { id: collection.id, hubId: collection.hubId },
          data: { hubId: recipientHub.id, version: { increment: 1 } },
        });
        // The recipient now owns the collection, so their shares on it are redundant.
        await tx.collectionShare.deleteMany({
          where: { collectionId: collection.id, userId: recipient.id },
        });
        // Give the previous owner contributor access on this collection (their shared/).
        await tx.collectionShare.upsert({
          where: { collectionId_userId: { collectionId: collection.id, userId: previousOwnerId } },
          update: { role: "contributor", source: "direct" },
          create: {
            collectionId: collection.id,
            userId: previousOwnerId,
            role: "contributor",
            source: "direct",
          },
        });
      },
    );

    return {
      collectionId: collection.id,
      transferredTo: recipient.id,
      previousOwner: previousOwnerId,
    };
  }

  // --- saves --------------------------------------------------------------

  async save(id: string, user: AuthUser) {
    const collection = await this.requireCollection(id);
    await this.policy.requireRead(collection, user);
    if (!collection.published || !(await this.policy.resolve(collection, null)).canRead) {
      throw appError("collection_not_published");
    }
    await this.prisma.collectionSave.upsert({
      where: {
        collectionId_userId: {
          collectionId: collection.id,
          userId: user.userId,
        },
      },
      update: {},
      create: { collectionId: collection.id, userId: user.userId },
    });
    return { collectionId: collection.id, saved: true };
  }

  async unsave(id: string, user: AuthUser) {
    await this.prisma.collectionSave.deleteMany({
      where: { collectionId: id, userId: user.userId },
    });
    return { collectionId: id, saved: false };
  }

  // --- user surfaces ------------------------------------------------------

  async listShared(user: AuthUser): Promise<SharedCollection[]> {
    const shares = await this.prisma.collectionShare.findMany({
      where: { userId: user.userId, collection: availableCollections(user.userId) },
      include: { collection: { include: collectionTags } },
      orderBy: { createdAt: "desc" },
    });
    // Link-sourced access is valid only while link sharing stays enabled.
    return shares
      .filter((s) => s.source === "direct" || s.collection.linkSharingEnabled)
      .map((s) => ({
        ...this.toPublicCollection(s.collection),
        shareRole: wireToken(s.role, ["viewer", "contributor"]),
        shareSource: wireToken(s.source, ["direct", "link"]),
      }));
  }

  async listSaved(user: AuthUser): Promise<SavedCollection[]> {
    const saves = await this.prisma.collectionSave.findMany({
      where: { userId: user.userId },
      include: { collection: { include: collectionTags } },
      orderBy: { savedAt: "desc" },
    });
    // Dormant handling: an unpublished save stays listed but marked
    // unavailable, and revives when the collection is republished.
    return Promise.all(
      saves.map(async (s) => {
        const available =
          s.collection.published && (await this.policy.resolve(s.collection, null)).canRead;
        return {
          ...this.toPublicCollection(s.collection),
          ...(!available ? { description: null, tags: [] } : {}),
          savedAt: s.savedAt.toISOString(),
          available,
        };
      }),
    );
  }

  // --- discovery / lookup -------------------------------------------------

  async discover(query: CursorQueryDto) {
    return this.listPublishedCollections(query, {});
  }

  async getHubPage(hubId: string, query: CursorQueryDto) {
    const hub = await this.prisma.hub.findUnique({ where: { id: hubId } });
    return this.buildHubPage(hub, query);
  }

  // Handle resolution for /@handle pages. The handle is the handy way in; the
  // payload carries the immutable hubId, which is what clients keep. Handle
  // semantics stay in the hubs module.
  async getHubPageByHandle(handle: string, query: CursorQueryDto) {
    const hub = await this.hubs.getHubByHandle(handle);
    return this.buildHubPage(hub, query);
  }

  private async buildHubPage(
    hub: Hub | null,
    query: CursorQueryDto,
  ): Promise<HubPage & { meta: CursorMeta }> {
    const visible =
      hub &&
      (await this.prisma.hub.findFirst({
        where: { id: hub.id, owner: { accountState: "active" } },
        select: {
          showOwner: true,
          owner: { select: { id: true, username: true, name: true } },
        },
      }));
    if (!hub || !visible) throw new NotFoundException("Hub not found");
    const [collections, publishedCollectionCount] = await Promise.all([
      this.listPublishedCollections(query, { hubId: hub.id }),
      this.prisma.collection.count({
        where: { hubId: hub.id, published: true, ...availableCollections() },
      }),
    ]);
    return {
      hub: {
        id: hub.id,
        handle: hub.handle,
        name: hub.name,
        owner: visible.showOwner
          ? { userId: visible.owner.id, username: visible.owner.username }
          : null,
        ownerName: visible.showOwner ? visible.owner.name.trim() || null : null,
        description: hub.description,
        publishedCollectionCount,
        createdAt: hub.createdAt.toISOString(),
        updatedAt: hub.updatedAt.toISOString(),
      },
      collections: collections.items,
      meta: collections.meta,
    };
  }

  async listHubCollections(hubId: string, viewer: AuthUser | null, query: CursorQueryDto) {
    const hub = await this.prisma.hub.findUnique({
      where: { id: hubId },
      select: { id: true },
    });
    if (
      !hub ||
      !(await this.prisma.hub.findFirst({
        where: { id: hub.id, owner: { accountState: "active" } },
      }))
    ) {
      throw new NotFoundException("Hub not found");
    }

    const isOwner = viewer !== null && (await this.hubs.isOwner(hubId, viewer.userId));

    // The owner sees every collection; everyone else sees the published subset.
    return this.listCollectionsKeyset(query, {
      hubId,
      ...(isOwner
        ? availableCollections(viewer?.userId)
        : { published: true, ...availableCollections() }),
    });
  }

  async getHubCollectionBySlug(
    hubId: string,
    slug: string,
    viewer: AuthUser | null,
    shareToken?: string,
  ) {
    const collection = await this.prisma.collection.findUnique({
      where: { hubId_slug: { hubId, slug } },
      include: collectionTags,
    });
    if (!collection) {
      throw new NotFoundException("Collection not found");
    }
    return this.readCollectionView(collection, viewer, shareToken);
  }

  // Durable lookup by the immutable collection id — the reference that
  // survives a slug rename (hub+slug is the pretty URL, this is the permalink).
  async getById(id: string, viewer: AuthUser | null, shareToken?: string) {
    const collection = await this.requireCollection(id);
    return this.readCollectionView(collection, viewer, shareToken);
  }

  // Resolving a share address must not remember a link grant or assemble content.
  async getShareContext(id: string, viewer: AuthUser | null, shareToken?: string) {
    const collection = await this.requireCollection(id);
    const access = await this.policy.requireRead(collection, viewer, shareToken);
    // Owner/direct access does not prove that a submitted token is still valid.
    const recipient = await this.policy.resolve(collection, null, shareToken);
    const token = !collection.published && recipient.viaLinkToken ? shareToken : undefined;
    const recipientAccess: ShareDescriptor["access"] = recipient.canRead
      ? collection.published
        ? "public"
        : "link"
      : "restricted";
    return {
      id: collection.id,
      title: collection.title,
      token,
      access: recipientAccess,
      canManageAccess: access.canManage,
    };
  }

  private async readCollectionView(
    collection: CollectionWithTags,
    viewer: AuthUser | null,
    shareToken?: string,
  ) {
    const access = await this.policy.requireRead(collection, viewer, shareToken);
    if (access.viaLinkToken && viewer) {
      await this.policy.recordLinkAccess(collection.id, viewer.userId);
    }

    const reason = access.isOwner ? await this.policy.holdReason(collection) : null;
    const creator = collection.creatorUserId
      ? await this.prisma.user.findFirst({
          where: { id: collection.creatorUserId, accountState: "active" },
          select: { id: true, username: true },
        })
      : null;
    const contributors = await this.contributors(collection.id);
    return {
      collection: {
        ...this.toPublicCollection(collection),
        contributors,
        creator: creator ? { userId: creator.id, username: creator.username } : null,
        capabilities: { canManage: access.isOwner, canEdit: access.canWriteContent },
        ...(reason
          ? {
              restriction: {
                reason: reason as OperationReason,
                supportUrl: emailConfig().supportUrl,
              },
            }
          : {}),
      },
      etag: toVersionEtag(Number(collection.version)),
      lastModified: collection.updatedAt.toUTCString(),
    };
  }

  async listPeople(user: AuthUser, query: CursorQueryDto) {
    const hubId = await this.hubs.getUserHubId(user.userId);
    const limit = query.limit ?? 20;
    if (!hubId) {
      if (query.cursor) throw appError("invalid_cursor");
      return { items: [], meta: { limit, nextCursor: null } };
    }
    const cursor = query.cursor ? decodeCursor<{ id: string; hubId: string }>(query.cursor) : null;
    if (query.cursor && (!cursor || !isUUID(cursor.id) || cursor.hubId !== hubId))
      throw appError("invalid_cursor");
    const shares: Prisma.CollectionShareWhereInput = {
      collection: { hubId },
      OR: [{ source: "direct" }, { source: "link", collection: { linkSharingEnabled: true } }],
    };
    const rows = await this.prisma.user.findMany({
      where: { shares: { some: shares }, ...(cursor ? { id: { lt: cursor.id } } : {}) },
      orderBy: { id: "desc" },
      take: limit + 1,
      select: { id: true, username: true, _count: { select: { shares: { where: shares } } } },
    });
    const items: HubPerson[] = rows.slice(0, limit).map((person) => ({
      userId: person.id,
      username: person.username,
      collectionCount: person._count.shares,
    }));
    return {
      items,
      meta: {
        limit,
        nextCursor: rows.length > limit ? encodeCursor({ id: items.at(-1)?.userId, hubId }) : null,
      },
    };
  }

  private async mutateOwned<T>(
    collection: Collection,
    user: AuthUser,
    event: AuditEvent | AuditEvent[] | undefined,
    mutate: (tx: Prisma.TransactionClient) => Promise<T>,
  ): Promise<T> {
    return this.prisma.$transaction(async (tx) => {
      const locked = await tx.$queryRaw<Array<{ id: string }>>`
        SELECT c.id FROM collections c JOIN hubs h ON h.id = c.hub_id
        WHERE c.id = ${collection.id}::uuid AND c.hub_id = ${collection.hubId}::uuid
          AND h.owner_user_id = ${user.userId}::uuid FOR UPDATE OF c`;
      if (locked.length !== 1) throw new NotFoundException("Collection not found");
      const result = await mutate(tx);
      for (const each of event === undefined ? [] : [event].flat())
        await recordAudit(tx, {
          ...each,
          hubId: collection.hubId,
          actorUserId: user.userId,
          collectionId: collection.id,
        });
      return result;
    });
  }

  // The collection's history for its contributors (owner and contributors), newest
  // first: who did what to which item (ADR-0015). Items show as they are now;
  // a removed item keeps its entry with no item. Not found for those who
  // can't read the collection; forbidden for readers. Contributors see content and
  // moderation only: sharing, link and transfer entries name who has access,
  // which only the owner may see (listing shares is owner-only).
  async activity(id: string, user: AuthUser, query: CursorQueryDto) {
    const collection = await this.requireCollection(id);
    const access = await this.policy.resolve(collection, user);
    if (!access.canRead) throw new NotFoundException("Collection not found");
    if (!access.canWriteContent) throw new ForbiddenException("Forbidden");
    const limit = query.limit ?? 20;
    const cursor = query.cursor ? decodeCursor<{ id: string }>(query.cursor) : null;
    if (
      query.cursor &&
      (!cursor ||
        typeof cursor.id !== "string" ||
        !/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(cursor.id) ||
        !(await this.prisma.auditLog.findFirst({
          where: { id: cursor.id, collectionId: id, category: "content" },
        })))
    )
      throw appError("invalid_cursor");
    const rows = await this.prisma.auditLog.findMany({
      where: {
        collectionId: id,
        category: "content",
        action: access.isOwner
          ? { not: "audit.read" }
          : { in: [...contentActions, ...moderationActions] },
      },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: limit + 1,
      ...(cursor ? { cursor: { id: cursor.id }, skip: 1 } : {}),
    });
    const page = rows.slice(0, limit);
    const [people, items] = await Promise.all([
      personRefs(
        this.prisma,
        page.flatMap((row) => [row.actorUserId, row.targetUserId]),
      ),
      this.prisma.resource.findMany({
        where: {
          collectionId: id,
          id: { in: page.flatMap((row) => (row.resourceId ? [row.resourceId] : [])) },
        },
      }),
    ]);
    const titles = new Map(
      (
        await this.prisma.linkMetadata.findMany({
          where: { url: { in: items.flatMap((item) => (item.url ? [item.url] : [])) } },
          select: { url: true, title: true },
        })
      ).map((row) => [row.url, row.title]),
    );
    const itemViews = new Map<string, NonNullable<ActivityEntry["item"]>>();
    for (const item of items) {
      let title: string | null = null;
      if (item.kind === "heading") title = item.titleOverride;
      else if (item.kind === "external_link") title = titles.get(item.url ?? "") ?? item.url;
      else if (item.linkedCollectionId) {
        const target = await this.prisma.collection.findUnique({
          where: { id: item.linkedCollectionId },
        });
        if (
          target &&
          target.hubId === collection.hubId &&
          (await this.policy.resolve(target, user)).canRead
        )
          title = target.title;
      }
      itemViews.set(item.id, {
        id: item.id,
        kind: wireToken(item.kind, ["external_link", "collection_link", "heading"]),
        title,
      });
    }
    return {
      items: page.map(
        (row): ActivityEntry => ({
          id: row.id,
          action: wireToken(row.action, auditActions),
          actor: people.get(row.actorUserId ?? "") ?? null,
          target: (row.targetUserId && people.get(row.targetUserId)) || null,
          item: (row.resourceId && itemViews.get(row.resourceId)) || null,
          createdAt: row.createdAt.toISOString(),
        }),
      ),
      meta: {
        limit,
        nextCursor: rows.length > limit ? encodeCursor({ id: page.at(-1)?.id }) : null,
      },
    };
  }

  // Everyone who has shaped the collection's content (creation, details, items),
  // most recent first, from its activity entries (ADR-0015). Suspended accounts
  // are left out, as everywhere people are shown.
  private async contributors(collectionId: string) {
    const groups = await this.prisma.auditLog.groupBy({
      by: ["actorUserId"],
      where: { collectionId, category: "content", action: { in: [...contentActions] } },
      _max: { createdAt: true },
      orderBy: { _max: { createdAt: "desc" } },
    });
    const people = await personRefs(
      this.prisma,
      groups.map((group) => group.actorUserId),
    );
    const ordered = groups.flatMap((group) => people.get(group.actorUserId ?? "") ?? []);
    return { people: ordered.slice(0, 5), total: ordered.length };
  }

  async publicContributions(userId: string, query: CursorQueryDto) {
    const limit = query.limit ?? 20;
    const cursor = query.cursor
      ? decodeCursor<{ u: string; id: string; person: string }>(query.cursor)
      : null;
    if (
      query.cursor &&
      (!cursor ||
        cursor.person !== userId ||
        typeof cursor.id !== "string" ||
        !isUUID(cursor.id) ||
        typeof cursor.u !== "string" ||
        !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{6}Z$/.test(cursor.u) ||
        Number.isNaN(Date.parse(cursor.u)) ||
        new Date(cursor.u).toISOString() !== `${cursor.u.slice(0, 23)}Z`)
    )
      throw appError("invalid_cursor");
    // Keep the SQL timestamp intact: Date would truncate the cursor to milliseconds.
    const rows = await this.prisma.$queryRaw<Array<{ id: string; updatedAt: string }>>(Prisma.sql`
      SELECT c.id,
        to_char(c.updated_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS "updatedAt"
      FROM collections c
      JOIN hubs h ON h.id = c.hub_id JOIN users u ON u.id = h.owner_user_id
      WHERE c.published AND u.account_state = 'active'
        AND NOT EXISTS (SELECT 1 FROM collection_holds ch WHERE ch.collection_id = c.id AND ch.active)
        AND EXISTS (SELECT 1 FROM audit_logs a WHERE a.category = 'content' AND a.collection_id = c.id
          AND a.actor_user_id = ${userId}::uuid AND a.action IN (${Prisma.join([...contentActions])}))
        ${cursor ? Prisma.sql`AND (c.updated_at, c.id) < (${cursor.u}::timestamptz, ${cursor.id}::uuid)` : Prisma.empty}
      ORDER BY c.updated_at DESC, c.id DESC LIMIT ${limit + 1}
    `);
    const page = rows.slice(0, limit);
    const found = await this.prisma.collection.findMany({
      where: { id: { in: page.map((row) => row.id) }, published: true, ...availableCollections() },
      include: { ...collectionTags, hub: { select: { id: true, handle: true, name: true } } },
    });
    const byId = new Map(found.map((row) => [row.id, row]));
    const last = page.at(-1);
    return {
      items: page.flatMap((row) => {
        const item = byId.get(row.id);
        return item
          ? [
              {
                ...this.toPublicCollection(item),
                hub: item.hub,
              },
            ]
          : [];
      }),
      meta: {
        limit,
        nextCursor:
          rows.length > limit && last
            ? encodeCursor({
                person: userId,
                id: last.id,
                u: last.updatedAt,
              })
            : null,
      },
    };
  }

  // --- internals ----------------------------------------------------------

  // Collections are independent containers.
  private async createInHub(user: AuthUser, hubId: string, dto: CreateCollectionDto) {
    const exists = await this.prisma.collection.findUnique({
      where: { hubId_slug: { hubId, slug: dto.slug } },
      select: { id: true },
    });
    if (exists) {
      throw appError("slug_conflict");
    }

    const saved = await this.prisma.$transaction(async (tx) => {
      const created = await tx.collection.create({
        include: collectionTags,
        data: {
          hubId,
          // Immutable creator/provenance: unchanged if ownership is later
          // transferred (the owning hubId changes, the creator does not).
          creatorUserId: user.userId,
          slug: dto.slug,
          title: dto.title,
          description: dto.description,
          published: dto.published ?? true,
        },
      });
      const event = { hubId, actorUserId: user.userId, collectionId: created.id };
      await recordAudit(tx, { ...event, action: "collection.created" });
      if (created.published) await recordAudit(tx, { ...event, action: "collection.published" });
      return created;
    });
    return this.toPublicCollection(saved);
  }

  private async listPublishedCollections(query: CursorQueryDto, extraWhere: { hubId?: string }) {
    return this.listCollectionsKeyset(query, {
      published: true,
      ...availableCollections(),
      ...extraWhere,
    });
  }

  private async listCollectionsKeyset(query: CursorQueryDto, where: Prisma.CollectionWhereInput) {
    const limit = query.limit ?? 20;
    const cursor = query.cursor ? decodeCursor<{ u: string; id: string }>(query.cursor) : null;
    if (
      query.cursor &&
      (cursor === null ||
        typeof cursor.u !== "string" ||
        typeof cursor.id !== "string" ||
        !isUUID(cursor.id) ||
        Number.isNaN(Date.parse(cursor.u)))
    ) {
      throw appError("invalid_cursor");
    }

    const rows = await this.prisma.collection.findMany({
      where: {
        AND: [
          where,
          ...(cursor
            ? [
                {
                  OR: [
                    { updatedAt: { lt: new Date(cursor.u) } },
                    { updatedAt: new Date(cursor.u), id: { lt: cursor.id } },
                  ],
                },
              ]
            : []),
        ],
      },
      include: {
        ...collectionTags,
        hub: {
          select: {
            id: true,
            handle: true,
            name: true,
          },
        },
      },
      orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
      take: limit + 1,
    });

    const items = rows.slice(0, limit);
    const last = items[items.length - 1];
    const nextCursor =
      rows.length > limit && last ? encodeCursor({ u: last.updatedAt, id: last.id }) : null;

    return {
      items: items.map((item) => ({
        ...this.toPublicCollection(item),
        hub: {
          id: item.hub.id,
          handle: item.hub.handle,
          name: item.hub.name,
        },
      })),
      meta: { limit, nextCursor },
    };
  }

  private async requireCollection(
    id: string,
    message = "Collection not found",
  ): Promise<CollectionWithTags> {
    const collection = await this.prisma.collection.findUnique({
      where: { id },
      include: collectionTags,
    });
    if (!collection) {
      throw new NotFoundException(message);
    }
    return collection;
  }

  private toPublicCollection(collection: CollectionWithTags): WireCollection {
    return {
      id: collection.id,
      hubId: collection.hubId,
      slug: collection.slug,
      title: collection.title,
      description: collection.description,
      tags: collection.tags.map(({ tag }) => tag.name),
      published: collection.published,
      linkSharingEnabled: collection.linkSharingEnabled,
      commentsEnabled: collection.commentsEnabled,
      version: Number(collection.version),
      createdAt: collection.createdAt.toISOString(),
      updatedAt: collection.updatedAt.toISOString(),
    };
  }
}

type AuditEvent = Omit<AuditInput, "hubId" | "actorUserId" | "collectionId">;

const moderationActions = [
  "comment.hidden",
  "comment.shown",
  "comment.answer_marked",
  "comment.answer_unmarked",
] as const;

const collectionTags = {
  tags: {
    select: { tag: { select: { name: true } } },
    orderBy: [{ itemCount: "desc" as const }, { tag: { name: "asc" as const } }],
  },
};
type CollectionWithTags = Collection & { tags: { tag: { name: string } }[] };
