// Saved links must be reachable on the public web by anyone they are shared
// with. A host fails when it is an IP literal, a single label ("localhost",
// "intranet"), a private or local name, or a name reserved for examples and
// testing (RFC 2606 / RFC 6761). Shared by the API (authoritative) and the web
// form (early feedback).
const localSuffixes = [
  "localhost",
  "local",
  "internal",
  "intranet",
  "lan",
  "home.arpa",
  "test",
  "invalid",
  "example",
  "onion",
];
const reservedNames = ["example.com", "example.net", "example.org"];

export function isPublicLinkHost(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/\.$/, "");
  if (!host || host.startsWith("[") || /^[\d.]+$/.test(host) || host.includes(":")) return false;
  const labels = host.split(".");
  const tld = labels[labels.length - 1];
  if (labels.length < 2 || !/^(?:[a-z]{2,63}|xn--[a-z0-9-]{1,59})$/.test(tld)) return false;
  const under = (suffix: string) => host === suffix || host.endsWith(`.${suffix}`);
  return !localSuffixes.some(under) && !reservedNames.some(under);
}

// Recognition is only a hint. The API resolves the address and authorizes any
// conversion to an owner-scoped reference. Query strings never grant access.
export function collectionAddress(
  value: string,
  origin: string,
): { id: string } | { handle: string; slug: string } | null {
  try {
    const url = new URL(value);
    if (url.origin !== new URL(origin).origin || url.username || url.password) return null;
    const path = decodeURIComponent(url.pathname);
    const durable =
      /^\/c\/([a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12})\/?$/i.exec(path);
    if (durable) return { id: durable[1].toLowerCase() };
    const pretty = /^\/@([a-z0-9][a-z0-9-]*)\/([a-z0-9-]{2,120})\/?$/.exec(path);
    return pretty ? { handle: pretty[1], slug: pretty[2] } : null;
  } catch {
    return null;
  }
}
