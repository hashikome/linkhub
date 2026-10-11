import { expect, it } from "bun:test";
import type { IncomingMessage } from "node:http";
import { webServerConfig } from "@linkhub/config/web-server";
import { sourceAttribution } from "../server/source";

it("attributes untrusted sockets and stops forwarding at the first untrusted hop", () => {
  const attribute = sourceAttribution("synthetic-source-secret", ["10.0.0.0/24"]);
  const source = (remoteAddress: string, forwarded: string) => {
    const proof = attribute({
      socket: { remoteAddress },
      headers: { "x-forwarded-for": forwarded },
    } as unknown as IncomingMessage);
    return JSON.parse(Buffer.from(proof.split(".")[0], "base64url").toString())[1];
  };
  expect(source("192.0.2.1", "198.51.100.1")).toBe("192.0.2.1");
  expect(source("10.0.0.1", "198.51.100.1, 192.0.2.1")).toBe("192.0.2.1");
  expect(source("10.0.0.1", "192.0.2.1, 10.0.0.2")).toBe("192.0.2.1");
  for (const proxies of ["*", "loopback", "127.0.0.1/33"]) {
    expect(() =>
      webServerConfig({ WEB_SOURCE_SECRET: "s".repeat(32), WEB_TRUSTED_PROXY_CIDRS: proxies }),
    ).toThrow();
  }
});
