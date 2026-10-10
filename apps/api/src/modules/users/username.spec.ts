import { expect, it } from "bun:test";
import { accountUsername } from "./account-onboarding";
import { hasValidUsernameFormat, suggestUsername, usernameIdentity } from "./username";

function store(taken: string[] = [], alwaysTaken = false) {
  let reads = 0;
  return {
    db: {
      $queryRaw: async (_sql: unknown, identity: string) => {
        reads++;
        return alwaysTaken || taken.some((name) => usernameIdentity(name) === identity)
          ? [{ id: "other" }]
          : [];
      },
    } as unknown as Parameters<typeof suggestUsername>[0],
    reads: () => reads,
  };
}

it("bounds usernames independently of hub handles", () => {
  expect(hasValidUsernameFormat("a".repeat(20))).toBe(true);
  expect(hasValidUsernameFormat("a".repeat(21))).toBe(false);
  expect(hasValidUsernameFormat("a".repeat(2))).toBe(false);
});

it("suggests a stable shortened spelling without treating case as a new input", async () => {
  const input = "somethingverylongwhatwillyoudoaboutthat";
  const { db } = store();
  const candidate = await suggestUsername(db, input);
  expect(candidate).toMatch(/^somethingverylo-[a-z0-9]{4}$/);
  expect(candidate).toHaveLength(20);
  expect(await suggestUsername(db, input.toUpperCase())).toBe(candidate);
  expect(await suggestUsername(db, `${input}different`)).not.toBe(candidate);
  const boundary = await suggestUsername(db, `${"a".repeat(14)}-long-extra-text`);
  expect(boundary).toMatch(/^a{14}-[a-z0-9]{4}$/);
  expect(hasValidUsernameFormat(boundary ?? "")).toBe(true);
});

it("skips occupied identity variants and bounds exhausted searches", async () => {
  const input = "somethingverylongwhatwillyoudoaboutthat";
  const first = await suggestUsername(store().db, input);
  const taken = store([usernameIdentity(first ?? "")]);
  const next = await suggestUsername(taken.db, input);
  expect(next).not.toBe(first);
  expect(hasValidUsernameFormat(next ?? "")).toBe(true);
  expect(taken.reads()).toBe(2);
  const exhausted = store([], true);
  expect(await suggestUsername(exhausted.db, input)).toBeUndefined();
  expect(exhausted.reads()).toBe(20);
  expect(await suggestUsername(taken.db, input, "other")).toBe(first);
});

it("does not suggest rewrites for invalid punctuation or unbounded input", async () => {
  const invalid = store();
  for (const input of [
    "short",
    "a".repeat(256),
    "something.very.long.username",
    "something--very-long-name",
    "-somethingverylongusername",
    "somethingverylongusername-",
    "somethingvérylongusername",
  ]) {
    expect(await suggestUsername(invalid.db, input)).toBeUndefined();
  }
  expect(invalid.reads()).toBe(0);
});

it("keeps long onboarding names and numbered collision suffixes within twenty characters", async () => {
  const long = await accountUsername(store().db, "Something Very Long What Will You Do About That");
  expect(hasValidUsernameFormat(long)).toBe(true);
  expect(long.length).toBeLessThanOrEqual(20);
  const seed = `${"a".repeat(17)}-bc`;
  const suffixed = await accountUsername(store([seed]).db, seed);
  expect(suffixed).toBe(`${"a".repeat(17)}-2`);
  expect(hasValidUsernameFormat(suffixed)).toBe(true);
});
