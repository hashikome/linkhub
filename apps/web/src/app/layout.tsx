import { webServerConfig } from "@ntumie/config/web-server";
import type { Metadata } from "next";
import localFont from "next/font/local";
import type { ReactNode } from "react";
import { ApiOriginProvider } from "../components/api-origin";
import { AppNavigation } from "../components/app-navigation";
import { FocusMode } from "../components/focus-mode";
import { ResourceNavigationProvider } from "../components/resource-navigation";
import { RouteCodePreload } from "../components/route-code-preload";
import { SessionNav } from "../components/session-nav";
import { SiteFooter } from "../components/site-footer";
import { TimeZoneProvider } from "../components/time-zone";
import { readResourceNewTab } from "../lib/device-preferences";
import { routeChunksUrl } from "../lib/route-chunks-server";
import { readOwnProfile, readSession } from "../lib/session";
import { readTheme } from "../lib/theme";
import "./globals.css";

// Self-hosted brand face (OFL-1.1, see src/fonts/OFL.txt): the product looks the
// same on every OS and makes no third-party font request.
const brandFont = localFont({
  src: "../fonts/schibsted-grotesk-latin-wght-normal.woff2",
  weight: "400 900",
  variable: "--font-brand",
  display: "swap",
});

export const metadata: Metadata = {
  title: { default: "ntumie.", template: "%s · ntumie." },
  description: "Useful links, collected and shared.",
  referrer: "strict-origin",
  robots: { index: false, follow: false },
};
export default async function Layout({ children }: { children: ReactNode }) {
  const [session, profile, savedTheme, resourceNewTab] = await Promise.all([
    readSession(),
    readOwnProfile(),
    readTheme(),
    readResourceNewTab(),
  ]);
  const { authOrigin, publicOrigin } = webServerConfig();
  const theme = session ? savedTheme : "system";
  return (
    <html
      lang="en"
      data-api-origin={authOrigin}
      data-theme={theme}
      data-session={session?.userId ?? ""}
      className={brandFont.variable}
    >
      <body>
        <ApiOriginProvider origin={authOrigin}>
          <ResourceNavigationProvider initialNewTab={resourceNewTab} publicOrigin={publicOrigin}>
            <TimeZoneProvider
              key={session?.userId ?? "reader"}
              initialTimeZone={session ? (profile?.timeZone ?? null) : null}
            >
              <a className="skip-link" href="#main">
                Skip to content
              </a>
              <header className="topbar">
                <nav aria-label="Main navigation" className="shell">
                  <a
                    className="wordmark"
                    href={
                      session && profile ? (profile.hubId ? `/h/${profile.hubId}` : "/hub") : "/"
                    }
                  >
                    ntumie.
                  </a>
                  <div className="primary-nav">
                    <a href="/discover">Discover</a>
                    <SessionNav session={session} />
                  </div>
                </nav>
              </header>
              {/* biome-ignore lint/a11y/noNoninteractiveTabindex: Main is the keyboard skip-link target. */}
              <main id="main" aria-label="Main content" tabIndex={0} className="shell">
                <FocusMode />
                <AppNavigation theme={theme} />
                <RouteCodePreload manifest={routeChunksUrl()} />
                {children}
              </main>
              <SiteFooter signedIn={Boolean(session)} />
            </TimeZoneProvider>
          </ResourceNavigationProvider>
        </ApiOriginProvider>
      </body>
    </html>
  );
}
