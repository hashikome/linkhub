import type { ReactNode } from "react";

export function OperatorTableRegion({ label, children }: { label: string; children: ReactNode }) {
  return (
    // biome-ignore lint/a11y/noNoninteractiveTabindex: A scrollable table region needs keyboard focus for Page Up/Down and End.
    <section className="ops-table-scroll" aria-label={label} tabIndex={0}>
      {children}
    </section>
  );
}
