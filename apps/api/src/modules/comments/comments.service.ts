import { ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import type { AuditAction, CommentAuthor, CommentThreads, CommentView } from "@linkhub/types";
import { recordAudit } from "src/common/audit";
import { appError } from "src/common/errors/app-exception";
import type { AuthUser } from "src/common/interfaces/auth-user.interface";
import { decodeCursor, encodeCursor } from "src/common/utils/cursor.util";
import { PrismaService } from "src/database/prisma.service";
import type { Collection, CollectionComment, Prisma } from "src/generated/prisma/client";
import { CollectionPolicyService } from "../hubs/collection-policy.service";
import type { CreateCommentDto, UpdateCommentDto } from "./dto/comment.dto";

const REPLY_LIMIT = 100;

// Comments follow the collection's own access: anyone who can read may read the
// discussion; signed-in readers may post and reply while comments are on and
// the collection is not on hold. Owners and contributors moderate (hide, mark the
// answer); authors edit or delete their own words. Nothing here grants access
// to the collection or to anything it references.
@Injectable()
export class CommentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly policy: CollectionPolicyService,
  ) {}

  private async collection(id: string) {
    const collection = await this.prisma.collection.findUnique({ where: { id } });
    if (!collection) throw new NotFoundException("Collection not found");
    return collection;
  }

  private async viewerAccess(collection: Collection, viewer: AuthUser | null, token?: string) {
    const access = await this.policy.requireRead(collection, viewer, token);
    if (access.viaLinkToken && viewer)
      await this.policy.recordLinkAccess(collection.id, viewer.userId);
    const held = Boolean(await this.policy.holdReason(collection));
    return {
      moderator: access.canWriteContent,
      canComment: Boolean(viewer) && collection.commentsEnabled && !held,
    };
  }

  private async comment(id: string) {
    const comment = await this.prisma.collectionComment.findUnique({ where: { id } });
    if (!comment) throw appError("not_found");
    return comment;
  }

  // A comment the viewer cannot read the collection of looks missing.
  private async requireModerator(comment: CollectionComment, user: AuthUser) {
    const collection = await this.collection(comment.collectionId);
    const access = await this.policy.resolve(collection, user);
    if (!access.canRead) throw appError("not_found");
    if (!access.canWriteContent) throw new ForbiddenException("Forbidden");
    return collection;
  }

  async list(
    collectionId: string,
    viewer: AuthUser | null,
    token: string | undefined,
    query: { cursor?: string; limit?: number; replyTo?: string; replyCursor?: string },
  ): Promise<{ data: CommentThreads; nextCursor: string | null }> {
    const collection = await this.collection(collectionId);
    const { moderator, canComment } = await this.viewerAccess(collection, viewer, token);
    const limit = query.limit ?? 20;
    const cursor = query.cursor ? decodeCursor<{ t: string; i: string }>(query.cursor) : null;
    if (
      query.cursor &&
      (!cursor ||
        typeof cursor.t !== "string" ||
        typeof cursor.i !== "string" ||
        Number.isNaN(Date.parse(cursor.t)))
    )
      throw appError("invalid_cursor");
    const top = await this.prisma.collectionComment.findMany({
      where: {
        collectionId,
        parentId: null,
        ...(cursor
          ? {
              OR: [
                { createdAt: { lt: new Date(cursor.t) } },
                { createdAt: new Date(cursor.t), id: { lt: cursor.i } },
              ],
            }
          : {}),
      },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: limit + 1,
    });
    const page = top.slice(0, limit);
    const last = page.at(-1);
    const nextCursor =
      top.length > limit && last
        ? encodeCursor({ t: last.createdAt.toISOString(), i: last.id })
        : null;
    if (
      Boolean(query.replyTo) !== Boolean(query.replyCursor) ||
      (query.replyTo && !page.some((row) => row.id === query.replyTo))
    )
      throw appError("invalid_cursor");
    const replyPages = await Promise.all(
      page.map((question) =>
        this.replyPage(
          collectionId,
          question.id,
          moderator,
          query.replyTo === question.id ? query.replyCursor : undefined,
        ),
      ),
    );
    const authors = await this.authors(collection, [...page, ...replyPages.flatMap((p) => p.rows)]);
    const shown = (row: CollectionComment) =>
      row.state === "visible" || (row.state === "hidden" && moderator);
    const comments = page.flatMap((question, index) => {
      const replyPage = replyPages[index];
      const answers = replyPage.rows.map((reply) =>
        this.view(reply, [], authors, viewer, moderator),
      );
      // A removed question stays only as a placeholder for its replies.
      if (!shown(question) && !answers.length) return [];
      return [
        {
          ...this.view(question, answers, authors, viewer, moderator),
          repliesNextCursor: replyPage.nextCursor,
        },
      ];
    });
    return {
      data: { comments, enabled: collection.commentsEnabled, canComment },
      nextCursor,
    };
  }

  private async replyPage(
    collectionId: string,
    parentId: string,
    moderator: boolean,
    encoded?: string,
  ) {
    const cursor = encoded ? decodeCursor<{ p: string; t: string; i: string }>(encoded) : null;
    if (
      encoded &&
      (!cursor ||
        cursor.p !== parentId ||
        typeof cursor.t !== "string" ||
        typeof cursor.i !== "string" ||
        !/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(cursor.i) ||
        Number.isNaN(Date.parse(cursor.t)))
    )
      throw appError("invalid_cursor");
    const where = {
      collectionId,
      parentId,
      state: { in: moderator ? ["visible", "hidden"] : ["visible"] },
    };
    // Fetch the readable answer independently so even a late answer is first.
    const accepted = await this.prisma.collectionComment.findFirst({
      where: { ...where, accepted: true },
    });
    const limit = REPLY_LIMIT - (accepted ? 1 : 0);
    const replies = await this.prisma.collectionComment.findMany({
      where: {
        ...where,
        accepted: false,
        ...(cursor
          ? {
              OR: [
                { createdAt: { gt: new Date(cursor.t) } },
                { createdAt: new Date(cursor.t), id: { gt: cursor.i } },
              ],
            }
          : {}),
      },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      take: limit + 1,
    });
    const rows = replies.slice(0, limit),
      last = rows.at(-1);
    return {
      rows: accepted ? [accepted, ...rows] : rows,
      nextCursor:
        replies.length > limit && last
          ? encodeCursor({ p: parentId, t: last.createdAt.toISOString(), i: last.id })
          : null,
    };
  }

  private view(
    row: CollectionComment,
    replies: CommentView[],
    authors: Map<string, CommentAuthor>,
    viewer: AuthUser | null,
    moderator: boolean,
  ): CommentView {
    const readable = row.state === "visible" || (row.state === "hidden" && moderator);
    return {
      id: row.id,
      parentId: row.parentId,
      body: readable ? row.body : null,
      state: row.state as CommentView["state"],
      accepted: row.accepted,
      author: row.authorUserId ? (authors.get(row.authorUserId) ?? null) : null,
      version: Number(row.version),
      createdAt: row.createdAt.toISOString(),
      editedAt: row.editedAt?.toISOString() ?? null,
      canEdit: row.state === "visible" && Boolean(viewer) && row.authorUserId === viewer?.userId,
      canModerate: moderator,
      replies,
      repliesNextCursor: null,
    };
  }

  // Authors are people, whether or not they have a hub.
  private async authors(collection: Collection, rows: CollectionComment[]) {
    const ids = [...new Set(rows.flatMap((row) => (row.authorUserId ? [row.authorUserId] : [])))];
    if (!ids.length) return new Map<string, CommentAuthor>();
    const [users, hub, contributors] = await Promise.all([
      this.prisma.user.findMany({
        where: { id: { in: ids }, accountState: "active" },
        select: {
          id: true,
          username: true,
        },
      }),
      this.prisma.hub.findUnique({
        where: { id: collection.hubId },
        select: { ownerUserId: true },
      }),
      this.prisma.collectionShare.findMany({
        where: {
          collectionId: collection.id,
          source: "direct",
          role: "contributor",
          userId: { in: ids },
        },
        select: { userId: true },
      }),
    ]);
    const contributorIds = new Set(contributors.map((share) => share.userId));
    return new Map(
      users.map((person): [string, CommentAuthor] => [
        person.id,
        {
          userId: person.id,
          username: person.username,
          role:
            hub?.ownerUserId === person.id
              ? "owner"
              : contributorIds.has(person.id)
                ? "contributor"
                : null,
        },
      ]),
    );
  }

  // The mutated comment as its author/moderator now sees it (without replies).
  private async single(id: string, viewer: AuthUser) {
    const row = await this.comment(id);
    const collection = await this.collection(row.collectionId);
    const access = await this.policy.resolve(collection, viewer);
    return this.view(
      row,
      [],
      await this.authors(collection, [row]),
      viewer,
      access.canWriteContent,
    );
  }

  async create(
    collectionId: string,
    user: AuthUser,
    token: string | undefined,
    dto: CreateCommentDto,
  ) {
    const collection = await this.collection(collectionId);
    await this.viewerAccess(collection, user, token);
    if (!collection.commentsEnabled) throw appError("comments_disabled");
    await this.policy.requireUnrestricted(collection);
    const body = dto.body.trim();
    if (!body) throw appError("bad_request");
    if (dto.parentId) {
      const parent = await this.prisma.collectionComment.findUnique({
        where: { id: dto.parentId },
      });
      if (
        !parent ||
        parent.collectionId !== collection.id ||
        parent.parentId ||
        parent.state === "deleted"
      )
        throw appError("bad_request");
    }
    const created = await this.prisma.collectionComment.create({
      data: {
        collectionId: collection.id,
        authorUserId: user.userId,
        parentId: dto.parentId ?? null,
        body,
      },
    });
    return this.single(created.id, user);
  }

  async update(id: string, user: AuthUser, dto: UpdateCommentDto) {
    const row = await this.comment(id);
    const collection = await this.collection(row.collectionId);
    const access = await this.policy.resolve(collection, user);
    if (!access.canRead) throw appError("not_found");
    if (row.authorUserId !== user.userId || row.state !== "visible")
      throw new ForbiddenException("Forbidden");
    if (Number(row.version) !== dto.version) throw appError("version_conflict");
    const body = dto.body.trim();
    if (!body) throw appError("bad_request");
    const updated = await this.prisma.collectionComment.updateMany({
      where: { id, version: row.version },
      data: { body, editedAt: new Date(), version: { increment: 1 } },
    });
    if (!updated.count) throw appError("version_conflict");
    return this.single(id, user);
  }

  // Authors remove their own words. A question with replies keeps a placeholder.
  async remove(id: string, user: AuthUser) {
    const row = await this.comment(id);
    const collection = await this.collection(row.collectionId);
    const access = await this.policy.resolve(collection, user);
    if (!access.canRead) throw appError("not_found");
    if (row.authorUserId !== user.userId || row.state === "deleted")
      throw new ForbiddenException("Forbidden");
    const replies = await this.prisma.collectionComment.count({ where: { parentId: id } });
    if (replies)
      await this.prisma.collectionComment.update({
        where: { id },
        data: { state: "deleted", body: "[deleted]", accepted: false, version: { increment: 1 } },
      });
    else await this.prisma.collectionComment.delete({ where: { id } });
    return { id, deleted: true };
  }

  async setHidden(id: string, user: AuthUser, hidden: boolean) {
    const row = await this.comment(id);
    const collection = await this.requireModerator(row, user);
    if (row.state === "deleted") throw appError("conflict");
    await this.prisma.collectionComment.update({
      where: { id },
      data: hidden
        ? {
            state: "hidden",
            hiddenByUserId: user.userId,
            accepted: false,
            version: { increment: 1 },
          }
        : { state: "visible", hiddenByUserId: null, version: { increment: 1 } },
    });
    await this.record(collection, user, hidden ? "comment.hidden" : "comment.shown", row);
    return this.single(id, user);
  }

  // One accepted answer per question; marking another replaces it.
  async setAccepted(id: string, user: AuthUser, accepted: boolean) {
    const row = await this.comment(id);
    const collection = await this.requireModerator(row, user);
    if (!row.parentId || row.state !== "visible") throw appError("bad_request");
    await this.prisma.$transaction(async (tx) => {
      if (accepted)
        await tx.collectionComment.updateMany({
          where: { parentId: row.parentId, accepted: true, id: { not: id } },
          data: { accepted: false, version: { increment: 1 } },
        });
      await tx.collectionComment.update({
        where: { id },
        data: { accepted, version: { increment: 1 } },
      });
      await this.record(
        collection,
        user,
        accepted ? "comment.answer_marked" : "comment.answer_unmarked",
        row,
        tx,
      );
    });
    return this.single(id, user);
  }

  // Moderation is part of the collection's activity (ADR-0015); the comment's
  // author is the target person.
  private record(
    collection: Collection,
    user: AuthUser,
    action: AuditAction,
    comment: CollectionComment,
    tx: Prisma.TransactionClient = this.prisma as unknown as Prisma.TransactionClient,
  ) {
    return recordAudit(tx, {
      hubId: collection.hubId,
      actorUserId: user.userId,
      collectionId: collection.id,
      ...(comment.authorUserId ? { targetUserId: comment.authorUserId } : {}),
      action,
    });
  }
}
