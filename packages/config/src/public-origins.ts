// Public addresses only. Internal service addresses and secrets never belong here.
export function publicOrigins(env: Record<string, string | undefined>) {
  const parse = (value: string, name: string) => {
    const url = new URL(value);
    if (
      !/^https?:$/.test(url.protocol) ||
      url.username ||
      url.password ||
      url.pathname !== "/" ||
      url.search ||
      url.hash
    )
      throw new Error(`${name} must be a bare HTTP(S) origin`);
    return url;
  };
  const api = parse(env.BETTER_AUTH_URL || "http://localhost:4000", "BETTER_AUTH_URL");
  const web = parse(env.WEB_ORIGIN || env.BETTER_AUTH_URL || "http://localhost:3000", "WEB_ORIGIN");
  // Host-only cookies must reach both the API and server-rendered web pages.
  if (api.hostname !== web.hostname || api.protocol !== web.protocol)
    throw new Error("WEB_ORIGIN and BETTER_AUTH_URL must share a hostname and scheme");
  return { authOrigin: api.origin, webOrigin: web.origin };
}
