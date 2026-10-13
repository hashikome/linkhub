// Requests go through the mounted App Router coordinator. Native navigation is
// only a fallback before hydration or when leaving the application.
export const navigationEvent = "ntumie:navigate";
// `refresh` re-renders every layout after a write; reads (GET forms) skip it.
export function navigateInApp(href: string, replace = false, refresh = true) {
  const url = new URL(href, window.location.href);
  if (!/^https?:$/.test(url.protocol)) return;
  const event = new CustomEvent(navigationEvent, {
    detail: { href, replace, refresh },
    cancelable: true,
  });
  if (window.dispatchEvent(event)) {
    if (replace) window.location.replace(href);
    else window.location.assign(href);
  }
}
export function refreshInApp() {
  navigateInApp(
    `${window.location.pathname}${window.location.search}${window.location.hash}`,
    true,
  );
}

export function isAppUrl(url: URL, origin: string) {
  return (
    url.origin === origin &&
    !/^\/(?:api|forms|_next)(?:\/|$)/.test(url.pathname) &&
    url.pathname !== "/sign-in/complete" &&
    url.pathname !== "/manage/audit/more"
  );
}
