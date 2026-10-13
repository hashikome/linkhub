import { createHash } from "node:crypto";
import { ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { AuthUser } from "src/common/interfaces/auth-user.interface";
import { PrismaService } from "src/database/prisma.service";
import { Collection, Resource } from "src/generated/prisma/client";
import { appError } from "../../common/errors/app-exception";
import { recentlyVerifiedViewer } from "../../common/verified-viewer";
import { availableCollections } from "./availability";

export interface CollectionAccess {
  canRead: boolean;
  canWriteContent: boolean; // resources, tags (owner or direct contributor)
  canManage: boolean; // imports, publish, share, delete, settings (owner only)
  viaLinkToken: boolean; // access came from a presented share token
  isOwner: boolean; // the viewer owns the hub holding this collection
}

const NO_ACCESS: CollectionAccess = {
  canRead: false,
  canWriteContent: false,
  canManage: false,
  viaLinkToken: false,
  isOwner: false,
};

// Collection access is independent: owner, direct grant, active link, publication.
@Injectable()
export class CollectionPolicyService {
  constructor(private readonly prisma: PrismaService) {}

  async resolve(
    collection: Collection,
    viewer: AuthUser | null,
    shareToken?: string,
  ): Promise<CollectionAccess> {
    return (
      (await this.resolveBatch([collection], viewer, shareToken)).get(collection.id) ?? NO_ACCESS
    );
  }

  // Results live only for this operation. Every call checks current account,
  // ownership, hold and share state; source tokens never enter batch resolution.
  // A read's session resolution moments ago already proved the account active.
  async resolveMany(collections: Collection[], viewer: AuthUser | null) {
    return this.resolveBatch(collections, viewer);
  }

  private async resolveBatch(
    collections: Collection[],
    viewer: AuthUser | null,
    shareToken?: string,
  ) {
    const result = new Map(collections.map((collection) => [collection.id, NO_ACCESS]));
    if (!collections.length) return result;
    if (
      viewer &&
      !recentlyVerifiedViewer(viewer) &&
      !(await this.prisma.user.findFirst({
        where: { id: viewer.userId, accountState: "active" },
        select: { id: true },
      }))
    )
      return result;
    const available = await this.prisma.collection.findMany({
      where: {
        AND: [
          { OR: collections.map(({ id, hubId }) => ({ id, hubId })) },
          availableCollections(viewer?.userId),
        ],
      },
    });
    if (!available.length) return result;
    const hubs = viewer
      ? await this.prisma.hub.findMany({
          where: { id: { in: [...new Set(available.map((collection) => collection.hubId))] } },
          select: { id: true, ownerUserId: true },
        })
      : [];
    const owned = new Set(
      hubs.filter((hub) => hub.ownerUserId === viewer?.userId).map((hub) => hub.id),
    );
    const sharedIds = available
      .filter((collection) => !owned.has(collection.hubId))
      .map((collection) => collection.id);
    const shares =
      viewer && sharedIds.length
        ? await this.prisma.collectionShare.findMany({
            where: { collectionId: { in: sharedIds }, userId: viewer.userId },
            select: { collectionId: true, role: true, source: true },
          })
        : [];
    const byId = new Map(shares.map((share) => [share.collectionId, share]));
    const hash = shareToken ? createHash("sha256").update(shareToken).digest("hex") : undefined;
    for (const collection of available) {
      if (owned.has(collection.hubId)) {
        result.set(collection.id, {
          canRead: true,
          canWriteContent: true,
          canManage: true,
          viaLinkToken: false,
          isOwner: true,
        });
        continue;
      }
      const share = byId.get(collection.id);
      const direct = share?.source === "direct";
      const remembered = share?.source === "link" && collection.linkSharingEnabled;
      const viaLinkToken = Boolean(
        hash && collection.linkSharingEnabled && collection.shareTokenHash === hash,
      );
      if (direct || remembered || viaLinkToken || collection.published)
        result.set(collection.id, {
          canRead: true,
          canWriteContent: direct && share.role === "contributor",
          canManage: false,
          viaLinkToken,
          isOwner: false,
        });
    }
    return result;
  }

  // References authorize their own destination and require current same-hub
  // ownership. Return only readable targets, keyed by the referring resource.
  async readableReferences(
    items: Resource[],
    viewer: AuthUser | null,
  ): Promise<Map<string, Collection>> {
    const refs = items.filter((item) => item.kind === "collection_link" && item.linkedCollectionId);
    if (!refs.length) return new Map();
    const ids = [
      ...new Set(refs.flatMap((item) => [item.collectionId, item.linkedCollectionId as string])),
    ];
    const collections = await this.prisma.collection.findMany({ where: { id: { in: ids } } });
    const byId = new Map(collections.map((collection) => [collection.id, collection]));
    const targets = new Map<string, Collection>();
    for (const item of refs) {
      const target = byId.get(item.linkedCollectionId as string);
      if (target && byId.get(item.collectionId)?.hubId === target.hubId)
        targets.set(target.id, target);
    }
    const access = await this.resolveMany([...targets.values()], viewer);
    const readable = new Map<string, Collection>();
    for (const item of refs) {
      const target = targets.get(item.linkedCollectionId as string);
      if (
        target &&
        byId.get(item.collectionId)?.hubId === target.hubId &&
        access.get(target.id)?.canRead
      )
        readable.set(item.id, target);
    }
    return readable;
  }

  async holdReason(collection: Collection): Promise<string | null> {
    const hold = await this.prisma.collectionHold.findUnique({
      where: { collectionId: collection.id },
    });
    return hold?.active ? hold.reason : null;
  }

  async requireUnrestricted(collection: Collection): Promise<void> {
    if (await this.holdReason(collection)) throw appError("collection_held");
  }

  async requireRead(
    collection: Collection,
    viewer: AuthUser | null,
    shareToken?: string,
  ): Promise<CollectionAccess> {
    const access = await this.resolve(collection, viewer, shareToken);
    if (!access.canRead) {
      // Prefer 404 over 403 for resources the caller cannot know exist.
      throw new NotFoundException("Collection not found");
    }
    return access;
  }

  async requireWriteContent(collection: Collection, user: AuthUser): Promise<CollectionAccess> {
    const access = await this.resolve(collection, user);
    if (!access.canWriteContent) {
      throw new ForbiddenException("Forbidden");
    }
    return access;
  }

  async requireManage(collection: Collection, user: AuthUser): Promise<CollectionAccess> {
    const access = await this.resolve(collection, user);
    if (!access.canManage) {
      throw new ForbiddenException("Forbidden");
    }
    return access;
  }

  // When a signed-in non-owner opens a valid share link, remember it under their
  // shared/ surface against that collection only. Never overwrite an
  // existing (e.g. direct) share.
  async recordLinkAccess(collectionId: string, userId: string): Promise<void> {
    const existing = await this.prisma.collectionShare.findUnique({
      where: { collectionId_userId: { collectionId, userId } },
      select: { collectionId: true },
    });
    if (existing) {
      return;
    }
    await this.prisma.collectionShare.create({
      data: { collectionId, userId, role: "viewer", source: "link" },
    });
  }
}
