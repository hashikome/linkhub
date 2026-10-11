import { createHmac, timingSafeEqual } from "node:crypto";
import type { IncomingMessage } from "node:http";
import { isIP } from "node:net";
import proxyaddr from "proxy-addr";

function signSource(source: string, secret: string, purpose: "read" | "form", now: number) {
  const payload = Buffer.from(JSON.stringify([1, source, now])).toString("base64url");
  const signature = createHmac("sha256", secret)
    .update(`web-${purpose}-source:${payload}`)
    .digest("base64url");
  return `${payload}.${signature}`;
}

// Only for request headers overwritten by server.ts. The request may have spent
// longer than the API proof lifetime buffering a body or rendering. Authenticate
// its ingress identity, then start a fresh API lifetime at the outgoing call.
export function refreshSourceAttribution(
  proof: string,
  secret: string,
  purpose: "read" | "form",
  now = Date.now(),
) {
  const invalid = () => new Error("Web server source attribution is invalid");
  if (!secret || proof.length > 512) throw invalid();
  const [payload, signature, extra] = proof.split(".");
  if (!payload || !signature || extra !== undefined) throw invalid();
  const expected = createHmac("sha256", secret)
    .update(`web-${purpose}-source:${payload}`)
    .digest("base64url");
  if (
    Buffer.byteLength(signature) !== Buffer.byteLength(expected) ||
    !timingSafeEqual(Buffer.from(signature), Buffer.from(expected))
  )
    throw invalid();
  const [version, source, issued] = JSON.parse(Buffer.from(payload, "base64url").toString());
  if (
    version !== 1 ||
    typeof source !== "string" ||
    !isIP(source) ||
    !Number.isSafeInteger(issued) ||
    issued > now + 5000
  )
    throw invalid();
  return signSource(source, secret, purpose, now);
}

// Resolve from the socket toward the client, stopping at the first untrusted
// hop. Never accept an arbitrary leftmost forwarding header as the source.
export function sourceAttribution(
  secret: string,
  proxies: string[],
  purpose: "read" | "form" = "read",
) {
  const trust = proxyaddr.compile(proxies);
  return (request: IncomingMessage, now = Date.now()) => {
    const source = proxyaddr(request, trust);
    return signSource(source, secret, purpose, now);
  };
}
