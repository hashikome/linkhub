import { createHash, randomUUID } from "node:crypto";
import { Injectable } from "@nestjs/common";
import type { CaptureResult } from "@nslinkhub/types";
import { isUUID } from "class-validator";
import { appError } from "../../common/errors/app-exception";
import { AuthUser } from "../../common/interfaces/auth-user.interface";
import { normalizeTags } from "../../common/utils/tags.util";
import { publicLinkUrl } from "../../common/utils/url.util";
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
      const url = publicLinkUrl(parsed.href);
      if (links.some((entry) => entry.url === url)) continue;
      links.push({ url, tags: normalizeTags(link.tags) });
    }
    if (!["first", "new"].includes(dto.destination) && !isUUID(dto.destination))
      throw appError("bad_request");
    const name = dto.collectionTitle?.trim() || null;
    const hub = await ensurePersonalHub(this.prisma, user.userId);
    const fingerprint = createHash("sha256")
      .update(JSON.stringify([links, dto.destination, name]))
      .digest("hex");
    const receipt = await this.prisma.captureReceipt.findUnique({
      where: { userId_operationId: { userId: user.userId, operationId: dto.operationId } },
    });
    if (receipt) {
      if (receipt.fingerprint !== fingerprint) throw appError("conflict");
      const collection = await this.prisma.collection.findFirst({
        where: { id: receipt.collectionId, hubId: hub.id },
      });
      if (!collection) throw appError("not_found");
      await this.policy.requireWriteContent(collection, user);
      const saved = await this.prisma.resource.findMany({
        where: { collectionId: collection.id, url: { in: links.map((link) => link.url) } },
        select: { id: true, url: true },
      });
      const ids = links.map((link) => saved.find((row) => row.url === link.url)?.id);
      if (ids.some((id) => !id)) throw appError("not_found");
      return { collectionId: collection.id, resourceIds: ids as string[] };
    }
    let id = isUUID(dto.destination) ? dto.destination : null;
    if (dto.destination === "first") {
      if (hub.firstCaptureCollectionId) {
        const first = await this.prisma.collection.findFirst({
          where: {
            id: hub.firstCaptureCollectionId,
            hubId: hub.id,
            published: false,
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
      const collection = await this.collections.create(user, {
        title: name ?? (await this.defaultTitle(hub.id)),
        slug: `links-${randomUUID()}`,
        published: false,
      });
      id = collection.id;
      if (dto.destination === "first")
        await this.prisma.hub.update({
          where: { id: hub.id },
          data: { firstCaptureCollectionId: id },
        });
    }
    const collection = await this.prisma.collection.findFirst({ where: { id, hubId: hub.id } });
    if (!collection) throw appError("not_found");
    await this.policy.requireWriteContent(collection, user);
    const last = await this.prisma.resource.aggregate({
      where: { collectionId: id },
      _max: { position: true },
    });
    let position = (last._max.position ?? -1) + 1;
    // A link already in the collection is kept as it is, not duplicated.
    const existing = await this.prisma.resource.findMany({
      where: { collectionId: id, url: { in: links.map((link) => link.url) } },
      select: { id: true, url: true },
    });
    const resourceIds: string[] = [];
    for (const link of links)
      resourceIds.push(
        existing.find((row) => row.url === link.url)?.id ??
          (await this.resources.insertExternal(collection, user, link.url, link.tags, position++))
            .id,
      );
    await this.prisma.captureReceipt.create({
      data: { userId: user.userId, operationId: dto.operationId, collectionId: id, fingerprint },
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
