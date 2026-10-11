import { afterAll, beforeAll, expect, it } from "bun:test";
import { randomUUID } from "node:crypto";
import { PrismaPg } from "@prisma/adapter-pg";
import type { PrismaService } from "../src/database/prisma.service";
import { type CollectionComment, PrismaClient } from "../src/generated/prisma/client";
import { CommentsService } from "../src/modules/comments/comments.service";
import { ExportsService } from "../src/modules/exports/exports.service";
import { CollectionPolicyService } from "../src/modules/hubs/collection-policy.service";
import { ResourcesService } from "../src/modules/resources/resources.service";

// The standard e2e runner supplies a disposable database. Query events count
// actual SQL, including Prisma relation reads, without logging values/content.
const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
  log: [{ emit: "event", level: "query" }],
});
let queries = 0;
prisma.$on("query", () => queries++);
const db = prisma as unknown as PrismaService;
const policy = new CollectionPolicyService(db);
const resources = new ResourcesService(db, policy);
const comments = new CommentsService(db, policy);
const exportsService = new ExportsService(db, policy);
let owner: { userId: string }, hubId: string, sourceId: string, smallId: string;
let questionId: string;
async function measured<T>(run: () => Promise<T>) {
  queries = 0;
  const value = await run();
  return { value, count: queries };
}

beforeAll(async () => {
  const key = randomUUID().slice(0, 8);
  const user = await prisma.user.create({
    data: { username: `batch-${key}`, name: "Batch fixture", email: `${key}@example.com` },
  });
  owner = { userId: user.id };
  const hub = await prisma.hub.create({ data: { ownerUserId: user.id, handle: `batch-${key}` } });
  hubId = hub.id;
  const create = (title: string) => prisma.collection.create({ data: { hubId, title } });
  sourceId = (await create("Twenty references")).id;
  smallId = (await create("One reference")).id;
  for (let i = 0; i < 20; i++) {
    const target = await create(`Target ${i}`);
    await prisma.resource.create({
      data: {
        collectionId: sourceId,
        kind: "collection_link",
        linkedCollectionId: target.id,
        position: i,
      },
    });
    if (!i)
      await prisma.resource.create({
        data: {
          collectionId: smallId,
          kind: "collection_link",
          linkedCollectionId: target.id,
          position: 0,
        },
      });
    const question = await prisma.collectionComment.create({
      data: { collectionId: sourceId, authorUserId: user.id, body: `Question ${i}` },
    });
    questionId = question.id;
    await prisma.collectionComment.create({
      data: {
        collectionId: sourceId,
        parentId: question.id,
        authorUserId: user.id,
        body: `Answer ${i}`,
        accepted: true,
      },
    });
  }
});
afterAll(async () => {
  await prisma.$disconnect();
});

it("bounds reference reads independently of page size", async () => {
  const one = await measured(() =>
    resources.getByCollection(sourceId, owner, undefined, { limit: 1 }),
  );
  const many = await measured(() =>
    resources.getByCollection(sourceId, owner, undefined, { limit: 20 }),
  );
  expect(many.value.items).toHaveLength(20);
  expect(many.value.items.every((item) => item.linkedCollection?.title.startsWith("Target "))).toBe(
    true,
  );
  expect(many.count).toBe(one.count);
  expect(many.count).toBeLessThanOrEqual(14);
  console.log("SQL reference page", one.count, many.count);
});

it("bounds reference export reads including expansion", async () => {
  for (const expand of [false, true]) {
    const run = (id: string) =>
      exportsService.export(owner, { collectionIds: [id], format: "markdown", expand });
    const one = await measured(() => run(smallId));
    const many = await measured(() => run(sourceId));
    expect(many.value.body.toString()).toContain("Target 19");
    expect(many.count).toBe(one.count);
    expect(many.count).toBeLessThanOrEqual(10);
    console.log("SQL export", expand, one.count, many.count);
  }
});

it("bounds discussion reads independently of question count", async () => {
  const one = await measured(() => comments.list(sourceId, owner, undefined, { limit: 1 }));
  const many = await measured(() => comments.list(sourceId, owner, undefined, { limit: 20 }));
  expect(many.value.data.comments).toHaveLength(20);
  expect(many.value.data.comments.every((row) => row.replies[0]?.accepted)).toBe(true);
  expect(many.count).toBe(one.count);
  expect(many.count).toBeLessThanOrEqual(11);
  console.log("SQL discussion", one.count, many.count);
});

