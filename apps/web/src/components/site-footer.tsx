"use client";

import { usePathname } from "next/navigation";

export function SiteFooter({ signedIn }: { signedIn: boolean }) {
  const pathname = usePathname();
  const about = pathname === "/about";
  const showLink = !about || !signedIn;
  const label = about ? "Join ntumie." : "About ntumie.";
  const href = about ? "/sign-up" : "/about";
  return (
    <footer className="site-footer">
      <div className="shell footer-content">
        {showLink && (
          <nav aria-label="Footer" className="footer-nav">
            <a href={href}>{label}</a>
          </nav>
        )}
      </div>
    </footer>
  );
}
