import type { ImportSourceKind } from "@ntumie/types";
import { Parser } from "htmlparser2";
import { appError } from "../../common/errors/app-exception";
import { normalizeTags } from "../../common/utils/tags.util";
import { publicLinkUrl } from "../../common/utils/url.util";

// Browser-owned containers are meaningful only at the export boundary.
const browserWrappers = new Set([
  "bookmarks bar",
  "bookmarks toolbar",
  "bookmarks menu",
  "other bookmarks",
  "mobile bookmarks",
  "unfiled bookmarks",
]);

export const IMPORT_BYTES = 10 * 1024 * 1024;
export const IMPORT_ROWS = 5000;
export interface ParsedFolder {
  parent: number | null;
  name: string;
  path: string;
  mode?: "collection" | "section";
}
export interface ParsedRow {
  folder: number;
  address: string;
  tags: string[];
  sourceLocation: string;
}

// A bounded RFC4180 state machine handles quoted commas, escaped quotes and
// embedded newlines. Reject malformed quotes rather than silently shifting URLs.
export function csvRecords(text: string): string[][] {
  const records: string[][] = [];
  let row: string[] = [],
    cell = "",
    quoted = false,
    ended = false;
  const finish = () => {
    row.push(cell);
    cell = "";
    ended = false;
  };
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          cell += '"';
          i++;
        } else {
          quoted = false;
          ended = true;
        }
      } else cell += ch;
    } else if (ch === '"') {
      if (cell || ended) throw appError("invalid_import");
      quoted = true;
    } else if (ch === ",") finish();
    else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      finish();
      if (row.some((v) => v.trim())) records.push(row);
      row = [];
      if (records.length > IMPORT_ROWS + 1) throw appError("invalid_import");
    } else {
      if (ended && ch.trim()) throw appError("invalid_import");
      if (!ended) cell += ch;
    }
    if (cell.length > IMPORT_BYTES || row.length > 100) throw appError("invalid_import");
  }
  if (quoted) throw appError("invalid_import");
  finish();
  if (row.some((v) => v.trim())) records.push(row);
  return records;
}