it("reuses comment mutation authority and returned rows", async () => {
  const created = await measured(() =>
    comments.create(sourceId, owner, undefined, { body: "New answer", parentId: questionId }),
  );
  const updated = await measured(() =>
    comments.update(created.value.id, owner, {
      body: "Changed answer",
      version: created.value.version,
    }),
  );
  const accepted = await measured(() => comments.setAccepted(created.value.id, owner, true));
  const hidden = await measured(() => comments.setHidden(created.value.id, owner, true));
  expect(updated.value).toMatchObject({
    body: "Changed answer",
    version: 2,
    canEdit: true,
    canModerate: true,
  });
  expect(accepted.value).toMatchObject({ accepted: true, version: 3 });
  expect(hidden.value).toMatchObject({
    body: "Changed answer",
    accepted: false,
    state: "hidden",
    version: 4,
    canEdit: false,
  });
  expect([created.count, updated.count, accepted.count, hidden.count]).toEqual([10, 10, 12, 10]);
  console.log("SQL comment writes", created.count, updated.count, accepted.count, hidden.count);
});

it("checks mixed grants, holds, suspension and revocation afresh for each batch", async () => {
  const key = randomUUID().slice(0, 8);
  const visitor = await prisma.user.create({
    data: { username: `viewer-${key}`, name: "Viewer", email: `viewer-${key}@example.com` },
  });
  const viewer = { userId: visitor.id };
  const records = await Promise.all(
    ["private", "public", "contributor", "viewer", "remembered", "disabled", "held"].map((title) =>
      prisma.collection.create({
        data: {
          hubId,
          title,
          published: title === "public" || title === "held",
          linkSharingEnabled: title === "remembered",
          shareTokenHash: title === "remembered" ? "a".repeat(64) : null,
        },
      }),
    ),
  );
  const [privateRow, publicRow, contributor, reader, remembered, disabled, held] = records;
  await prisma.collectionShare.createMany({
    data: [contributor, reader, remembered, disabled, held].map((row) => ({
      collectionId: row.id,
      userId: visitor.id,
      role: row.id === contributor.id || row.id === held.id ? "contributor" : "viewer",
      source: row.id === remembered.id || row.id === disabled.id ? "link" : "direct",
    })),
  });
  await prisma.collectionHold.create({
    data: { collectionId: held.id, reason: "spam", actorUserId: owner.userId },
  });
  const batch = await measured(() => policy.resolveMany(records, viewer));
  expect(batch.count).toBe(4);
  expect(records.map((row) => batch.value.get(row.id)?.canRead)).toEqual([
    false,
    true,
    true,
    true,
    true,
    false,
    false,
  ]);
  expect(records.map((row) => batch.value.get(row.id)?.canWriteContent)).toEqual([
    false,
    false,
    true,
    false,
    false,
    false,
    false,
  ]);
  expect(
    [...batch.value.values()].every((access) => !access.canManage && !access.viaLinkToken),
  ).toBe(true);
  expect(
    [...(await policy.resolveMany(records, owner)).values()].every((access) => access.canManage),
  ).toBe(true);
  expect(
    [...(await policy.resolveMany(records, null)).values()].filter((access) => access.canRead),
  ).toHaveLength(1);
  await prisma.collection.update({ where: { id: publicRow.id }, data: { published: false } });
  await prisma.collection.update({
    where: { id: remembered.id },
    data: { linkSharingEnabled: false },
  });
  await prisma.collectionShare.delete({
    where: { collectionId_userId: { collectionId: contributor.id, userId: visitor.id } },
  });
  const revoked = await policy.resolveMany(records, viewer);
  expect([publicRow, contributor, remembered].every((row) => !revoked.get(row.id)?.canRead)).toBe(
    true,
  );
  await prisma.user.update({ where: { id: visitor.id }, data: { accountState: "suspended" } });
  expect(
    [...(await policy.resolveMany(records, viewer)).values()].every((access) => !access.canRead),
  ).toBe(true);
  await prisma.user.update({ where: { id: visitor.id }, data: { accountState: "active" } });
  await prisma.user.update({ where: { id: owner.userId }, data: { accountState: "suspended" } });
  try {
    expect(
      [...(await policy.resolveMany(records, viewer)).values()].every((access) => !access.canRead),
    ).toBe(true);
    expect((await policy.resolve(privateRow, owner)).canRead).toBe(false);
  } finally {
    await prisma.user.update({ where: { id: owner.userId }, data: { accountState: "active" } });
  }
});

