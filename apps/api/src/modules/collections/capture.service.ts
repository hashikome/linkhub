import { createHash } from "node:crypto";
import type { CaptureResult } from "@linkhub/types";
import { Injectable } from "@nestjs/common";
import { isUUID } from "class-validator";
import { appError } from "../../common/errors/app-exception";
import { AuthUser } from "../../common/interfaces/auth-user.interface";
import { normalizeTags } from "../../common/utils/tags.util";
import { canonicalizeUrl, savableLinkUrl } from "../../common/utils/url.util";
import { PrismaService } from "../../database/prisma.service";
import { CollectionPolicyService } from "../hubs/collection-policy.service";
import { ensurePersonalHub } from "../hubs/hub-onboarding";
import { ResourcesService } from "../resources/resources.service";
import { CollectionsService } from "./collections.service";
import { CaptureDto } from "./dto/capture.dto";

@Injectable()
export class CaptureService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly policy: CollectionPolicyService,
    private readonly collections: CollectionsService,
    private readonly resources: ResourcesService,
  ) {}

  // Runs inside the request's authority transaction (AuthorityInterceptor).
  async save(user: AuthUser, dto: CaptureDto): Promise<CaptureResult> {
    // Validate and canonicalise every link; repeats within one save collapse.
    // Titles are never input: they are resolved from the page after saving.
    const links: { url: string; tags: string[] }[] = [];
    for (const link of dto.links) {
      const parsed = new URL(link.url);
      if (
        !["http:", "https:"].includes(parsed.protocol) ||
        parsed.username ||
        parsed.password ||
        parsed.href.length > 2048
      )
        throw appError("bad_request");
      const url = canonicalizeUrl(parsed.href);
      if (links.some((entry) => entry.url === url)) continue;
      links.push({ url, tags: normalizeTags(link.tags) });
    }
    if (!["first", "new"].includes(dto.destination) && !isUUID(dto.destination))
      throw appError("bad_request");
    const name = dto.collectionTitle?.trim() || null;
    const fingerprint = createHash("sha256")
      .update(
        JSON.stringify([
          links,
          dto.destination,
          name,
          ...(!isUUID(dto.destination) && dto.published === false ? [false] : []),
        ]),
      )
      .digest("hex");
    const receipt = await this.prisma.captureReceipt.findUnique({
      where: { userId_operationId: { userId: user.userId, operationId: dto.operationId } },
    });
    if (receipt) {
      if (receipt.fingerprint !== fingerprint) throw appError("conflict");
      const collection = await this.prisma.collection.findFirst({
        where: { id: receipt.collectionId },
      });
      if (!collection) throw appError("not_found");
      await this.policy.requireRead(collection, user);
      await this.policy.requireWriteContent(collection, user);
      let ids = receipt.resourceIds;
      if (!ids.length) {
        // Pre-migration receipts have no saved IDs. Upgrade them on the first
        // resolvable retry; new receipts never depend on mutable aliases.
        const resolved = await Promise.all(
          links.map(async (link) => {
            const target = await this.resources.collectionAtUrl(link.url);
            return (
              await this.prisma.resource.findFirst({
                where: {
                  collectionId: collection.id,
                  OR: [{ url: link.url }, ...(target ? [{ linkedCollectionId: target.id }] : [])],
                },
              })
            )?.id;
          }),
        );
        if (resolved.some((id) => !id)) throw appError("not_found");
        ids = [...new Set(resolved)] as string[];
        await this.prisma.captureReceipt.update({
          where: { userId_operationId: { userId: user.userId, operationId: dto.operationId } },
          data: { resourceIds: ids },
        });
      }
      const saved = await this.prisma.resource.count({
        where: { collectionId: collection.id, id: { in: ids } },
      });
      if (saved !== ids.length) throw appError("not_found");
      return { collectionId: collection.id, resourceIds: ids };
    }
    // Completed operations replay their immutable saved IDs even if an old URL
    // shape has since been retired. Only new saves validate current address rules.
    for (const link of links) savableLinkUrl(link.url);
    const hub = isUUID(dto.destination) ? null : await ensurePersonalHub(this.prisma, user.userId);
    let id = isUUID(dto.destination) ? dto.destination : null;
    if (dto.destination === "first" && hub) {
      if (hub.firstCaptureCollectionId) {
        const first = await this.prisma.collection.findFirst({
          where: {
            id: hub.firstCaptureCollectionId,
            hubId: hub.id,
            published: dto.published ?? true,
            linkSharingEnabled: false,
            shares: { none: {} },
          },
        });
        if (!first || first.createdAt.getTime() < dto.startedAt)
          throw appError("capture_destination_required");
        id = first.id;
      } else if (await this.prisma.collection.count({ where: { hubId: hub.id } }))
        throw appError("capture_destination_required");
    }
    if (!id) {
      if (!hub) throw appError("bad_request");
      const collection = await this.collections.create(user, {
        title: name ?? (await this.defaultTitle(hub.id)),
        published: dto.published ?? true,
      });
      id = collection.id;
      if (dto.destination === "first" && hub)
        await this.prisma.hub.update({
          where: { id: hub.id },
          data: { firstCaptureCollectionId: id },
        });
    }
    const collection = await this.prisma.collection.findUnique({ where: { id } });
    if (!collection) throw appError("not_found");
    await this.policy.requireRead(collection, user);
    await this.policy.requireWriteContent(collection, user);
    const last = await this.prisma.resource.aggregate({
      where: { collectionId: id },
      _max: { position: true },
    });
    let position = (last._max.position ?? -1) + 1;
    // A link already in the collection is kept as it is, not duplicated.
    const resourceIds: string[] = [];
    for (const link of links) {
      const linkedCollectionId = await this.resources.referenceTarget(collection, user, link.url);
      const existing = await this.prisma.resource.findFirst({
        where: {
          collectionId: id,
          OR: [{ url: link.url }, ...(linkedCollectionId ? [{ linkedCollectionId }] : [])],
        },
      });
      const saved =
        existing ??
        (await this.resources.insertLink(collection, user, link.url, link.tags, position++));
      if (!resourceIds.includes(saved.id)) resourceIds.push(saved.id);
    }
    await this.prisma.captureReceipt.create({
      data: {
        userId: user.userId,
        operationId: dto.operationId,
        collectionId: id,
        fingerprint,
        resourceIds,
      },
    });
    return { collectionId: id, resourceIds };
  }

  // "Saved links, Oct 7", then "Saved links, Oct 7 (2)" … so a default name
  // never repeats one already in the hub. Names people type may repeat.
  private async defaultTitle(hubId: string) {
    const base = `Saved links, ${new Intl.DateTimeFormat("en", { month: "short", day: "numeric", timeZone: "UTC" }).format(new Date())}`;
    const taken = new Set(
      (
        await this.prisma.collection.findMany({
          where: { hubId, title: { startsWith: base } },
          select: { title: true },
        })
      ).map((row) => row.title),
    );
    if (!taken.has(base)) return base;
    for (let n = 2; ; n++) if (!taken.has(`${base} (${n})`)) return `${base} (${n})`;
  }
}
