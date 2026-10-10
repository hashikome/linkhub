export interface ExportLink {
  kind: "link";
  title: string;
  url: string;
}

// An explicitly expanded, independently authorized collection reference.
export interface ExportSection {
  kind: "section";
  title: string;
  description?: string;
  links: ExportInline[];
}

export interface ExportHeading {
  kind: "heading";
  title: string;
  description?: string;
}
export interface ExportNotice {
  kind: "notice";
  title: string;
}
export type ExportInline = ExportLink | ExportHeading | ExportNotice;
export type ExportItem = ExportInline | ExportSection;

export interface ExportDocument {
  title: string;
  description?: string;
  items: ExportItem[];
}

export type ExportFormat = "markdown" | "pdf" | "docx";

export const EXPORT_FORMATS: ExportFormat[] = ["markdown", "pdf", "docx"];

export const EXPORT_FILE_EXTENSIONS: Record<ExportFormat, string> = {
  markdown: "md",
  pdf: "pdf",
  docx: "docx",
};

export const EXPORT_CONTENT_TYPES: Record<ExportFormat, string> = {
  markdown: "text/markdown; charset=utf-8",
  pdf: "application/pdf",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
};

export function exportLines(
  document: ExportDocument,
): Array<
  ExportLink | ExportNotice | (ExportHeading & { level: 2 | 3 }) | { kind: "text"; title: string }
> {
  const lines: Array<
    ExportLink | ExportNotice | (ExportHeading & { level: 2 | 3 }) | { kind: "text"; title: string }
  > = [];
  for (const item of document.items) {
    if (item.kind === "section") {
      lines.push({ kind: "heading", title: item.title, level: 2 });
      if (item.description) lines.push({ kind: "text", title: item.description });
      for (const child of item.links) {
        lines.push(child.kind === "heading" ? { ...child, level: 3 } : child);
        if (child.kind === "heading" && child.description)
          lines.push({ kind: "text", title: child.description });
      }
    } else {
      lines.push(item.kind === "heading" ? { ...item, level: 2 } : item);
      if (item.kind === "heading" && item.description)
        lines.push({ kind: "text", title: item.description });
    }
  }
  return lines;
}
