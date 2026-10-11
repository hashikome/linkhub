"use client";

import { usePathname, useSearchParams } from "next/navigation";
export type OpsTab =
  | "imports"
  | "accounts"
  | "people"
  | "collections"
  | "team"
  | "invitations"
  | "analytics"
  | "audit";

export function ManageNavigation({ tabs }: { tabs: [OpsTab, string, string][] }) {
  const pathname = usePathname();
  const query = useSearchParams();
  const review =
    pathname.startsWith("/manage/import-export/") ||
    query.get("tab") === "review" ||
    query.get("tab") === "drafts";
  const current = tabs.find(([key, href]) =>
    key === "accounts"
      ? pathname === "/manage" || pathname.startsWith("/manage/accounts/")
      : pathname === href || pathname.startsWith(`${href}/`),
  );
  const links = tabs.map(([key, href, label]) =>
    key === "imports" ? (
      <details key={key} className="manage-nav-section" open={current?.[0] === key}>
        <summary data-active={current?.[0] === key ? "true" : undefined}>{label}</summary>
        <nav aria-label="Import" className="manage-subnav">
          <a
            href="/manage/import-export"
            aria-current={current?.[0] === key && !review ? "page" : undefined}
          >
            New import
          </a>
          <a
            href="/manage/import-export?tab=review"
            aria-current={current?.[0] === key && review ? "page" : undefined}
          >
            Review
          </a>
        </nav>
      </details>
    ) : (
      <a key={key} href={href} aria-current={key === current?.[0] ? "page" : undefined}>
        {label}
      </a>
    ),
  );
  return (
    <aside className="manage-sidebar">
      <div className="manage-desktop-nav">
        <p className="manage-nav-title">Manage</p>
        <nav aria-label="Manage">{links}</nav>
      </div>
      <details className="manage-mobile-nav">
        <summary>Manage{current ? ` · ${current[2]}` : ""}</summary>
        <nav aria-label="Manage">{links}</nav>
      </details>
    </aside>
  );
}