it("redacts foreign, missing and unreadable references in lists and expanded exports", async () => {
  const key = randomUUID().slice(0, 8);
  const other = await prisma.user.create({
    data: { username: `other-${key}`, name: "Other", email: `other-${key}@example.com` },
  });
  const otherHub = await prisma.hub.create({
    data: { ownerUserId: other.id, handle: `other-${key}` },
  });
  const source = await prisma.collection.create({
    data: { hubId, title: "Reference permissions" },
  });
  const privateTarget = await prisma.collection.create({
    data: { hubId, title: "Private target", published: false },
  });
  const publicTarget = await prisma.collection.create({
    data: { hubId, title: "Readable target" },
  });
  const held = await prisma.collection.create({ data: { hubId, title: "Held target" } });
  await prisma.collectionHold.create({
    data: { collectionId: held.id, reason: "spam", actorUserId: owner.userId },
  });
  const foreign = await prisma.collection.create({
    data: { hubId: otherHub.id, title: "Foreign target" },
  });
  const targets = [privateTarget, publicTarget, held, foreign];
  await prisma.resource.createMany({
    data: targets.map((target, position) => ({
      collectionId: source.id,
      kind: "collection_link",
      linkedCollectionId: target.id,
      titleOverride: "Stored sensitive title",
      position,
    })),
  });
  await prisma.resource.create({
    data: {
      collectionId: source.id,
      kind: "collection_link",
      linkedCollectionId: null,
      position: 4,
    },
  });
  await prisma.resource.create({
    data: {
      collectionId: publicTarget.id,
      kind: "collection_link",
      linkedCollectionId: privateTarget.id,
      position: 0,
    },
  });
  const page = await resources.getByCollection(source.id, null, undefined, {});
  expect(page.items[1].linkedCollection?.id).toBe(publicTarget.id);
  for (const index of [0, 2, 3, 4])
    expect(page.items[index]).toMatchObject({
      title: null,
      linkedCollectionId: null,
      linkedCollection: null,
    });
  for (const expand of [false, true]) {
    const exported = await exportsService.export(
      { userId: other.id },
      { format: "markdown", collectionIds: [source.id], expand },
    );
    const body = exported.body.toString();
    expect(body).toContain("Readable target");
    for (const target of [privateTarget, held, foreign]) {
      expect(body).not.toContain(target.title);
      expect(body).not.toContain(target.id);
    }
    expect(body).not.toContain("Stored sensitive title");
    expect(body).toContain("Collection unavailable");
  }
  // A transfer invalidates an old same-owner reference even when both remain public.
  await prisma.collection.update({ where: { id: publicTarget.id }, data: { hubId: otherHub.id } });
  expect(
    (await resources.getByCollection(source.id, owner, undefined, {})).items[1].linkedCollectionId,
  ).toBeNull();
});

it("pages each thread independently with tied timestamps and moderator visibility", async () => {
  const collection = await prisma.collection.create({ data: { hubId, title: "Reply partitions" } });
  const questions = await prisma.collectionComment.createManyAndReturn({
    data: [0, 1, 2].map((i) => ({
      collectionId: collection.id,
      authorUserId: owner.userId,
      body: `Question ${i}`,
      state: i === 2 ? "deleted" : "visible",
    })),
  });
  const rows: CollectionComment[][] = [];
  const createdAt = new Date("2026-01-01T00:00:00.000Z");
  for (const question of questions) {
    const replies = await prisma.collectionComment.createManyAndReturn({
      data: Array.from({ length: 105 }, (_, i) => ({
        collectionId: collection.id,
        parentId: question.id,
        authorUserId: owner.userId,
        body: `Reply ${i}`,
        createdAt,
        accepted: i === 104,
        state: i === 2 ? "hidden" : i === 3 ? "deleted" : "visible",
      })),
    });
    rows.push(replies);
  }
  for (const viewer of [null, owner]) {
    const first = await comments.list(collection.id, viewer, undefined, {});
    expect(first.data.comments).toHaveLength(3);
    for (let i = 0; i < questions.length; i++) {
      const question = questions[i];
      const thread = first.data.comments.find((row) => row.id === question.id);
      if (!thread?.repliesNextCursor) throw new Error("Missing reply continuation");
      expect(thread.replies).toHaveLength(100);
      expect(thread.replies[0].accepted).toBe(true);
      if (i === 2) expect(thread.body).toBeNull();
      const next = await comments.list(collection.id, viewer, undefined, {
        replyTo: question.id,
        replyCursor: thread.repliesNextCursor,
      });
      const continued = next.data.comments.find((row) => row.id === question.id);
      if (!continued) throw new Error("Missing continued thread");
      expect(continued.replies[0].id).toBe(thread.replies[0].id);
      expect(continued.repliesNextCursor).toBeNull();
      const ordinary = [...thread.replies, ...continued.replies]
        .filter((row) => !row.accepted)
        .map((row) => row.id);
      const expected = rows[i]
        .filter(
          (row) => !row.accepted && (row.state === "visible" || (viewer && row.state === "hidden")),
        )
        .map((row) => row.id)
        .sort();
      expect(ordinary).toEqual(expected);
      for (const other of first.data.comments.filter((row) => row.id !== question.id))
        expect(next.data.comments.find((row) => row.id === other.id)).toEqual(other);
    }
  }
});
