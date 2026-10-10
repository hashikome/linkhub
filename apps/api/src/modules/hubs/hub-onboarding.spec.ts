import { describe, expect, it } from "bun:test";
import { accountUsername } from "../users/account-onboarding";
import { ensurePersonalHub } from "./hub-onboarding";

const fakeUsers = (taken: string[] = []) =>
  ({
    $queryRaw: async (_sql: unknown, identity: string) =>
      taken.some((name) => name.replaceAll("-", "") === identity) ? [{ id: "existing" }] : [],
  }) as unknown as Parameters<typeof accountUsername>[0];

describe("separate account and hub defaults", () => {
  it("derives unique usernames from names and excludes app routes", async () => {
    expect(await accountUsername(fakeUsers(), "John Beef")).toBe("john-beef");
    expect(await accountUsername(fakeUsers(["john-beef"]), "John Beef")).toBe("john-beef-2");
    expect(await accountUsername(fakeUsers(["johnbeef"]), "John Beef")).toBe("john-beef-2");
    for (const name of ["Settings", "Home", "Platform", "Manage", "Support", "Share"])
      expect(await accountUsername(fakeUsers(), name)).toBe(`${name.toLowerCase()}-2`);
  });
  it("uses a readable random username when no usable name exists", async () => {
    expect(await accountUsername(fakeUsers(), "")).toMatch(/^[a-z]+-[a-z]+-[a-f0-9]{4}$/);
  });
  it("uses the person's username for a first hub and preserves their full name on a handle collision", async () => {
    let hub: unknown = null;
    const db = {
      hubHandleReservation: {
        findUnique: async ({ where }: { where: { handle: string } }) =>
          where.handle === "john-beef" ? { hubId: "other" } : null,
      },
      user: { findUniqueOrThrow: async () => ({ username: "john-beef", name: "John Beef" }) },
      hub: {
        findUnique: async ({ where }: { where: { ownerUserId?: string; handle?: string } }) =>
          where.ownerUserId ? hub : where.handle === "john-beef" ? { id: "other" } : null,
        create: async ({ data }: { data: unknown }) => {
          hub = data;
          return data;
        },
      },
    } as unknown as Parameters<typeof ensurePersonalHub>[0];
    expect(await ensurePersonalHub(db, "u")).toMatchObject({
      ownerUserId: "u",
      handle: "john-beef-2",
      name: "John Beef",
    });
    expect((await ensurePersonalHub(db, "u")) === hub).toBe(true);
  });
});

it("trims a truncated hub stem before suffixing a colliding handle", async () => {
  const username = `${"a".repeat(54)}-bcdef`;
  const db = {
    hubHandleReservation: {
      findUnique: async ({ where }: { where: { handle: string } }) =>
        where.handle === username ? { hubId: "occupied" } : null,
    },
    user: { findUniqueOrThrow: async () => ({ username, name: "Boundary" }) },
    hub: {
      findUnique: async ({ where }: { where: { handle?: string } }) =>
        where.handle === username ? { id: "occupied" } : null,
      create: async ({ data }: { data: unknown }) => data,
    },
  } as unknown as Parameters<typeof ensurePersonalHub>[0];
  expect(await ensurePersonalHub(db, "person")).toMatchObject({ handle: `${"a".repeat(54)}-2` });
});
