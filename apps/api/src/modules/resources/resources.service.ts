import { Injectable, NotFoundException } from "@nestjs/common";
import type { AuditAction, PersonRef, Resource as WireResource } from "@nslinkhub/types";
import { CursorQueryDto } from "src/common/dto/cursor-query.dto";
import { ResourceKind } from "src/common/enums/resource-kind.enum";
import { AuthUser } from "src/common/interfaces/auth-user.interface";
import { decodeCursor, encodeCursor } from "src/common/utils/cursor.util";
import { publicLinkUrl } from "src/common/utils/url.util";
import { PrismaService } from "src/database/prisma.service";
import { Collection, Prisma, Resource } from "src/generated/prisma/client";
import { recordAudit } from "../../common/audit";
import { appError } from "../../common/errors/app-exception";
import { personRefs } from "../../common/people";
import { wireToken } from "../../common/utils/wire-token";
import { CollectionPolicyService } from "../hubs/collection-policy.service";
import {
  CreateCollectionResourceDto,
  CreateHeadingResourceDto,
} from "./dto/create-collection-resource.dto";
import { CreateExternalResourceDto } from "./dto/create-external-resource.dto";
import { MoveResourceDto } from "./dto/move-resource.dto";
import { ReorderResourcesDto } from "./dto/reorder-resources.dto";
import { UpdateResourceDto } from "./dto/update-resource.dto";
import { itemTags } from "./item-tags";
import { type LinkMeta, metadataFor, readLinkMetadata, requestLinkMetadata } from "./link-metadata";

