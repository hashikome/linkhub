import { refreshSourceAttribution } from "../../server/source";

// Input must be server request headers stamped by apps/web/server.ts, never
// browser form fields. The API independently verifies the signatures.
export function visitorHeaders(incoming: Headers, outgoing: HeadersInit, secret: string): Headers {
  const headers = new Headers(outgoing);
  for (const purpose of ["read", "form"] as const) {
    const name = `x-web-${purpose}-source`;
    const proof = incoming.get(name);
    if (!proof) throw new Error("Web server source attribution is missing");
    headers.set(name, refreshSourceAttribution(proof, secret, purpose));
  }
  return headers;
}
