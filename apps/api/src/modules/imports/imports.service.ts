import { Injectable, NotFoundException } from "@nestjs/common";
import { isPublicLinkHost } from "@nslinkhub/types";
import { ResourceKind } from "src/common/enums/resource-kind.enum";
import { AuthUser } from "src/common/interfaces/auth-user.interface";
import { canonicalizeUrl } from "src/common/utils/url.util";
import { PrismaService } from "src/database/prisma.service";
import type { Collection, Prisma } from "src/generated/prisma/client";
import { recordAudit } from "../../common/audit";
import { appError } from "../../common/errors/app-exception";
import { CollectionPolicyService } from "../hubs/collection-policy.service";
import { HubsService } from "../hubs/hubs.service";
import { requestLinkMetadata } from "../resources/link-metadata";
import { ImportTargetDto } from "./dto/import-target.dto";

const MAX_IMPORT_SIZE_BYTES = 10 * 1024 * 1024;

@Injectable()
export class ImportsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly hubs: HubsService,
    private readonly policy: CollectionPolicyService,
  ) {}

  async importCsv(user: AuthUser, file: unknown, dto: ImportTargetDto) {
    const collection = await this.resolveTargetCollection(user, dto);
    this.ensureValidFile(file);

    const text = file.buffer.toString("utf8");
    const lines = text.split(/\r?\n/).filter((line) => line.trim().length > 0);
    if (lines.length === 0) {
      throw appError("invalid_import");
    }

    const headers = lines[0].split(",").map((header) => header.trim().toLowerCase());
    // Only the address is read; any other column (a title, a note) is a hint
    // for whoever reads the file. Titles always come from the page.
    const urlIdx = headers.indexOf("url");

    if (urlIdx < 0) {
      throw appError("invalid_import");
    }

    const rows = lines.slice(1);
    return this.ingestRows(
      collection,
      user,
      rows.map((row, index) => ({
        index: index + 2,
        url: row.split(",").map((column) => column.trim())[urlIdx] ?? "",
      })),
    );
  }

  async importBookmarksHtml(user: AuthUser, file: unknown, dto: ImportTargetDto) {
    const collection = await this.resolveTargetCollection(user, dto);
    this.ensureValidFile(file);

    const text = file.buffer.toString("utf8");
    const linkRegex = /<A\s+[^>]*HREF="([^"]+)"[^>]*>(.*?)<\/A>/gi;
    const rows: Array<{ index: number; url: string }> = [];

    let i = 1;
    let match = linkRegex.exec(text);
    while (match !== null) {
      rows.push({ index: i, url: match[1] });
      i += 1;
      match = linkRegex.exec(text);
    }

    return this.ingestRows(collection, user, rows);
  }

  private async ingestRows(
    collection: Pick<Collection, "id" | "hubId">,
    user: AuthUser,
    rows: Array<{ index: number; url: string }>,
  ) {
    const collectionId = collection.id;
    const existingResources = await this.prisma.resource.findMany({
      where: { collectionId },
      select: { position: true, url: true },
    });

    const maxPosition = existingResources.reduce(
      (max, resource) => Math.max(max, resource.position),
      -1,
    );
    let nextPosition = maxPosition + 1;
    const existingUrls = new Set(
      existingResources.map((resource) => resource.url).filter(Boolean) as string[],
    );

    let importedCount = 0;
    let skippedCount = 0;
    const errors: Array<{ row: number; reason: string; value: string }> = [];

    for (const row of rows) {
      try {
        // Same address limit as Save a link (and within the metadata index).
        if (row.url.length > 2048) {
          errors.push({ row: row.index, reason: "url_too_long", value: row.url.slice(0, 128) });
          continue;
        }
        const url = canonicalizeUrl(row.url);
        if (!isPublicLinkHost(new URL(url).hostname)) {
          errors.push({ row: row.index, reason: "not_public_url", value: row.url.slice(0, 128) });
          continue;
        }

        if (existingUrls.has(url)) {
          skippedCount += 1;
          continue;
        }

        // A source title is ignored: titles come from the page (ADR-0012), so a
        // lookup is requested with the link in the same savepoint.
        await this.prisma.withSavepoint(async (tx) => {
          await tx.resource.create({
            data: {
              collectionId,
              kind: ResourceKind.EXTERNAL_LINK,
              url,
              position: nextPosition,
              addedByUserId: user.userId,
            },
          });
          await requestLinkMetadata(tx, [url]);
        });

        existingUrls.add(url);
        importedCount += 1;
        nextPosition += 1;
      } catch {
        errors.push({
          row: row.index,
          reason: "invalid_or_unsupported_url",
          value: row.url.slice(0, 128),
        });
      }
    }

    if (importedCount)
      await recordAudit(this.prisma as unknown as Prisma.TransactionClient, {
        hubId: collection.hubId,
        actorUserId: user.userId,
        collectionId,
        action: "items.imported",
      });
    return {
      totalRows: rows.length,
      processedRows: rows.length,
      importedCount,
      skippedCount,
      errorCount: errors.length,
      errors,
    };
  }

  private ensureValidFile(file: unknown): asserts file is { buffer: Buffer; size: number } {
    if (!file) {
      throw appError("invalid_import");
    }
    const candidate = file as { buffer?: Buffer; size?: number };
    if (!candidate.buffer || typeof candidate.size !== "number") {
      throw appError("invalid_import");
    }
    if (candidate.size > MAX_IMPORT_SIZE_BYTES) {
      throw appError("payload_too_large");
    }
  }

  private async resolveTargetCollection(user: AuthUser, dto: ImportTargetDto) {
    if (dto.targetCollectionId) {
      const collection = await this.prisma.collection.findUnique({
        where: { id: dto.targetCollectionId },
      });
      if (!collection) {
        throw new NotFoundException("Target collection not found");
      }
      // Bulk imports are owner management, not ordinary contribution.
      await this.policy.requireManage(collection, user);
      return collection;
    }

    if (!dto.createCollection) {
      throw appError("invalid_import");
    }
    if (!dto.collectionTitle || !dto.collectionSlug) {
      throw appError("invalid_import");
    }

    const hubId = await this.hubs.getUserHubId(user.userId);
    if (!hubId) {
      throw appError("hub_unavailable");
    }

    return this.prisma.collection.create({
      data: {
        hubId,
        title: dto.collectionTitle,
        slug: dto.collectionSlug,
      },
    });
  }
}
