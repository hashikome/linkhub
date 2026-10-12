"use client";

import { usePathname } from "next/navigation";

export function SiteFooter({ signedIn }: { signedIn: boolean }) {
  const pathname = usePathname();
  const about = pathname === "/about";
  const label = about ? (signedIn ? "Discover" : "Join ntumie.") : "About ntumie.";
  const href = about ? (signedIn ? "/discover" : "/sign-up") : "/about";
  return (
    <footer className="site-footer">
      <div className="shell footer-content">
        <nav aria-label="Footer" className="footer-nav">
          <a href={href}>{label}</a>
        </nav>
        {pathname !== "/" && !about && (
          <p className="footer-tagline">Good links belong together.</p>
        )}
      </div>
    </footer>
  );
}
