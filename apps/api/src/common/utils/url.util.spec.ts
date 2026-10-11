import { describe, expect, it } from "bun:test";
import { collectionAddress, isPublicLinkHost } from "@nslinkhub/types";
import { publicLinkUrl } from "./url.util";

describe("public link addresses", () => {
  it("accepts names on the public web", () => {
    for (const host of ["youtu.be", "www.dicebear.com", "sub.domain.co.tz", "xn--80ak6aa92e.com"])
      expect(isPublicLinkHost(host)).toBe(true);
  });

  it("refuses local, private, IP and example addresses", () => {
    for (const host of [
      "localhost",
      "intranet",
      "app.localhost",
      "printer.local",
      "db.internal",
      "router.lan",
      "nas.home.arpa",
      "site.test",
      "typo.invalid",
      "docs.example",
      "example.com",
      "www.example.org",
      "example.net",
      "127.0.0.1",
      "10.0.0.8",
      "93.184.216.34",
      "[::1]",
      "::1",
    ])
      expect(isPublicLinkHost(host)).toBe(false);
  });

  it("returns the canonical public address or refuses it", () => {
    expect(publicLinkUrl("https://YouTu.be/abc?utm_source=x")).toBe("https://youtu.be/abc");
    expect(() => publicLinkUrl("http://localhost:8085/notebook/")).toThrow();
  });
});

describe("collection address recognition", () => {
  const origin = "https://links.fixture-links.dev";
  const id = "01990000-0000-7000-8000-000000000001";
  it("recognizes durable and pretty routes only at the configured origin", () => {
    expect(collectionAddress(`${origin}/c/${id}?s=not-authority#item`, origin)).toEqual({ id });
    expect(collectionAddress(`${origin}/@reader/my-guide`, origin)).toEqual({
      handle: "reader",
      slug: "my-guide",
    });
    for (const url of [
      `https://links.fixture-links.dev.evil.dev/c/${id}`,
      `http://links.fixture-links.dev/c/${id}`,
      `${origin}:8443/c/${id}`,
      `https://person@links.fixture-links.dev/c/${id}`,
      `${origin}/c/${id}/edit`,
      `${origin}/c/not-an-id`,
      `${origin}/capture`,
    ])
      expect(collectionAddress(url, origin)).toBeNull();
  });
});
