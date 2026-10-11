import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { randomUUID } from "node:crypto";
import type { CommentThreads, CommentView } from "@linkhub/types";
import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { AppModule } from "../src/app.module";
import { configureApp } from "../src/app.setup";
import { PrismaService } from "../src/database/prisma.service";
import { signInWithCode } from "./fixtures/sign-in";

describe("collection comments", () => {
  let app: INestApplication, prisma: PrismaService;
  type Person = { id: string; email: string; token: string };
  let owner: Person, editor: Person, reader: Person, stranger: Person;
  const server = () => app.getHttpServer();
  const auth = (r: request.Test, who?: Person) =>
    who ? r.set("Authorization", `Bearer ${who.token}`) : r;
  const threads = async (id: string, who?: Person, token?: string, status = 200) =>
    (
      await auth(
        request(server()).get(`/api/v1/collections/${id}/comments${token ? `?s=${token}` : ""}`),
        who,
      ).expect(status)
    ).body.data as CommentThreads;
  const post = (id: string, who: Person, body: object, token?: string) =>
    auth(
      request(server()).post(`/api/v1/collections/${id}/comments${token ? `?s=${token}` : ""}`),
      who,
    ).send(body);
  const act = (comment: string, action: string, who: Person) =>
    auth(request(server()).post(`/api/v1/comments/${comment}/${action}`), who);
  const collection = async (published: boolean) =>
    (
      await auth(request(server()).post("/api/v1/collections"), owner)
        .send({ title: "Talk", published })
        .expect(201)
    ).body.data.id as string;

  beforeAll(async () => {
    const module = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = module.createNestApplication({ bodyParser: false });
    configureApp(app);
    await app.init();
    prisma = app.get(PrismaService);
    const person = async (name: string): Promise<Person> => {
      const email = `${name}-${randomUUID()}@example.com`;
      const r = await signInWithCode(server(), { email, name });
      return { id: r.body.user.id, email, token: r.headers["set-auth-token"] as string };
    };
    owner = await person("owner");
    editor = await person("editor");
    reader = await person("reader");
    stranger = await person("stranger");
  });
  beforeAll(async () => {
    await prisma.requestBudget.deleteMany();
  });
  afterAll(async () => {
    await app.close();
  });

  it("lets signed-in readers discuss a published collection; anyone can reply; contributors are labelled and mark answers", async () => {
    const id = await collection(true);
    await auth(request(server()).post(`/api/v1/collections/${id}/shares`), owner)
      .send({ email: editor.email, role: "contributor" })
      .expect(201);

    const anonymous = await threads(id);
    expect(anonymous).toMatchObject({ comments: [], enabled: true, canComment: false });
    await request(server())
      .post(`/api/v1/collections/${id}/comments`)
      .send({ body: "hi" })
      .expect(401);

    const question = (await post(id, reader, { body: "  Which link first?  " }).expect(201)).body
      .data as CommentView;
    expect(question.body).toBe("Which link first?");
    expect(question.author?.role).toBeNull();
    const helper = (
      await post(id, stranger, { body: "Start with the tutorial.", parentId: question.id }).expect(
        201,
      )
    ).body.data as CommentView;
    const answer = (
      await post(id, owner, { body: "The tutorial, then the book.", parentId: question.id }).expect(
        201,
      )
    ).body.data as CommentView;
    expect(answer.author?.role).toBe("owner");
    const editorReply = (
      await post(id, editor, { body: "Agreed.", parentId: question.id }).expect(201)
    ).body.data as CommentView;
    expect(editorReply.author?.role).toBe("contributor");

    // Replies are one level deep.
    await post(id, reader, { body: "nested", parentId: helper.id }).expect(400);

    // Only owners/editors mark answers; one per question, shown first.
    await act(helper.id, "accept", reader).expect(403);
    await act(helper.id, "accept", editor).expect(200);
    await act(answer.id, "accept", owner).expect(200);
    const after = await threads(id, reader);
    const replies = after.comments[0].replies;
    expect(replies[0].id).toBe(answer.id);
    expect(replies.filter((r) => r.accepted).map((r) => r.id)).toEqual([answer.id]);
    await act(question.id, "accept", owner).expect(400);
  });

  it("follows the collection's own access for private collections, direct shares and share links", async () => {
    const id = await collection(false);
    await threads(id, stranger, undefined, 404);
    await post(id, stranger, { body: "hello" }).expect(404);
    await auth(request(server()).post(`/api/v1/collections/${id}/shares`), owner)
      .send({ email: reader.email, role: "viewer" })
      .expect(201);
    await post(id, reader, { body: "From a direct share" }).expect(201);
    const link = await auth(request(server()).put(`/api/v1/collections/${id}/link-sharing`), owner)
      .send({ enabled: true })
      .expect(200);
    const token = link.body.data.token as string;
    expect((await threads(id, undefined, token)).canComment).toBe(false);
    await post(id, stranger, { body: "Via the shared link" }, token).expect(201);
    expect((await threads(id, owner)).comments.map((c) => c.body)).toEqual([
      "Via the shared link",
      "From a direct share",
    ]);
  });

  it("lets authors edit and delete, moderators hide, and respects the comments switch", async () => {
    const id = await collection(true);
    const mine = (await post(id, reader, { body: "first draft" }).expect(201)).body
      .data as CommentView;
    await auth(request(server()).patch(`/api/v1/comments/${mine.id}`), stranger)
      .send({ body: "hijack", version: mine.version })
      .expect(403);
    await auth(request(server()).patch(`/api/v1/comments/${mine.id}`), reader)
      .send({ body: "edited", version: mine.version + 5 })
      .expect(409);
    const edited = (
      await auth(request(server()).patch(`/api/v1/comments/${mine.id}`), reader)
        .send({ body: "edited", version: mine.version })
        .expect(200)
    ).body.data as CommentView;
    expect(edited.editedAt).not.toBeNull();

    await act(mine.id, "hide", stranger).expect(403);
    await act(mine.id, "hide", owner).expect(200);
    expect((await threads(id, stranger)).comments).toEqual([]);
    expect((await threads(id, owner)).comments[0]).toMatchObject({
      state: "hidden",
      body: "edited",
    });
    await act(mine.id, "show", owner).expect(200);

    // A question with replies leaves a placeholder; one without disappears.
    await post(id, stranger, { body: "a reply", parentId: mine.id }).expect(201);
    await auth(request(server()).delete(`/api/v1/comments/${mine.id}`), reader).expect(200);
    const kept = (await threads(id, stranger)).comments[0];
    expect(kept).toMatchObject({ state: "deleted", body: null });
    expect(kept.replies.map((r) => r.body)).toEqual(["a reply"]);
    const solo = (await post(id, reader, { body: "solo" }).expect(201)).body.data as CommentView;
    await auth(request(server()).delete(`/api/v1/comments/${solo.id}`), reader).expect(200);
    expect(await prisma.collectionComment.findUnique({ where: { id: solo.id } })).toBeNull();

    const current = (
      await auth(request(server()).get(`/api/v1/collections/${id}`), owner).expect(200)
    ).body.data;
    await auth(request(server()).patch(`/api/v1/collections/${id}`), owner)
      .send({ commentsEnabled: false, version: current.version })
      .expect(200);
    expect(await threads(id, reader)).toMatchObject({ enabled: false, canComment: false });
    const off = await post(id, reader, { body: "still?" }).expect(403);
    expect(off.body.error.code).toBe("comments_disabled");
  });
  it("pages replies per thread, pins late answers, and keeps hidden/deleted replies out of reader pages", async () => {
    const id = await collection(true);
    const first = await prisma.collectionComment.create({
      data: { collectionId: id, authorUserId: owner.id, body: "Busy question" },
    });
    const second = await prisma.collectionComment.create({
      data: { collectionId: id, authorUserId: owner.id, body: "Quiet question" },
    });
    const base = Date.now() - 1000000;
    await prisma.collectionComment.createMany({
      data: Array.from({ length: 205 }, (_, n) => ({
        collectionId: id,
        parentId: first.id,
        authorUserId: owner.id,
        body: `Reply ${n}`,
        createdAt: new Date(base + n * 1000),
        accepted: n === 204,
        state: n === 50 ? "hidden" : n === 60 ? "deleted" : "visible",
      })),
    });
    const only = await prisma.collectionComment.create({
      data: { collectionId: id, parentId: second.id, authorUserId: owner.id, body: "Only reply" },
    });
    const seen = new Set<string>();
    let cursor: string | null = null;
    let pages = 0;
    do {
      const query = cursor ? `?replyTo=${first.id}&replyCursor=${encodeURIComponent(cursor)}` : "";
      const response = await request(server())
        .get(`/api/v1/collections/${id}/comments${query}`)
        .expect(200);
      const data = response.body.data as CommentThreads;
      expect(data.comments.find((c) => c.id === second.id)?.replies.map((c) => c.id)).toEqual([
        only.id,
      ]);
      const question = data.comments.find((c) => c.id === first.id);
      if (!question) throw new Error("Missing question");
      expect(question.replies.length).toBeLessThanOrEqual(100);
      expect(question.replies[0]).toMatchObject({ accepted: true, body: "Reply 204" });
      for (const reply of question.replies) {
        expect(reply.state).toBe("visible");
        if (!reply.accepted) expect(seen.has(reply.id)).toBe(false);
        seen.add(reply.id);
      }
      cursor = question.repliesNextCursor;
      pages++;
      expect(pages).toBeLessThan(5);
    } while (cursor);
    expect(seen.size).toBe(203);
    expect(pages).toBe(3);
    const initial = await threads(id);
    const continuation = initial.comments.find((c) => c.id === first.id)?.repliesNextCursor;
    if (!continuation) throw new Error("Missing continuation");
    await request(server())
      .get(
        `/api/v1/collections/${id}/comments?replyTo=${second.id}&replyCursor=${encodeURIComponent(continuation)}`,
      )
      .expect(400);
    await prisma.collection.update({ where: { id }, data: { published: false } });
    await request(server())
      .get(
        `/api/v1/collections/${id}/comments?replyTo=${first.id}&replyCursor=${encodeURIComponent(continuation)}`,
      )
      .expect(404);
  });
});
