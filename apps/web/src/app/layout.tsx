import { webServerConfig } from "@nslinkhub/config/web-server";
import type { Metadata } from "next";
import localFont from "next/font/local";
import type { ReactNode } from "react";
import { ApiOriginProvider } from "../components/api-origin";
import { FocusMode } from "../components/focus-mode";
import { FreshDocument } from "../components/fresh-document";
import { SessionNav } from "../components/session-nav";
import { ShareAction } from "../components/share-action";
import { TimeZoneProvider } from "../components/time-zone";
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
  title: { default: "nslinkhub", template: "%s · nslinkhub" },
  description: "Useful links, collected and shared.",
  referrer: "strict-origin",
  robots: { index: false, follow: false },
};
export default async function Layout({ children }: { children: ReactNode }) {
  const [session, profile, savedTheme, readerTheme] = await Promise.all([
    readSession(),
    readOwnProfile(),
    readTheme(),
    readTheme("reader_appearance"),
  ]);
  const { authOrigin } = webServerConfig();
  const theme = session ? savedTheme : readerTheme;
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
                  href={session && profile ? (profile.hubId ? `/h/${profile.hubId}` : "/hub") : "/"}
                >
                  nslinkhub
                </a>
                <div className="primary-nav">
                  <a href="/discover">Discover</a>
                  <SessionNav session={session} theme={theme} />
                </div>
              </nav>
            </header>
            {/* biome-ignore lint/a11y/noNoninteractiveTabindex: Main is the keyboard skip-link target. */}
            <main id="main" aria-label="Main content" tabIndex={0} className="shell">
              <FocusMode />
              <FreshDocument />
              {children}
            </main>
            <footer className="site-footer">
              <div className="shell footer-content">
                <div className="footer-identity">
                  <p className="footer-brand">© {new Date().getFullYear()} nslinkhub</p>
                  <p className="footer-series">an ns series product</p>
                </div>
                <nav aria-label="Footer" className="footer-nav">
                  <ShareAction
                    target={{ kind: "site" }}
                    returnTo="/"
                    label="Share nslinkhub"
                    className=""
                  />
                  <a href="/support">Support</a>
                </nav>
              </div>
            </footer>
          </TimeZoneProvider>
        </ApiOriginProvider>
      </body>
    </html>
  );
}
