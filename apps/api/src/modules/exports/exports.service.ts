import { publicOrigins } from "@linkhub/config/public-origins";
import { Injectable, NotFoundException } from "@nestjs/common";
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
    const access = await this.policy.resolveMany(collections, user);
    for (const id of ids) {
      const collection = byId.get(id);
      if (!collection) {
        throw new NotFoundException(`Collection not found: ${id}`);
      }
      if (!access.get(id)?.canRead) throw new NotFoundException("Collection not found");
    }

    const expand = dto.expand ?? false;
    const extension = EXPORT_FILE_EXTENSIONS[dto.format];
    const files: Array<{ name: string; body: Buffer }> = [];

    for (const id of ids) {
      const collection = byId.get(id) as Collection;
      const document = await this.buildDocument(collection, expand, user);
      const body = await this.render(dto.format, document);
      files.push({ name: `${collection.id}.${extension}`, body });
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

  private inlineItem(
    resource: Resource,
    titles: Map<string, string>,
    references: Map<string, Collection>,
  ): ExportInline {
    if (resource.kind === ResourceKind.HEADING)
      return {
        kind: "heading",
        title: resource.titleOverride ?? "Untitled heading",
        description: resource.sectionDescription ?? undefined,
      };
    if (resource.kind !== ResourceKind.COLLECTION_LINK) return this.toLink(resource, titles);
    const target = references.get(resource.id);
    if (!target)
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
    const references = await this.policy.readableReferences(resources, user);
    const expandedIds = expand
      ? [
          ...new Set(
            [...references.values()]
              .filter((target) => target.id !== collection.id)
              .map((target) => target.id),
          ),
        ]
      : [];
    const entries = expandedIds.length
      ? await this.prisma.resource.findMany({
          where: { collectionId: { in: expandedIds } },
          orderBy: { position: "asc" },
        })
      : [];
    const entryReferences = await this.policy.readableReferences(entries, user);
    const titles = await this.linkTitles([...resources, ...entries]);
    const byCollection = new Map<string, Resource[]>();
    for (const entry of entries) {
      const group = byCollection.get(entry.collectionId) ?? [];
      group.push(entry);
      byCollection.set(entry.collectionId, group);
    }
    const items: ExportItem[] = resources.map((resource) => {
      const target = references.get(resource.id);
      if (expand && target && target.id !== collection.id)
        return {
          kind: "section",
          title: target.title,
          description: target.description ?? undefined,
          links: (byCollection.get(target.id) ?? []).map((entry) =>
            this.inlineItem(entry, titles, entryReferences),
          ),
        };
      return this.inlineItem(resource, titles, references);
    });
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
}
