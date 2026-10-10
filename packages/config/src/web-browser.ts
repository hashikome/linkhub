// The server renders only its validated public API origin, never private config.
export const webBrowserConfig = { apiPath: "/api/v1" } as const;
export function browserApiOrigin(): string {
  return typeof document === "undefined" ? "" : (document.documentElement.dataset.apiOrigin ?? "");
}
