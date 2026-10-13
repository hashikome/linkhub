// Layouts above a page (account shell, Manage tabs, Settings) read the session,
// profile, notification count, appearance and device cookies. Only these actions
// cannot change any of them, so their continuation skips the full-tree refresh.
const pageOnlyActions = new Set(["manage-search", "share-create", "share-open", "capture-save"]);
const layoutCookie = /^(?:__Secure-)?(?:better-auth\.session_token|appearance|resource_same_tab)=/;

// Keep the server's original status/cookies for native clients. Interactive
// clients receive the destination without fetch following it (or losing cookies).
export function formNavigationResponse(request: Request, response: Response, action?: string) {
  if (request.headers.get("X-Form-Navigation") !== "1") return response;
  const location = response.headers.get("Location");
  if (response.status < 300 || response.status >= 400 || !location) return response;
  const refresh =
    !(action && pageOnlyActions.has(action)) ||
    response.headers.getSetCookie().some((cookie) => layoutCookie.test(cookie));
  const headers = new Headers(response.headers);
  headers.delete("Location");
  headers.delete("Content-Length");
  headers.set("Content-Type", "application/json");
  return Response.json({ redirect: location, refresh }, { headers });
}