export function parseImport(kind: ImportSourceKind, input: string) {
  if (Buffer.byteLength(input) > IMPORT_BYTES) throw appError("payload_too_large");
  if (input.includes("\0")) throw appError("invalid_import");
  const text = input.replace(/^\uFEFF/, "");
  const folders: ParsedFolder[] = [{ parent: null, name: "", path: "" }];
  const rows: ParsedRow[] = [];
  function folder(parent: number, name: string) {
    name = name.trim() || "Untitled folder";
    const path = [folders[parent].path, name].filter(Boolean).join(" › ");
    if (name.length > 255 || path.length > 2000 || folders.length >= 1001)
      throw appError("invalid_import");
    folders.push({ parent, name, path });
    return folders.length - 1;
  }
  function add(address: string, folderId: number, tags: string[], sourceLocation: string) {
    if (rows.length >= IMPORT_ROWS || address.length > 8192) throw appError("invalid_import");
    rows.push({
      folder: folderId,
      address: address.trim(),
      tags: normalizeTags(tags),
      sourceLocation,
    });
  }
  if (kind === "text") {
    text.split(/\r\n|\r|\n/).forEach((line, index) => {
      if (line.trim()) add(line, 0, [], `Line ${index + 1}`);
    });
  } else if (kind === "csv") {
    const [header, ...records] = csvRecords(text);
    const keys = header?.map((value) => value.trim().toLowerCase()) ?? [];
    const columns = ["collection", "section", "url", "tags"];
    if (
      keys.length !== columns.length ||
      !columns.every((key) => keys.includes(key)) ||
      new Set(keys).size !== keys.length
    )
      throw appError("invalid_import");
    const collections = new Map<string, number>();
    const sections = new Map<string, number>();
    let lastCollection = "",
      lastSection = "";
    records.forEach((cells, index) => {
      if (cells.length !== keys.length) throw appError("invalid_import");
      const value = (name: string) => (cells[keys.indexOf(name)] ?? "").trim();
      const title = value("collection");
      const sectionTitle = value("section");
      const tags = value("tags")
        .split(";")
        .map((tag) => tag.trim())
        .filter(Boolean);
      if (
        !title ||
        title.length > 255 ||
        sectionTitle.length > 255 ||
        tags.length > 30 ||
        tags.some((tag) => tag.length > 80)
      )
        throw appError("invalid_import");
      const key = title;
      let parent = collections.get(key);
      if (parent !== undefined && lastCollection !== key) throw appError("invalid_import");
      lastCollection = key;
      if (parent === undefined) {
        parent = folder(0, title);
        folders[parent].mode = "collection";
        collections.set(key, parent);
      }
      if (!sectionTitle && [...sections.keys()].some((key) => key.startsWith(`${parent}:`)))
        throw appError("invalid_import");
      if (sectionTitle) {
        const sectionKey = `${parent}:${sectionTitle}`;
        let section = sections.get(sectionKey);
        if (section !== undefined && lastSection !== sectionKey) throw appError("invalid_import");
        lastSection = sectionKey;
        if (section === undefined) {
          section = folder(parent, sectionTitle);
          sections.set(sectionKey, section);
        }
        parent = section;
      }
      add(value("url"), parent, tags, `CSV record ${index + 2}`);
    });
  } else {
    const stack = [0];
    let heading: string | null = null,
      pending: string | null = null,
      browserWrapper = false;
    const parser = new Parser(
      {
        onopentag(name, attrs) {
          if (name === "h3") {
            heading = "";
            browserWrapper = attrs.personal_toolbar_folder === "true";
          }
          if (name === "dl") {
            if (stack.length > 64) throw appError("invalid_import");
            stack.push(
              pending === null ||
                (stack[stack.length - 1] === 0 &&
                  (browserWrapper || browserWrappers.has(pending.toLowerCase())))
                ? stack[stack.length - 1]
                : folder(stack[stack.length - 1], pending),
            );
            pending = null;
            browserWrapper = false;
          }
          if (name === "a")
            add(
              attrs.href ?? "",
              stack[stack.length - 1],
              (attrs.tags ?? "").split(","),
              `Bookmark ${rows.length + 1}`,
            );
        },
        ontext(value) {
          if (heading !== null) heading += value;
        },
        onclosetag(name) {
          if (name === "h3") {
            pending = heading;
            heading = null;
          }
          if (name === "dl" && stack.length > 1) stack.pop();
        },
      },
      { decodeEntities: true },
    );
    parser.end(text);
    // Use source content, not lookup outcomes, so partial commits never change
    // the shape. Empty folders add no value; unary collection wrappers disappear.
    const direct = new Set(rows.map((row) => row.folder));
    const keep = new Set([0]);
    for (const row of rows) {
      let index: number | null = row.folder;
      while (index !== null) {
        keep.add(index);
        index = folders[index].parent;
      }
    }
    const children = (index: number) =>
      [...keep].filter((child) => folders[child].parent === index);
    for (const index of keep)
      folders[index].mode =
        index === 0 || folders[index].parent === 0 || children(index).length
          ? "collection"
          : "section";
    for (const index of [...keep].sort((a, b) => b - a)) {
      const nested = children(index);
      if (
        index !== 0 &&
        !direct.has(index) &&
        nested.length === 1 &&
        folders[nested[0]].mode === "collection"
      ) {
        folders[nested[0]].parent = folders[index].parent;
        keep.delete(index);
      }
    }
    const indices = [...keep].sort((a, b) => a - b);
    const translated = new Map(indices.map((original, index) => [original, index]));
    const translatedIndex = (index: number) => {
      const result = translated.get(index);
      if (result === undefined) throw appError("invalid_import");
      return result;
    };
    const compact = indices.map((index) => ({
      ...folders[index],
      parent:
        folders[index].parent === null ? null : translatedIndex(folders[index].parent as number),
    }));
    for (const item of compact)
      item.path =
        item.parent === null
          ? ""
          : [compact[item.parent].path, item.name].filter(Boolean).join(" › ");
    for (const row of rows) row.folder = translatedIndex(row.folder);
    folders.splice(0, folders.length, ...compact);
  }
  if (!rows.length) throw appError("invalid_import");
  return { folders, rows };
}

export function importAddress(address: string): { url: string | null; failure: string | null } {
  if (address.length > 2048) return { url: null, failure: "url_too_long" };
  if ([...address].some((char) => char.charCodeAt(0) <= 32 || char.charCodeAt(0) === 127))
    return { url: null, failure: "invalid_address" };
  try {
    const parsed = new URL(address);
    if (
      !["http:", "https:"].includes(parsed.protocol) ||
      parsed.username ||
      parsed.password ||
      parsed.port
    )
      return { url: null, failure: "invalid_address" };
    const url = publicLinkUrl(address);
    return url.length > 2048 ? { url: null, failure: "url_too_long" } : { url, failure: null };
  } catch {
    return { url: null, failure: "invalid_or_private_address" };
  }
}
