import { Injectable, NotFoundException } from "@nestjs/common";
import { publicOrigins } from "@nslinkhub/config/public-origins";
import { zipSync } from "fflate";
import { ResourceKind } from "src/common/enums/resource-kind.enum";
import { AuthUser } from "src/common/interfaces/auth-user.interface";
import { PrismaService } from "src/database/prisma.service";
import { Collection, Resource } from "src/generated/prisma/client";
import { CollectionPolicyService } from "../hubs/collection-policy.service";
import { CreateExportDto } from "./dto/create-export.dto";
import {
  EXPORT_CONTENT_TYPES,
  EXPORT_FILE_EXTENSIONS,
  ExportDocument,
  ExportFormat,
  ExportInline,
  ExportItem,
  ExportLink,
} from "./export-document";
import { renderDocx } from "./renderers/docx.renderer";
import { renderMarkdown } from "./renderers/markdown.renderer";
import { renderPdf } from "./renderers/pdf.renderer";

export interface ExportFile {
  filename: string;
  contentType: string;
  body: Buffer;
}

// Export is synchronous: authorize every collection, build one document per
// collection, render the requested format, and hand the file back in the same
// response. One collection returns the file itself; several return a zip.
// Rendering is programmatic (pdfkit/docx/markdown) — milliseconds even for
// large collections — so there is no queue, no job table, and no artifact
// storage to clean up.
@Injectable()
export class ExportsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly policy: CollectionPolicyService,
  ) {}

  async export(user: AuthUser, dto: CreateExportDto): Promise<ExportFile> {
    const ids = [...new Set(dto.collectionIds)];
    const collections = await this.prisma.collection.findMany({ where: { id: { in: ids } } });
    const byId = new Map(collections.map((collection) => [collection.id, collection]));

    // Authorize everything up front; the whole request fails before any
    // rendering if a single collection is missing or unreadable.
    for (const id of ids) {
      const collection = byId.get(id);
      if (!collection) {
        throw new NotFoundException(`Collection not found: ${id}`);
      }
      await this.policy.requireRead(collection, user);
    }

    const expand = dto.expand ?? false;
    const extension = EXPORT_FILE_EXTENSIONS[dto.format];
    const files: Array<{ name: string; body: Buffer }> = [];
    const usedNames = new Set<string>();

    for (const id of ids) {
      const collection = byId.get(id) as Collection;
      const document = await this.buildDocument(collection, expand, user);
      const body = await this.render(dto.format, document);
      files.push({ name: this.uniqueName(usedNames, collection.slug, extension), body });
    }

    if (files.length === 1) {
      return {
        filename: files[0].name,
        contentType: EXPORT_CONTENT_TYPES[dto.format],
        body: files[0].body,
      };
    }

    const zipped = zipSync(
      Object.fromEntries(files.map((file) => [file.name, new Uint8Array(file.body)])),
    );
    const stamp = new Date().toISOString().slice(0, 10);
    return {
      filename: `collections-export-${stamp}.zip`,
      contentType: "application/zip",
      body: Buffer.from(zipped),
    };
  }

  private collectionUrl(id: string): string {
    return new URL(`/c/${id}`, publicOrigins(process.env).webOrigin).href;
  }

  // Stored page titles for links (read-only: an export never requests lookups).
  private async linkTitles(resources: Resource[]) {
    const urls = resources.filter((r) => r.kind === ResourceKind.EXTERNAL_LINK && r.url);
    const rows = urls.length
      ? await this.prisma.linkMetadata.findMany({
          where: { url: { in: urls.map((r) => r.url as string) }, title: { not: null } },
          select: { url: true, title: true },
        })
      : [];
    return new Map(rows.map((row) => [row.url, row.title as string]));
  }

  private async inlineItem(
    resource: Resource,
    user: AuthUser,
    titles: Map<string, string>,
  ): Promise<ExportInline> {
    if (resource.kind === ResourceKind.HEADING)
      return {
        kind: "heading",
        title: resource.titleOverride ?? "Untitled heading",
        description: resource.sectionDescription ?? undefined,
      };
    if (resource.kind !== ResourceKind.COLLECTION_LINK) return this.toLink(resource, titles);
    const target = resource.linkedCollectionId
      ? await this.prisma.collection.findUnique({ where: { id: resource.linkedCollectionId } })
      : null;
    if (!target || !(await this.policy.resolve(target, user)).canRead)
      return { kind: "notice", title: "Collection unavailable — not included in this export." };
    return { kind: "link", title: target.title, url: this.collectionUrl(target.id) };
  }

  // Expansion is explicit and bounded to one reference level. Cycles and deeper
  // references remain links. Never use the root's authority for a destination.
  private async buildDocument(
    collection: Collection,
    expand: boolean,
    user: AuthUser,
  ): Promise<ExportDocument> {
    const resources = await this.prisma.resource.findMany({
      where: { collectionId: collection.id },
      orderBy: { position: "asc" },
    });
    const titles = await this.linkTitles(resources);
    const items: ExportItem[] = [];
    for (const resource of resources) {
      if (
        expand &&
        resource.kind === ResourceKind.COLLECTION_LINK &&
        resource.linkedCollectionId &&
        resource.linkedCollectionId !== collection.id
      ) {
        const target = await this.prisma.collection.findUnique({
          where: { id: resource.linkedCollectionId },
        });
        if (target && (await this.policy.resolve(target, user)).canRead) {
          const entries = await this.prisma.resource.findMany({
            where: { collectionId: target.id },
            orderBy: { position: "asc" },
          });
          const entryTitles = await this.linkTitles(entries);
          items.push({
            kind: "section",
            title: target.title,
            description: target.description ?? undefined,
            links: await Promise.all(
              entries.map((entry) => this.inlineItem(entry, user, entryTitles)),
            ),
          });
          continue;
        }
      }
      items.push(await this.inlineItem(resource, user, titles));
    }
    return { title: collection.title, description: collection.description ?? undefined, items };
  }

  private toLink(resource: Resource, titles: Map<string, string>): ExportLink {
    const url = resource.url ?? "";
    return { kind: "link", title: titles.get(url) ?? (url || "Untitled"), url };
  }

  private render(format: ExportFormat, document: ExportDocument): Promise<Buffer> {
    switch (format) {
      case "markdown":
        return Promise.resolve(renderMarkdown(document));
      case "pdf":
        return renderPdf(document);
      case "docx":
        return renderDocx(document);
    }
  }

  // Slugs are unique per hub, but an export can span hubs (shared/published
  // collections), so zip entry names still need dedup.
  private uniqueName(used: Set<string>, slug: string, extension: string): string {
    let name = `${slug}.${extension}`;
    let counter = 2;
    while (used.has(name)) {
      name = `${slug}-${counter}.${extension}`;
      counter += 1;
    }
    used.add(name);
    return name;
  }
}
