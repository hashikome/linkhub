import { createHash } from "node:crypto";
import { ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { AuthUser } from "src/common/interfaces/auth-user.interface";
import { PrismaService } from "src/database/prisma.service";
import { Collection } from "src/generated/prisma/client";
import { appError } from "../../common/errors/app-exception";
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
    if (
      viewer &&
      !(await this.prisma.user.findFirst({ where: { id: viewer.userId, accountState: "active" } }))
    )
      return NO_ACCESS;
    if (
      !(await this.prisma.collection.findFirst({
        where: {
          id: collection.id,
          hubId: collection.hubId,
          ...availableCollections(viewer?.userId),
        },
      }))
    )
      return NO_ACCESS;
    // The owner of this collection's hub has full authority.
    if (viewer) {
      const hub = await this.prisma.hub.findUnique({
        where: { id: collection.hubId },
        select: { ownerUserId: true },
      });
      if (hub?.ownerUserId === viewer.userId) {
        return {
          canRead: true,
          canWriteContent: true,
          canManage: true,
          viaLinkToken: false,
          isOwner: true,
        };
      }
    }

    let canRead = false;
    let canWriteContent = false;
    let viaLinkToken = false;

    if (viewer) {
      const share = await this.prisma.collectionShare.findUnique({
        where: { collectionId_userId: { userId: viewer.userId, collectionId: collection.id } },
        select: { role: true, source: true },
      });
      if (share?.source === "direct") {
        canRead = true;
        canWriteContent = share.role === "contributor";
      } else if (share?.source === "link" && collection.linkSharingEnabled) {
        canRead = true;
      }
    }

    if (shareToken) {
      const hash = createHash("sha256").update(shareToken).digest("hex");
      const match = collection.linkSharingEnabled && collection.shareTokenHash === hash;
      if (match) {
        canRead = true;
        viaLinkToken = true;
      }
    }

    if (collection.published) {
      canRead = true;
    }

    if (!canRead) {
      return NO_ACCESS;
    }

    return {
      canRead,
      canWriteContent,
      canManage: false,
      viaLinkToken,
      isOwner: false,
    };
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
