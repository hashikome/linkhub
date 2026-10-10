import type { ReactNode } from "react";

export function CollectionSidebar({
  summary,
  children,
}: {
  summary: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="reader-side">
      <div className="sidebar-summary">{summary}</div>
      {children}
    </div>
  );
}