@Injectable()
export class ResourcesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly policy: CollectionPolicyService,
  ) {}

  async createExternal(collectionId: string, user: AuthUser, dto: CreateExternalResourceDto) {
    const collection = await this.requireWritableCollection(collectionId, user);
    await this.ensurePositionAvailable(collection.id, dto.position);

    const url = publicLinkUrl(dto.url);
    const duplicate = await this.prisma.resource.findFirst({
      where: { collectionId: collection.id, url },
      select: { id: true },
    });
    if (duplicate) {
      throw appError("duplicate_resource");
    }

    const saved = await this.insertExternal(collection, user, url, dto.tags ?? [], dto.position);
    return this.toPublicResource(saved, await this.context([saved]));
  }

  // Inserts a canonical, non-duplicate link into a collection the caller has
  // already authorized, records who added it, and requests its page metadata
  // in the same transaction; the worker looks it up once the save commits.
  async insertExternal(
    collection: Pick<Collection, "id" | "hubId">,
    user: AuthUser,
    url: string,
    tags: string[],
    position: number,
  ) {
    const saved = await this.prisma.resource.create({
      data: {
        collectionId: collection.id,
        kind: ResourceKind.EXTERNAL_LINK,
        url,
        tags: await itemTags(this.prisma, tags),
        position,
        addedByUserId: user.userId,
      },
    });
    await requestLinkMetadata(this.prisma, [url]);
    await this.record(collection, user, "item.link_added", saved.id);
    return saved;
  }

  // Every content change is an activity entry in the change's own transaction
  // (ADR-0015): attribution and the hub audit are derived from these.
  async record(
    collection: Pick<Collection, "id" | "hubId">,
    user: AuthUser,
    action: AuditAction,
    resourceId?: string,
  ) {
    await recordAudit(this.prisma as unknown as Prisma.TransactionClient, {
      hubId: collection.hubId,
      actorUserId: user.userId,
      collectionId: collection.id,
      action,
      ...(resourceId ? { resourceId } : {}),
    });
  }

  async createCollectionLink(
    collectionId: string,
    user: AuthUser,
    dto: CreateCollectionResourceDto,
  ) {
    const collection = await this.requireWritableCollection(collectionId, user);
    const target = await this.prisma.collection.findUnique({
      where: { id: dto.linkedCollectionId },
    });
    if (!target) throw new NotFoundException("Collection not found");
    await this.policy.requireRead(target, user);
    await this.ensurePositionAvailable(collection.id, dto.position);
    if (
      await this.prisma.resource.findFirst({
        where: { collectionId, linkedCollectionId: target.id },
      })
    )
      throw appError("duplicate_resource");
    const resource = await this.prisma.resource.create({
      data: {
        collectionId,
        kind: ResourceKind.COLLECTION_LINK,
        linkedCollectionId: target.id,
        position: dto.position,
        tags: await itemTags(this.prisma, dto.tags),
        addedByUserId: user.userId,
      },
    });
    await this.record(collection, user, "item.reference_added", resource.id);
    return this.resourceView(resource, user, await this.context([resource]));
  }

  async createHeading(collectionId: string, user: AuthUser, dto: CreateHeadingResourceDto) {
    const collection = await this.requireWritableCollection(collectionId, user);
    const rows = await this.prisma.resource.findMany({
      where: { collectionId },
      orderBy: { position: "asc" },
    });
    const index = rows.findIndex((row) => row.id === dto.firstItemId);
    const first = rows[index];
    if (!first || first.kind === ResourceKind.HEADING) throw appError("bad_request");
    if (Number(first.version) !== dto.firstItemVersion) throw appError("version_conflict");
    this.assertSectionOrder([
      ...rows.slice(0, index),
      { kind: ResourceKind.HEADING },
      ...rows.slice(index),
    ]);
    // Shift backwards to keep unique positions valid at every statement. Bump
    // versions so concurrent drafts cannot silently target a moved boundary.
    for (const row of rows.slice(index).reverse()) {
      await this.prisma.resource.update({
        where: { id: row.id, collectionId },
        data: { position: row.position + 1, version: { increment: 1 } },
      });
    }
    const heading = await this.prisma.resource.create({
      data: {
        collectionId,
        kind: ResourceKind.HEADING,
        titleOverride: dto.title.trim(),
        sectionDescription: dto.description?.trim() || null,
        position: first.position,
        addedByUserId: user.userId,
      },
    });
    await this.record(collection, user, "item.section_added", heading.id);
    return this.toPublicResource(heading, await this.context([heading]));
  }

  async getByCollection(
    collectionId: string,
    viewer: AuthUser | null,
    shareToken: string | undefined,
    query: CursorQueryDto,
  ) {
    await this.requireReadableCollection(collectionId, viewer, shareToken);

    const limit = query.limit ?? 20;
    const cursor = query.cursor ? decodeCursor<{ p: number }>(query.cursor) : null;
    if (
      query.cursor &&
      (cursor === null ||
        typeof cursor.p !== "number" ||
        !Number.isInteger(cursor.p) ||
        cursor.p < 0 ||
        cursor.p > 2147483647)
    ) {
      throw appError("invalid_cursor");
    }

    const rows = await this.prisma.resource.findMany({
      where: {
        collectionId,
        ...(cursor ? { position: { gt: cursor.p } } : {}),
      },
      orderBy: { position: "asc" },
      take: limit + 1,
    });

    const items = rows.slice(0, limit);
    const nextCursor =
      rows.length > limit ? encodeCursor({ p: items[items.length - 1].position }) : null;

    const section =
      items.length && items[0].kind !== ResourceKind.HEADING
        ? await this.prisma.resource.findFirst({
            where: {
              collectionId,
              kind: ResourceKind.HEADING,
              position: { lt: items[0].position },
            },
            orderBy: { position: "desc" },
          })
        : null;
    const context = await this.context(section ? [...items, section] : items);
    return {
      items: await Promise.all(items.map((item) => this.resourceView(item, viewer, context))),
      meta: {
        limit,
        nextCursor,
        ...(section ? { section: this.toPublicResource(section, context) } : {}),
      },
    };
  }

  async getOne(
    collectionId: string,
    resourceId: string,
    viewer: AuthUser | null,
    shareToken?: string,
  ): Promise<WireResource> {
    const collection = await this.requireReadableCollection(collectionId, viewer, shareToken);
    const resource = await this.prisma.resource.findFirst({
      where: { id: resourceId, collectionId, collection: { hubId: collection.hubId } },
    });
    if (!resource) throw new NotFoundException("Resource not found");
    return this.resourceView(resource, viewer, await this.context([resource]));
  }

  async update(collectionId: string, resourceId: string, user: AuthUser, dto: UpdateResourceDto) {
    const collection = await this.requireWritableCollection(collectionId, user);

    const resource = await this.prisma.resource.findFirst({
      where: { id: resourceId, collectionId },
    });
    if (!resource) {
      throw new NotFoundException("Resource not found");
    }

    if (Number(resource.version) !== dto.version) {
      throw appError("version_conflict");
    }

    if (dto.description !== undefined && resource.kind !== ResourceKind.HEADING)
      throw appError("bad_request");

    let position = resource.position;
    if (dto.position !== undefined && dto.position !== resource.position) {
      await this.ensurePositionAvailable(collectionId, dto.position, resource.id);
      position = dto.position;
    }

    const saved = await this.prisma.resource.update({
      where: { id: resource.id },
      data: {
        position,
        ...(dto.tags !== undefined
          ? { tags: { deleteMany: {}, ...(await itemTags(this.prisma, dto.tags)) } }
          : {}),
        ...(dto.description !== undefined
          ? { sectionDescription: dto.description.trim() || null }
          : {}),
        version: { increment: 1 },
      },
    });

    if (position !== resource.position) await this.requireNonemptySections(collectionId);
    await this.record(collection, user, "item.updated", saved.id);
    return this.resourceView(saved, user, await this.context([saved]));
  }

  async remove(collectionId: string, resourceId: string, user: AuthUser) {
    const collection = await this.requireWritableCollection(collectionId, user);

    const resource = await this.prisma.resource.findFirst({
      where: { id: resourceId, collectionId },
    });
    if (!resource) {
      throw new NotFoundException("Resource not found");
    }

    await this.prisma.resource.delete({ where: { id: resource.id, collectionId } });
    await this.requireNonemptySections(collectionId);
    await this.record(collection, user, "item.removed", resource.id);

    return { id: resource.id, deleted: true };
  }

  async move(collectionId: string, resourceId: string, user: AuthUser, dto: MoveResourceDto) {
    await this.requireWritableCollection(collectionId, user);
    if (
      (dto.direction !== undefined &&
        (dto.beforeId !== undefined || dto.beforeVersion !== undefined)) ||
      (dto.beforeId !== undefined) !== (dto.beforeVersion !== undefined)
    )
      throw appError("invalid_reorder");
    const rows = await this.prisma.resource.findMany({
      where: { collectionId },
      orderBy: { position: "asc" },
    });
    const start = rows.findIndex((row) => row.id === resourceId);
    if (start < 0) throw new NotFoundException("Resource not found");
    const source = rows[start];
    if (Number(source.version) !== dto.version) throw appError("version_conflict");
    const section = source.kind === ResourceKind.HEADING;
    const nextHeading = (from: number) => {
      const index = rows.findIndex((row, i) => i >= from && row.kind === ResourceKind.HEADING);
      return index < 0 ? rows.length : index;
    };
    const end = section ? nextHeading(start + 1) : start + 1;
    let destination = rows.length;
    if (dto.direction === "up") {
      destination = Math.max(0, start - 1);
      if (section) {
        while (destination > 0 && rows[destination].kind !== ResourceKind.HEADING) destination--;
      }
    } else if (dto.direction === "down") {
      destination = section ? nextHeading(end + 1) : Math.min(rows.length, end + 1);
    } else if (dto.beforeId !== undefined) {
      destination = rows.findIndex((row) => row.id === dto.beforeId);
      if (destination < 0) throw appError("invalid_reorder");
      if (Number(rows[destination].version) !== dto.beforeVersion)
        throw appError("version_conflict");
    }
    if (destination >= start && destination <= end) return { reordered: false, count: rows.length };
    const moving = rows.slice(start, end);
    const remaining = [...rows.slice(0, start), ...rows.slice(end)];
    remaining.splice(destination > end ? destination - moving.length : destination, 0, ...moving);
    return this.reorder(collectionId, user, {
      items: remaining.map((row, position) => ({
        resourceId: row.id,
        position,
        version: Number(row.version),
      })),
    });
  }

  async reorder(collectionId: string, user: AuthUser, dto: ReorderResourcesDto) {
    const collection = await this.requireWritableCollection(collectionId, user);

    const resources = await this.prisma.resource.findMany({
      where: { collectionId },
    });
    if (resources.length !== dto.items.length) {
      throw appError("invalid_reorder");
    }

    const resourceIdSet = new Set(resources.map((r) => r.id));
    const payloadIdSet = new Set(dto.items.map((item) => item.resourceId));

    if (resourceIdSet.size !== payloadIdSet.size) {
      throw appError("invalid_reorder");
    }

    for (const payloadId of payloadIdSet) {
      if (!resourceIdSet.has(payloadId)) {
        throw appError("invalid_reorder");
      }
    }

    const positions = dto.items.map((item) => item.position).sort((a, b) => a - b);
    for (let i = 0; i < positions.length; i += 1) {
      if (positions[i] !== i) {
        throw appError("invalid_reorder");
      }
    }

    const byId = new Map(resources.map((r) => [r.id, r]));
    for (const item of dto.items) {
      const resource = byId.get(item.resourceId);
      if (!resource) {
        throw appError("invalid_reorder");
      }
      if (Number(resource.version) !== item.version) {
        throw appError("version_conflict");
      }
    }

    await this.prisma.$transaction(async (tx) => {
      // Avoid transient unique conflicts on (collection_id, position) by
      // writing temporary positions first, then final positions.
      // Temporary slots must avoid both all existing positions and final slots.
      // A fixed offset can overlap sparse positions supplied by imports/API clients.
      const occupied = new Set(resources.map((row) => row.position));
      let temporary = resources.length;
      for (const item of dto.items) {
        while (occupied.has(temporary)) temporary++;
        await tx.resource.updateMany({
          where: { id: item.resourceId, collectionId },
          data: { position: temporary++ },
        });
      }
      for (const item of dto.items) {
        await tx.resource.updateMany({
          where: { id: item.resourceId, collectionId },
          data: { position: item.position, version: { increment: 1 } },
        });
      }
    });

    await this.requireNonemptySections(collectionId);
    await this.record(collection, user, "items.reordered");
    return { reordered: true, count: dto.items.length };
  }

  private assertSectionOrder(rows: Array<{ kind: string }>) {
    if (
      rows.some(
        (row, index) =>
          row.kind === ResourceKind.HEADING &&
          (!rows[index + 1] || rows[index + 1].kind === ResourceKind.HEADING),
      )
    )
      throw appError("section_empty");
  }

  private async requireNonemptySections(collectionId: string) {
    this.assertSectionOrder(
      await this.prisma.resource.findMany({
        where: { collectionId },
        orderBy: { position: "asc" },
        select: { kind: true },
      }),
    );
  }

  private async requireWritableCollection(
    collectionId: string,
    user: AuthUser,
  ): Promise<Collection> {
    const collection = await this.prisma.collection.findUnique({
      where: { id: collectionId },
    });
    if (!collection) {
      throw new NotFoundException("Collection not found");
    }
    // Content write: hub owners and direct-share contributors.
    await this.policy.requireWriteContent(collection, user);
    return collection;
  }

  private async requireReadableCollection(
    collectionId: string,
    viewer: AuthUser | null,
    shareToken: string | undefined,
  ): Promise<Collection> {
    const collection = await this.prisma.collection.findUnique({
      where: { id: collectionId },
    });
    if (!collection) {
      throw new NotFoundException("Collection not found");
    }
    const access = await this.policy.requireRead(collection, viewer, shareToken);
    if (access.viaLinkToken && viewer) {
      await this.policy.recordLinkAccess(collection.id, viewer.userId);
    }
    return collection;
  }

  private async ensurePositionAvailable(
    collectionId: string,
    position: number,
    ignoreResourceId?: string,
  ) {
    const existing = await this.prisma.resource.findUnique({
      where: { collectionId_position: { collectionId, position } },
      select: { id: true },
    });
    if (existing && existing.id !== ignoreResourceId) {
      throw appError("position_conflict");
    }
  }

  // Link metadata and the people who added the items, for one page of items.
  private async context(items: Resource[]): Promise<ItemContext> {
    const [metadata, people, taggedItems] = await Promise.all([
      readLinkMetadata(this.prisma, linkUrls(items)),
      personRefs(
        this.prisma,
        items.map((item) => item.addedByUserId),
      ),
      this.prisma.resource.findMany({
        where: { OR: items.map(({ id, collectionId }) => ({ id, collectionId })) },
        select: {
          id: true,
          tags: { orderBy: { position: "asc" }, select: { tag: { select: { name: true } } } },
        },
      }),
    ]);
    return {
      metadata,
      people,
      tags: new Map(taggedItems.map((item) => [item.id, item.tags.map(({ tag }) => tag.name)])),
    };
  }

  private async resourceView(
    resource: Resource,
    viewer: AuthUser | null,
    context: ItemContext,
  ): Promise<WireResource> {
    const base = this.toPublicResource(resource, context);
    if (resource.kind !== ResourceKind.COLLECTION_LINK) return base;
    const target = resource.linkedCollectionId
      ? await this.prisma.collection.findUnique({ where: { id: resource.linkedCollectionId } })
      : null;
    const readable = target && (await this.policy.resolve(target, viewer)).canRead;
    // Never forward the containing collection's share token or expose unreadable
    // metadata: an unreadable target's id and any stored title (which may have
    // been copied from it) stay out of the response.
    if (!readable)
      return { ...base, linkedCollectionId: null, title: null, linkedCollection: null };
    return {
      ...base,
      title: target.title,
      linkedCollection: { id: target.id, title: target.title },
    };
  }

  // A link's title, description and site name come from its page metadata; a
  // section's title is its text; a reference's title is its target's (above).
  private toPublicResource(resource: Resource, context: ItemContext): WireResource {
    const link = resource.kind === ResourceKind.EXTERNAL_LINK;
    const meta = metadataFor(context.metadata, resource.url);
    return {
      id: resource.id,
      collectionId: resource.collectionId,
      kind: wireToken(resource.kind, ["external_link", "collection_link", "heading"]),
      url: resource.url ?? undefined,
      linkedCollectionId: resource.linkedCollectionId,
      title: link
        ? meta.title
        : resource.kind === ResourceKind.HEADING
          ? resource.titleOverride
          : null,
      description: link
        ? meta.description
        : resource.kind === ResourceKind.HEADING
          ? resource.sectionDescription
          : null,
      siteName: link ? meta.siteName : null,
      addedBy: (resource.addedByUserId && context.people.get(resource.addedByUserId)) || null,
      tags: context.tags.get(resource.id) ?? [],
      position: resource.position,
      version: Number(resource.version),
      createdAt: resource.createdAt.toISOString(),
      updatedAt: resource.updatedAt.toISOString(),
    };
  }
}

interface ItemContext {
  tags: Map<string, string[]>;
  metadata: Map<string, LinkMeta>;
  people: Map<string, PersonRef>;
}

function linkUrls(items: Resource[]) {
  return items
    .filter((item) => item.kind === ResourceKind.EXTERNAL_LINK && item.url)
    .map((item) => item.url as string);
}
