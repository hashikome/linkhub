import { describe, expect, it, mock } from "bun:test";
import type { PrismaService } from "src/database/prisma.service";
import type { GravatarService } from "./gravatar.service";
import { UserAvatarService } from "./user-avatar.service";

const id = "01923456-789a-7bcd-8ef0-123456789abc";
const fallback = { location: `/api/v1/avatars/${id}.svg` };
const image = { body: Buffer.from("image bytes"), contentType: "image/png" };
const active = {
  email: "reader@example.com",
  emailVerified: true,
  accountState: "active",
  deletionScheduledFor: null as Date | null,
};
function fixture(user: typeof active | null = active) {
  const lookup = mock(async () => user);
  const current = mock(async () => ({ id }) as { id: string } | null);
  const resolve = mock(async (_email: string) => image as typeof image | null);
  const service = new UserAvatarService(
    { user: { findUnique: lookup, findFirst: current } } as unknown as PrismaService,
    { resolve } as unknown as GravatarService,
  );
  return { service, lookup, current, resolve };
}
describe("public account avatar selection", () => {
  it("uses the active person's verified email independently of the viewer", async () => {
    const { service, resolve } = fixture();
    expect(await service.resolve(id)).toEqual(image);
    expect(resolve).toHaveBeenCalledWith(active.email);
  });
  it("does not contact Gravatar for missing or ineligible accounts", async () => {
    for (const user of [
      null,
      { ...active, emailVerified: false },
      { ...active, accountState: "inactive" },
      { ...active, accountState: "suspended" },
      { ...active, deletionScheduledFor: new Date() },
    ]) {
      const { service, resolve } = fixture(user);
      expect(await service.resolve(id)).toEqual(fallback);
      expect(resolve).not.toHaveBeenCalled();
    }
  });
  it("retains the generated icon when no provider image is available", async () => {
    const { service, resolve } = fixture();
    resolve.mockResolvedValueOnce(null);
    expect(await service.resolve(id)).toEqual(fallback);
  });
  it("discards an image if its account or verified email changed during resolution", async () => {
    const { service, current } = fixture();
    current.mockResolvedValueOnce(null);
    expect(await service.resolve(id)).toEqual(fallback);
  });
  it("reads the current email on every request instead of caching a user association", async () => {
    const { service, lookup, resolve } = fixture();
    await service.resolve(id);
    lookup.mockResolvedValueOnce({ ...active, email: "new@example.com" });
    await service.resolve(id);
    expect(resolve.mock.calls.map(([email]) => email)).toEqual([
      "reader@example.com",
      "new@example.com",
    ]);
  });
});
