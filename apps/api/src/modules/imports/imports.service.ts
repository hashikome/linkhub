import { Injectable } from "@nestjs/common";
import type { ImportCommitResult } from "@ntumie/types";
import { appError } from "../../common/errors/app-exception";
import { AuthUser } from "../../common/interfaces/auth-user.interface";
import { decodeCursor, encodeCursor } from "../../common/utils/cursor.util";
import { normalizeTags } from "../../common/utils/tags.util";
import { PrismaService } from "../../database/prisma.service";
import type { ImportFolder } from "../../generated/prisma/client";
import { CollectionsService } from "../collections/collections.service";
import { CollectionPolicyService } from "../hubs/collection-policy.service";
import { requestLinkMetadata } from "../resources/link-metadata";
import { ResourcesService } from "../resources/resources.service";
import {
  CreateImportDto,
  ImportCollectionDto,
  ImportDestinationDto,
  ImportQueueDto,
  ImportRevisionDto,
  ImportRowDto,
  ImportRowsQuery,
  ImportSelectionDto,
} from "./dto/import-draft.dto";
import { IMPORT_BYTES, IMPORT_ROWS, importAddress, parseImport } from "./import-parser";
import { destination, importState, type LoadedDraft } from "./import-state";

const expiry = () => new Date(Date.now() + 30 * 86400_000);
export const IMPORT_COMMIT_BATCH = 100;
export const IMPORT_LOOKUPS_PER_DAY = IMPORT_ROWS * 3;
@Injectable()
export class ImportsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly policy: CollectionPolicyService,
    private readonly collections: CollectionsService,
    private readonly resources: ResourcesService,
  ) {}

  async create(user: AuthUser, dto: CreateImportDto, file?: { buffer: Buffer; size: number }) {
    const hub = await this.prisma.hub.findUnique({ where: { ownerUserId: user.userId } });
    if (!hub) throw appError("hub_unavailable");
    if (
      (await this.prisma.importDraft.count({
        where: { userId: user.userId, closed: false, expiresAt: { gt: new Date() } },
      })) >= 3
    )
      throw appError("too_many_requests");
    if (!file?.size) throw appError("invalid_import");
    if (!Buffer.isBuffer(file.buffer) || file.size > IMPORT_BYTES)
      throw appError("payload_too_large");
    const parsed = parseImport(dto.sourceKind, file.buffer.toString("utf8"));
    const draft = await this.prisma.importDraft.create({
      data: { userId: user.userId, hubId: hub.id, sourceKind: dto.sourceKind, expiresAt: expiry() },
    });
    const folders: ImportFolder[] = [];
    for (const [position, f] of parsed.folders.entries())
      folders.push(
        await this.prisma.importFolder.create({
          data: {
            draftId: draft.id,
            parentId: f.parent === null ? null : folders[f.parent].id,
            name: f.name,
            path: f.path,
            position,
            mode: f.mode ?? (position === 0 ? "collection" : "section"),
            newTitle: f.name,
          },
        }),
      );
    const rows = parsed.rows.map((r, position) => ({
      draftId: draft.id,
      folderId: folders[r.folder].id,
      position,
      address: r.address,
      tags: r.tags,
      sourceLocation: r.sourceLocation,
      ...importAddress(r.address),
    }));
    await this.prisma.importRow.createMany({ data: rows });
    await this.enqueue(
      user,
      rows.flatMap((r) => (r.url ? [r.url] : [])),
    );
    return this.read(user, draft.id);
  }
  async list(user: AuthUser) {
    const drafts = await this.prisma.importDraft.findMany({
      where: {
        userId: user.userId,
        expiresAt: { gt: new Date() },
        hub: { ownerUserId: user.userId },
      },
      include: {
        folders: { orderBy: { position: "asc" } },
        rows: { orderBy: { position: "asc" } },
      },
      orderBy: [{ closed: "asc" }, { createdAt: "desc" }],
      take: 23,
    });
    return Promise.all(drafts.map(async (d) => (await importState(this.prisma, d)).view));
  }
  async read(user: AuthUser, id: string) {
    return (await importState(this.prisma, await this.load(user, id))).view;
  }
  async rows(user: AuthUser, id: string, query: ImportRowsQuery) {
    const draft = await this.load(user, id);
    const cursor = query.cursor ? decodeCursor<{ p: number; id: string }>(query.cursor) : null;
    if (
      query.cursor &&
      (!cursor || cursor.id !== id || !Number.isInteger(cursor.p) || cursor.p < 0)
    )
      throw appError("invalid_cursor");
    const { rows, view } = await importState(this.prisma, draft);
    if (query.collectionId && !view.collections.some((c) => c.id === query.collectionId))
      throw appError("not_found");
    const matching = rows.filter(
      (r) =>
        (!query.status || r.status === query.status) &&
        (!query.collectionId || r.collectionKey === query.collectionId) &&
        r.position > (cursor?.p ?? -1),
    );
    const limit = query.limit ?? 50,
      items = matching.slice(0, limit);
    return {
      data: items,
      meta: {
        limit,
        nextCursor:
          matching.length > limit
            ? encodeCursor({ id, p: items[items.length - 1].position })
            : null,
      },
    };
  }
  async collection(user: AuthUser, id: string, collectionId: string) {
    const view = await this.read(user, id);
    const collection = view.collections.find((c) => c.id === collectionId);
    if (!collection) throw appError("not_found");
    return { ...view, collectionId, collectionTitle: collection.title, counts: collection.counts };
  }
  async updateCollection(
    user: AuthUser,
    id: string,
    collectionId: string,
    dto: ImportCollectionDto,
  ) {
    const draft = await this.load(user, id, dto.version);
    const folder = draft.folders.find(
      (f) => f.id === collectionId && f.mode === "collection" && f.jobState !== "discarded",
    );
    if (!folder) throw appError("not_found");
    this.requireEditable(draft, collectionId);
    if (folder.targetCollectionId) throw appError("conflict");
    await this.prisma.importFolder.update({
      where: { id: collectionId },
      data: { published: dto.published },
    });
    await this.touch(draft);
    return this.collection(user, id, collectionId);
  }
  async queueCollection(user: AuthUser, id: string, collectionId: string, dto: ImportQueueDto) {
    const draft = await this.load(user, id);
    const folder = draft.folders.find(
      (f) => f.id === collectionId && f.mode === "collection" && f.jobState !== "discarded",
    );
    if (!folder) throw appError("not_found");
    // Retrying a submitted queue command must not schedule a second job.
    if (["queued", "running"].includes(folder.jobState))
      return this.collection(user, id, collectionId);
    if (draft.closed || draft.version !== dto.version) throw appError("version_conflict");
    const { rows } = await importState(this.prisma, draft);
    const ready = rows.filter((r) => r.collectionKey === collectionId && r.status === "ready");
    if (!ready.length || !folder.newTitle.trim()) throw appError("invalid_import");
    await this.prisma.importFolder.update({
      where: { id: collectionId },
      data: {
        ...(!folder.targetCollectionId && dto.published !== undefined
          ? { published: dto.published }
          : {}),
        jobState: "queued",
        jobRows: ready.map((r) => r.id),
        jobRequestedAt: new Date(),
      },
    });
    await this.touch(draft);
    return this.collection(user, id, collectionId);
  }
  async runJobBatch() {
    // Idle worker ticks do not contend with interactive mutations.
    const pending = await this.prisma.importFolder.findFirst({
      where: { jobState: { in: ["queued", "running"] } },
      select: { id: true },
    });
    if (!pending) return false;
    return this.prisma.withAuthority(async () => {
      const folder = await this.prisma.importFolder.findFirst({
        where: { jobState: { in: ["queued", "running"] } },
        orderBy: [{ jobRequestedAt: "asc" }, { id: "asc" }],
        include: { draft: { include: { user: { select: { accountState: true } } } } },
      });
      if (!folder) return false;
      try {
        await this.prisma.withSavepoint(async () => {
          if (folder.draft.user.accountState !== "active") throw appError("forbidden");
          const user = { userId: folder.draft.userId };
          const draft = await this.load(user, folder.draftId);
          await this.commit(user, draft.id, { version: draft.version }, folder.jobRows, true);
          const state = await importState(this.prisma, await this.load(user, draft.id));
          const remaining = state.rows.filter(
            (r) => folder.jobRows.includes(r.id) && r.status === "ready",
          );
          if (!remaining.length) {
            // A job selects ready rows, but completion also settles redundant
            // rows in this collection. Other collection drafts remain untouched.
            const redundant = state.rows.filter(
              (r) =>
                r.collectionKey === folder.id && ["duplicate", "already_saved"].includes(r.status),
            );
            if (redundant.length) {
              await this.prisma.importRow.updateMany({
                where: {
                  draftId: draft.id,
                  id: { in: redundant.map((r) => r.id) },
                  resourceId: null,
                },
                data: { dropped: true },
              });
              await this.finish(draft);
            }
          }
          await this.prisma.importFolder.update({
            where: { id: folder.id },
            data: {
              jobState: remaining.length ? "running" : "completed",
              jobRows: remaining.map((r) => r.id),
            },
          });
        });
        return true;
      } catch {
        // Roll back the failed batch before recording failure, retaining the
        // authority lock so another worker cannot advance the same job meanwhile.
        await this.prisma.importFolder.update({
          where: { id: folder.id },
          data: { jobState: "failed" },
        });
        return false;
      }
    });
  }
  private requireEditable(draft: LoadedDraft, folderId: string) {
    const folder = draft.folders.find((f) => f.id === folderId);
    const target = folder && destination(folder, draft.folders);
    if (target && ["queued", "running"].includes(target.jobState)) throw appError("conflict");
  }
  async discardCollection(
    user: AuthUser,
    id: string,
    collectionId: string,
    dto: ImportRevisionDto,
  ) {
    const draft = await this.load(user, id);
    if (draft.version !== dto.version) throw appError("version_conflict");
    const folder = draft.folders.find(
      (f) => f.id === collectionId && f.mode === "collection" && f.jobState !== "discarded",
    );
    if (!folder) throw appError("not_found");
    this.requireEditable(draft, folder.id);
    const { rows } = await importState(this.prisma, draft);
    await this.prisma.importRow.updateMany({
      where: {
        draftId: id,
        id: { in: rows.filter((r) => r.collectionKey === collectionId).map((r) => r.id) },
        resourceId: null,
      },
      data: { dropped: true },
    });
    // Discard this draft's pending container; independently reviewed child
    // collections remain available and no longer recreate the discarded parent.
    // The synthetic root also holds unfiled rows. Keep that structural anchor:
    // promoting its children to null would make them look like export roots.
    if (folder.parentId !== null)
      await this.prisma.importFolder.updateMany({
        where: { draftId: id, parentId: collectionId, mode: "collection", referenceId: null },
        data: { parentId: folder.parentId },
      });
    await this.prisma.importFolder.update({
      where: { id: collectionId },
      data: { jobState: "discarded", jobRows: [] },
    });
    await this.finish(draft);
    return { success: true };
  }
  async row(user: AuthUser, id: string, rowId: string) {
    const { rows } = await importState(this.prisma, await this.load(user, id));
    const row = rows.find((r) => r.id === rowId);
    if (!row) throw appError("not_found");
    return row;
  }

  private async rowPlacement(
    draft: LoadedDraft,
    row: LoadedDraft["rows"][number],
    dto: ImportRowDto,
  ) {
    if (dto.collectionTitle === undefined && dto.sectionTitle === undefined) return {};
    const folder = draft.folders.find((f) => f.id === row.folderId);
    if (!folder) throw appError("invalid_import");
    this.requireEditable(draft, folder.id);
    const current = destination(folder, draft.folders);
    const currentSection = folder.mode === "section" ? folder.name : "";
    const currentTitle = current?.targetCollectionId
      ? ((
          await this.prisma.collection.findFirst({
            where: { id: current.targetCollectionId, hubId: draft.hubId },
            select: { title: true },
          })
        )?.title ?? current.newTitle)
      : current?.newTitle;
    const title = dto.collectionTitle?.trim() ?? currentTitle;
    const section = dto.sectionTitle?.trim() ?? currentSection;
    if (!title) throw appError("invalid_import");
    if (title === currentTitle && section === currentSection) return {};
    if (draft.sourceKind === "csv") throw appError("invalid_import");
    // Never rename a shared destination as a side effect of editing one row.
    // Reuse an unambiguous planned group, or create private draft-only placement.
    let target = title === currentTitle ? current : null;
    if (!target) {
      const matches = draft.folders.filter(
        (f) => f.mode === "collection" && f.newTitle === title && f.jobState !== "discarded",
      );
      if (matches.length > 1) throw appError("invalid_import");
      target = matches[0] ?? null;
    }
    let position = Math.max(...draft.folders.map((f) => f.position)) + 1;
    const root = draft.folders.find((f) => !f.parentId);
    if (!root) throw appError("invalid_import");
    const create = async (parentId: string, name: string, mode: "collection" | "section") => {
      if (position >= 2001) throw appError("invalid_import");
      return this.prisma.importFolder.create({
        data: {
          draftId: draft.id,
          parentId,
          name,
          path: name,
          newTitle: name,
          position: position++,
          mode,
          manual: true,
        },
      });
    };
    if (!target) target = await create(root.id, title, "collection");
    this.requireEditable(draft, target.id);
    const targetId = target.id;
    let placement = target;
    if (section) {
      placement =
        draft.folders.find(
          (f) =>
            destination(f, draft.folders)?.id === targetId &&
            f.mode === "section" &&
            f.name === section,
        ) ?? (await create(targetId, section, "section"));
    }
    return { folderId: placement.id };
  }

  async editRow(user: AuthUser, id: string, rowId: string, dto: ImportRowDto) {
    const draft = await this.load(user, id, dto.version);
    const row = draft.rows.find((r) => r.id === rowId);
    if (!row) throw appError("not_found");
    this.requireEditable(draft, row.folderId);
    if (row.resourceId || row.dropped) throw appError("conflict");
    const address = dto.address?.trim();
    const checked = address === undefined ? null : importAddress(address);
    const placement = await this.rowPlacement(draft, row, dto);
    await this.prisma.importRow.update({
      where: { id: row.id },
      data: {
        ...placement,
        ...(address === undefined ? {} : { address, ...checked }),
        ...(dto.tags === undefined ? {} : { tags: normalizeTags(dto.tags) }),
      },
    });
    if (checked?.url) await this.enqueue(user, [checked.url]);
    await this.touch(draft);
    return this.read(user, id);
  }
  async dropRow(user: AuthUser, id: string, rowId: string, dto: ImportRevisionDto) {
    const draft = await this.load(user, id, dto.version);
    const row = draft.rows.find((r) => r.id === rowId);
    if (!row) throw appError("not_found");
    this.requireEditable(draft, row.folderId);
    if (row.resourceId) throw appError("conflict");
    await this.prisma.importRow.update({ where: { id: rowId }, data: { dropped: true } });
    await this.finish(draft);
    return this.read(user, id);
  }
  async nameDestination(user: AuthUser, id: string, dto: ImportDestinationDto) {
    const draft = await this.load(user, id, dto.version);
    if (draft.sourceKind === "csv") throw appError("invalid_import");
    const root = draft.folders.find((f) => f.parentId === null);
    const title = dto.collectionTitle.trim();
    if (!root || root.targetCollectionId || root.newTitle || !title)
      throw appError("invalid_import");
    const matches = draft.folders.filter(
      (f) => f.mode === "collection" && f.newTitle === title && f.jobState !== "discarded",
    );
    if (matches.length > 1) throw appError("invalid_import");
    this.requireEditable(draft, root.id);
    if (matches[0]) {
      this.requireEditable(draft, matches[0].id);
      await this.prisma.importRow.updateMany({
        where: { draftId: id, folderId: root.id, resourceId: null, dropped: false },
        data: { folderId: matches[0].id },
      });
    } else {
      await this.prisma.importFolder.update({
        where: { id: root.id },
        data: { newTitle: title, name: title },
      });
    }
    await this.touch(draft);
    return this.read(user, id);
  }
  private async revalidateRows(user: AuthUser, rows: Array<{ id: string; address: string }>) {
    const urls: string[] = [];
    for (const row of rows) {
      const checked = importAddress(row.address);
      await this.prisma.importRow.update({ where: { id: row.id }, data: checked });
      if (checked.url) urls.push(checked.url);
    }
    await this.enqueue(user, urls, true);
  }
  async selection(user: AuthUser, id: string, dto: ImportSelectionDto) {
    const draft = await this.load(user, id, dto.version);
    const { rows } = await importState(this.prisma, draft);
    const selected = rows.filter((r) => dto.rowIds.includes(r.id));
    if (selected.length !== dto.rowIds.length) throw appError("not_found");
    for (const row of selected) this.requireEditable(draft, row.folderId);
    if (selected.some((r) => ["imported", "skipped"].includes(r.status)))
      throw appError("conflict");
    if (dto.action === "place") {
      const root = draft.folders.find((f) => !f.parentId);
      if (
        draft.sourceKind === "csv" ||
        !root ||
        root.newTitle ||
        root.targetCollectionId ||
        selected.some((r) => r.folderId !== root.id)
      )
        throw appError("conflict");
      const source = draft.rows.find((r) => r.id === dto.rowIds[0]);
      if (!source || !dto.collectionTitle?.trim()) throw appError("invalid_import");
      const placement = await this.rowPlacement(draft, source, {
        version: dto.version,
        collectionTitle: dto.collectionTitle,
        sectionTitle: "",
      });
      await this.prisma.importRow.updateMany({
        where: { draftId: id, id: { in: dto.rowIds } },
        data: placement,
      });
      await this.touch(draft);
    } else if (dto.action === "revalidate") {
      if (selected.some((r) => r.status !== "failed" || r.reason !== "unreachable"))
        throw appError("conflict");
      await this.revalidateRows(user, selected);
      await this.touch(draft);
    } else {
      await this.prisma.importRow.updateMany({
        where: { draftId: id, id: { in: dto.rowIds } },
        data: { dropped: true },
      });
      await this.finish(draft);
    }
    const state = await importState(this.prisma, await this.load(user, id));
    return { draft: state.view, rows: state.rows.filter((r) => dto.rowIds.includes(r.id)) };
  }
  async bulk(
    user: AuthUser,
    id: string,
    dto: ImportRevisionDto,
    action: "revalidate" | "drop-failed",
  ) {
    const draft = await this.load(user, id, dto.version);
    const { rows } = await importState(this.prisma, draft);
    const failed = rows.filter((r) => r.status === "failed");
    for (const row of failed) this.requireEditable(draft, row.folderId);
    if (action === "revalidate") {
      await this.revalidateRows(user, failed);
      await this.touch(draft);
    } else {
      await this.prisma.importRow.updateMany({
        where: { draftId: id, id: { in: failed.map((r) => r.id) } },
        data: { dropped: true },
      });
      await this.finish(draft);
    }
    return this.read(user, id);
  }
  async discard(user: AuthUser, id: string, dto: ImportRevisionDto) {
    const draft = await this.load(user, id, dto.version);
    for (const f of draft.folders) this.requireEditable(draft, f.id);
    await this.prisma.importDraft.delete({ where: { id } });
    return { success: true };
  }
  async commit(
    user: AuthUser,
    id: string,
    dto: ImportRevisionDto,
    rowIds?: string[],
    worker = false,
  ): Promise<ImportCommitResult> {
    const draft = await this.load(user, id);
    // A replay after completion is harmless; an older revision cannot commit a
    // changed destination or newly edited address.
    if (draft.closed)
      return {
        importedCount: 0,
        destinations: [],
        draft: (await importState(this.prisma, draft)).view,
      };
    if (draft.version !== dto.version) throw appError("version_conflict");
    const { rows } = await importState(this.prisma, draft);
    const ready = rows
      .filter((r) => r.status === "ready" && (!rowIds || rowIds.includes(r.id)))
      .slice(0, IMPORT_COMMIT_BATCH);
    if (!worker) for (const row of ready) this.requireEditable(draft, row.folderId);
    const destinations = new Map<string, number>();
    const batches = new Map<
      string,
      {
        collection: Awaited<ReturnType<ImportsService["ensureDestination"]>>;
        groups: Array<{ folder: ImportFolder; dest: ImportFolder; rows: typeof ready }>;
      }
    >();
    const resolved = new Map<string, Awaited<ReturnType<ImportsService["ensureDestination"]>>>();
    for (const folder of draft.folders) {
      const group = ready.filter((r) => r.folderId === folder.id);
      if (!group.length) continue;
      const dest = destination(folder, draft.folders);
      if (!dest) continue;
      const collection = resolved.get(dest.id) ?? (await this.ensureDestination(user, draft, dest));
      resolved.set(dest.id, collection);
      const batch = batches.get(collection.id) ?? { collection, groups: [] };
      batch.groups.push({ folder, dest, rows: group });
      batches.set(collection.id, batch);
    }
    // Plan every source folder against one destination snapshot. Folders sharing
    // a collection must not repeatedly shift the same saved suffix.
    for (const { collection, groups } of batches.values()) {
      const existing = await this.prisma.resource.findMany({
        where: { collectionId: collection.id, collection: { hubId: draft.hubId } },
        orderBy: { position: "asc" },
      });
      const slots = new Map<
        number,
        Array<{ folder: ImportFolder; row: (typeof ready)[number] | null }>
      >();
      for (const { folder, rows: group } of groups) {
        const add = (at: number, row: (typeof ready)[number] | null) => {
          const entries = slots.get(at) ?? [];
          entries.push({ folder, row });
          slots.set(at, entries);
        };
        const section = folder.mode === "section";
        const heading = section
          ? existing.find((r) => r.id === folder.headingId && r.kind === "heading")
          : undefined;
        const end = (existing.at(-1)?.position ?? -1) + 1;
        const laterFolders = draft.folders.filter(
          (f) =>
            f.position > folder.position &&
            destination(f, draft.folders)?.targetCollectionId === collection.id,
        );
        const laterFolderIds = new Set(laterFolders.map((f) => f.id));
        const laterReceipts = new Set([
          ...laterFolders.map((f) => f.headingId),
          ...draft.rows.filter((r) => laterFolderIds.has(r.folderId)).map((r) => r.resourceId),
        ]);
        const nextFolder =
          existing.find((r) => r.position > (heading?.position ?? -1) && laterReceipts.has(r.id))
            ?.position ?? end;
        if (section && !heading) {
          // Later folders may share this destination without having a heading.
          const at = nextFolder;
          add(at, null);
          for (const row of group) add(at, row);
        } else {
          const sectionEnd = Math.min(
            nextFolder,
            heading
              ? (existing.find((r) => r.kind === "heading" && r.position > heading.position)
                  ?.position ?? end)
              : end,
          );
          for (const row of group) {
            const flatCorrection = !section;
            const rowEnd = flatCorrection
              ? Math.min(
                  sectionEnd,
                  existing.find(
                    (r) =>
                      r.kind === "heading" ||
                      draft.folders.some((f) => f.parentId === folder.id && f.referenceId === r.id),
                  )?.position ?? end,
                )
              : sectionEnd;
            const following = new Set(
              draft.rows
                .filter((r) => r.folderId === folder.id && r.position > row.position)
                .map((r) => r.resourceId),
            );
            // A receipt moved by the owner to another section no longer determines
            // placement here. Keep new links within this section's current bounds.
            const at =
              existing.find(
                (r) =>
                  r.position > (heading?.position ?? -1) &&
                  r.position < rowEnd &&
                  following.has(r.id),
              )?.position ?? rowEnd;
            add(at, row);
          }
        }
      }
      const insertions = [...slots].sort(([a], [b]) => a - b);
      // Flat rows must precede newly planned headings too, even if another
      // source collection sharing this destination appears later in the file.
      for (const [, entries] of insertions)
        entries.sort(
          (a, b) => Number(a.folder.mode === "section") - Number(b.folder.mode === "section"),
        );
      const shifts = existing.flatMap((item) => {
        const count = insertions.reduce(
          (sum, [at, entries]) => sum + (at <= item.position ? entries.length : 0),
          0,
        );
        return count ? [{ id: item.id, position: item.position + count, temporary: 0 }] : [];
      });
      if (shifts.length) {
        // Temporary slots avoid both current and final positions, including
        // sparse owner-defined positions. Two bulk writes preserve uniqueness.
        const occupied = new Set([
          ...existing.map((r) => r.position),
          ...shifts.map((r) => r.position),
        ]);
        let temporary = 0;
        for (const shift of shifts) {
          while (occupied.has(temporary)) temporary++;
          shift.temporary = temporary++;
        }
        const changes = JSON.stringify(shifts);
        await this.prisma.$executeRaw`
          UPDATE resources AS r SET position = changes.temporary
          FROM jsonb_to_recordset(${changes}::jsonb) AS changes(id uuid, position integer, temporary integer), collections AS c
          WHERE r.id = changes.id AND r.collection_id = ${collection.id}::uuid
            AND c.id = r.collection_id AND c.hub_id = ${draft.hubId}::uuid
        `;
        await this.prisma.$executeRaw`
          UPDATE resources AS r SET position = changes.position, version = r.version + 1
          FROM jsonb_to_recordset(${changes}::jsonb) AS changes(id uuid, position integer), collections AS c
          WHERE r.id = changes.id AND r.collection_id = ${collection.id}::uuid
            AND c.id = r.collection_id AND c.hub_id = ${draft.hubId}::uuid
        `;
      }
      let offset = 0;
      for (const [at, entries] of insertions) {
        for (const { folder, row } of entries) {
          const position = at + offset++;
          if (!row) {
            const created = await this.prisma.resource.create({
              data: {
                collectionId: collection.id,
                kind: "heading",
                titleOverride: folder.name,
                position,
                addedByUserId: user.userId,
              },
            });
            folder.headingId = created.id;
            await this.resources.record(collection, user, "item.section_added", created.id);
            await this.prisma.importFolder.update({
              where: { id: folder.id },
              data: { headingId: created.id },
            });
          } else {
            const resource = await this.resources.insertExternal(
              collection,
              user,
              row.url as string,
              row.tags,
              position,
            );
            await this.prisma.importRow.update({
              where: { id: row.id },
              data: { resourceId: resource.id },
            });
          }
        }
      }
      await this.resources.requireNonemptySections(collection.id);
      for (const { dest } of groups) await this.linkAncestors(user, draft, dest);
      destinations.set(
        collection.id,
        groups.reduce((sum, group) => sum + group.rows.length, 0),
      );
    }
    await this.prisma.importRow.updateMany({
      where: {
        draftId: id,
        id: {
          in: rows
            .filter((r) => !rowIds && ["duplicate", "already_saved", "skipped"].includes(r.status))
            .map((r) => r.id),
        },
        resourceId: null,
      },
      data: { dropped: true },
    });
    await this.finish(draft);
    return {
      importedCount: ready.length,
      destinations: [...destinations].map(([collectionId, importedCount]) => ({
        collectionId,
        importedCount,
      })),
      draft: await this.read(user, id),
    };
  }
  private async ensureDestination(user: AuthUser, draft: LoadedDraft, folder: ImportFolder) {
    if (!folder.targetCollectionId) {
      if (!folder.newTitle.trim()) throw appError("invalid_import");
      const created = await this.collections.create(user, {
        title: folder.newTitle,
        published: folder.published,
      });
      folder.targetCollectionId = created.id;
      await this.prisma.importFolder.update({
        where: { id: folder.id },
        data: { targetCollectionId: created.id },
      });
    }
    return this.target(user, draft.hubId, folder.targetCollectionId);
  }

  private async linkAncestors(
    user: AuthUser,
    draft: LoadedDraft,
    folder: ImportFolder,
  ): Promise<void> {
    if (draft.sourceKind !== "bookmarks" || folder.manual || folder.referenceId) return;
    const parent = draft.folders.find((f) => f.id === folder.parentId);
    // The synthetic export root is never a collection relationship.
    if (!parent?.parentId || parent.mode !== "collection") return;
    const target = await this.ensureDestination(user, draft, folder);
    const collection = await this.ensureDestination(user, draft, parent);
    const items = await this.prisma.resource.findMany({
      where: { collectionId: collection.id },
      orderBy: { position: "asc" },
    });
    const following = new Set(
      draft.folders
        .filter((f) => f.parentId === parent.id && f.position > folder.position)
        .map((f) => f.referenceId),
    );
    // Direct links/references precede flat sections. Late child imports retain
    // sibling order without splitting an already committed section.
    const position =
      items.find((r) => r.kind === "heading" || following.has(r.id))?.position ??
      (items.at(-1)?.position ?? -1) + 1;
    for (const item of [...items].reverse())
      if (item.position >= position)
        await this.prisma.resource.update({
          where: { id: item.id },
          data: { position: { increment: 1 }, version: { increment: 1 } },
        });
    const reference = await this.resources.createCollectionLink(collection.id, user, {
      linkedCollectionId: target.id,
      position,
    });
    folder.referenceId = reference.id;
    await this.prisma.importFolder.update({
      where: { id: folder.id },
      data: { referenceId: reference.id },
    });
    await this.linkAncestors(user, draft, parent);
  }

  private async load(user: AuthUser, id: string, version?: number): Promise<LoadedDraft> {
    const draft = await this.prisma.importDraft.findFirst({
      where: {
        id,
        userId: user.userId,
        expiresAt: { gt: new Date() },
        hub: { ownerUserId: user.userId },
      },
      include: {
        folders: { orderBy: { position: "asc" } },
        rows: { orderBy: { position: "asc" } },
      },
    });
    if (!draft) throw appError("not_found");
    if (version !== undefined && (draft.closed || draft.version !== version))
      throw appError("version_conflict");
    return draft;
  }
  private async target(user: AuthUser, hubId: string, id: string) {
    const collection = await this.prisma.collection.findFirst({ where: { id, hubId } });
    if (!collection) throw appError("not_found");
    await this.policy.requireManage(collection, user);
    return collection;
  }
  private async touch(draft: LoadedDraft, closed = false) {
    await this.prisma.importDraft.update({
      where: { id: draft.id },
      data: { version: { increment: 1 }, expiresAt: expiry(), closed },
    });
  }
  private async finish(draft: LoadedDraft) {
    const outstanding = await this.prisma.importRow.count({
      where: { draftId: draft.id, resourceId: null, dropped: false },
    });
    await this.touch(draft, outstanding === 0);
  }
  private async enqueue(user: AuthUser, urls: string[], retry = false) {
    urls = [...new Set(urls)];
    if (!urls.length) return;
    const key = `import-lookups:${user.userId}`,
      amount = urls.length;
    const rows = await this.prisma.$queryRaw<
      Array<{ count: number }>
    >`INSERT INTO request_budgets(key,count,expires_at) VALUES(${key},${amount},clock_timestamp()+interval '1 day') ON CONFLICT(key) DO UPDATE SET count=CASE WHEN request_budgets.expires_at<=clock_timestamp() THEN ${amount} ELSE request_budgets.count+${amount} END,expires_at=CASE WHEN request_budgets.expires_at<=clock_timestamp() THEN clock_timestamp()+interval '1 day' ELSE request_budgets.expires_at END WHERE request_budgets.expires_at<=clock_timestamp() OR request_budgets.count+${amount}<=${IMPORT_LOOKUPS_PER_DAY} RETURNING count`;
    if (!rows.length) throw appError("too_many_requests");
    await requestLinkMetadata(this.prisma, urls);
    if (retry)
      await this.prisma.linkMetadata.updateMany({
        where: { url: { in: urls }, state: { not: "ready" }, leaseToken: null },
        data: { state: "pending", attempts: 0, availableAt: new Date() },
      });
  }
}
