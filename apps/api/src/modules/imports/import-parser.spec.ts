import { describe, expect, it } from "bun:test";
import { csvRecords, IMPORT_ROWS, importAddress, parseImport } from "./import-parser";

describe("reviewed import parsing", () => {
  it("parses the product CSV layout, including quoted cells and normalized tags", () => {
    const result = parseImport(
      "csv",
      '\uFEFFcollection,section,url,tags\r\nWeb,"HTML ""reference""\nnotes","https://fixture-links.dev/a?x=1,2", Tool ; CSS ;tool\r\n',
    );
    expect(result.rows).toEqual([
      {
        address: "https://fixture-links.dev/a?x=1,2",
        folder: 2,
        tags: ["tool", "css"],
        sourceLocation: "CSV record 2",
      },
    ]);
    expect(result.folders.map((f) => f.name)).toEqual(["", "Web", 'HTML "reference"\nnotes']);
    expect(result.folders[1].mode).toBe("collection");
    expect(() => csvRecords('url,title\n"broken,title')).toThrow();
  });
  it("accepts flat collections with empty sections and tags", () => {
    const result = parseImport(
      "csv",
      "collection,section,url,tags\nReading,,https://fixture-links.dev/a,\nReading,,https://fixture-links.dev/b,reference",
    );
    expect(result.folders.map((f) => f.name)).toEqual(["", "Reading"]);
    expect(result.rows.map((r) => [r.folder, r.tags])).toEqual([
      [1, []],
      [1, ["reference"]],
    ]);
  });
  it("rejects ambiguous, unsupported and oversized CSV structures", () => {
    const header = "collection,section,url,tags\n";
    for (const file of [
      "url,folder\nhttps://fixture-links.dev/a,Web",
      "collection,section,section_description,url,tags\nWeb,HTML,Description,https://fixture-links.dev/a,",
      "collection,section,url,tags,notes\nWeb,HTML,https://fixture-links.dev/a,,Note",
      "collection,section,url,tags,collection_description\nWeb,HTML,https://fixture-links.dev/a,,Description",
      "collection,section,url,url\nWeb,HTML,https://fixture-links.dev/a,https://fixture-links.dev/b",
      `${header},HTML,https://fixture-links.dev/a,`,
      `${header}Web,HTML,https://fixture-links.dev/a,\nOther,HTML,https://fixture-links.dev/b,\nWeb,HTML,https://fixture-links.dev/c,`,
      `${header}Web,HTML,https://fixture-links.dev/a,\nWeb,CSS,https://fixture-links.dev/b,\nWeb,HTML,https://fixture-links.dev/c,`,
      `${header}Web,HTML,https://fixture-links.dev/a,\nWeb,,https://fixture-links.dev/b,`,
      `${header}${"x".repeat(256)},HTML,https://fixture-links.dev/a,`,
      `${header}Web,${"x".repeat(256)},https://fixture-links.dev/a,`,
      `${header}Web,HTML,https://fixture-links.dev/a,${"x".repeat(81)}`,
    ])
      expect(() => parseImport("csv", file)).toThrow();
  });
  it("reads browser DL/H3 folders, entities and varied attribute quotes without running HTML", () => {
    const result = parseImport(
      "bookmarks",
      `<!DOCTYPE NETSCAPE-Bookmark-file-1><DL><p><DT><H3>Design &amp; tools</H3><DL><p><DT><A HREF='https://fixture-links.dev/a?a=1&amp;b=2'>Ignored</A><DT><H3>Typography</H3><DL><p><DT><A HREF=https://fixture-links.dev/b>Ignored</A></DL><p></DL><p><DT><A HREF="https://fixture-links.dev/root">Root</A></DL><p>`,
    );
    expect(result.folders.map((f) => f.path)).toEqual([
      "",
      "Design & tools",
      "Design & tools › Typography",
    ]);
    expect(result.rows.map((r) => [r.folder, r.address])).toEqual([
      [1, "https://fixture-links.dev/a?a=1&b=2"],
      [2, "https://fixture-links.dev/b"],
      [0, "https://fixture-links.dev/root"],
    ]);
  });
  it("reads text files with BOM, blank lines and common line endings", () => {
    const parsed = parseImport(
      "text",
      "\uFEFFhttps://fixture-links.dev/a\r\n\r\n  https://fixture-links.dev/b  \nhttps://fixture-links.dev/c\rbad\n",
    );
    expect(parsed.folders).toHaveLength(1);
    expect(parsed.rows.map((r) => [r.address, r.sourceLocation])).toEqual([
      ["https://fixture-links.dev/a", "Line 1"],
      ["https://fixture-links.dev/b", "Line 3"],
      ["https://fixture-links.dev/c", "Line 4"],
      ["bad", "Line 5"],
    ]);
    expect(() => parseImport("text", "  \n")).toThrow();
    for (const [kind, input] of [
      ["text", "https://fixture-links.dev/a\nhttps://fixture-links.dev/\0"],
      ["csv", "collection,section,url,tags\nWeb,HTML,https://fixture-links.dev/a,one\0"],
      ["csv", "collection,section,url,tags\nWeb,HTML\0,https://fixture-links.dev/a,one"],
      [
        "bookmarks",
        '<DL><DT><H3>Folder\0</H3><DL><DT><A HREF="https://fixture-links.dev/a">A</A></DL></DL>',
      ],
    ] as const)
      expect(() => parseImport(kind, input)).toThrow();
  });
  it("accepts 5,000 links and rejects 5,001 in each file format", () => {
    expect(IMPORT_ROWS).toBe(5000);
    const addresses = Array.from(
      { length: IMPORT_ROWS + 1 },
      (_, i) => `https://fixture-links.dev/${i}`,
    );
    for (const kind of ["text", "csv", "bookmarks"] as const) {
      const file = (urls: string[]) =>
        kind === "text"
          ? urls.join("\n")
          : kind === "csv"
            ? `collection,section,url,tags\n${urls.map((url) => `Library,,${url},`).join("\n")}`
            : `<!DOCTYPE NETSCAPE-Bookmark-file-1><DL><p><DT><H3>Library</H3><DL><p>${urls.map((url) => `<DT><A HREF="${url}">Link</A>`).join("\n")}</DL><p></DL><p>`;
      expect(parseImport(kind, file(addresses.slice(0, IMPORT_ROWS))).rows).toHaveLength(
        IMPORT_ROWS,
      );
      expect(() => parseImport(kind, file(addresses))).toThrow();
    }
  });
  it("retains invalid rows for repair, bounds inputs and rejects unsafe fetch addresses", () => {
    expect(parseImport("text", "bad\n\nhttps://fixture-links.dev/a").rows).toHaveLength(2);
    expect(() =>
      parseImport(
        "text",
        Array(IMPORT_ROWS + 1)
          .fill("https://fixture-links.dev/a")
          .join("\n"),
      ),
    ).toThrow();
    for (const address of [
      "file:///etc/passwd",
      "http://127.0.0.1",
      "https://user:pass@fixture-links.dev",
      "https://fixture-links.dev:444/a",
      "bad",
    ])
      expect(importAddress(address).url).toBeNull();
    expect(importAddress("https://fixture-links.dev/a?utm_source=x").url).toBe(
      "https://fixture-links.dev/a",
    );
  });
});

it("ignores browser wrappers, preserves custom folders and derives branches versus leaves", () => {
  const result = parseImport(
    "bookmarks",
    `<DL><H3 PERSONAL_TOOLBAR_FOLDER="true">Localized toolbar</H3><DL><A HREF="https://fixture-links.dev/loose">Loose</A><H3>res</H3><DL><H3>Integration</H3><DL><A HREF="https://fixture-links.dev/integration">I</A></DL><H3>links</H3><DL><H3>ai</H3><DL><A HREF="https://fixture-links.dev/ai">A</A></DL><H3>Bookmarks bar</H3><DL><A HREF="https://fixture-links.dev/custom">B</A></DL></DL></DL></DL></DL>`,
  );
  expect(result.folders.map((f) => [f.name, f.mode])).toEqual([
    ["", "collection"],
    ["res", "collection"],
    ["Integration", "section"],
    ["links", "collection"],
    ["ai", "section"],
    ["Bookmarks bar", "section"],
  ]);
  expect(result.rows.map((r) => r.folder)).toEqual([0, 2, 4, 5]);
});

it("collapses single-reference collections recursively but keeps links and sections", () => {
  const tree = (own: string) =>
    `<DL><H3>Outer</H3><DL><H3>res</H3><DL>${own}<H3>links</H3><DL><H3>ai</H3><DL><A HREF="https://fixture-links.dev/a">A</A></DL><H3>tools</H3><DL><A HREF="https://fixture-links.dev/b">B</A></DL></DL><H3>Empty</H3><DL></DL></DL></DL></DL>`;
  const onlyChild = parseImport("bookmarks", tree(""));
  expect(onlyChild.folders.map((f) => [f.name, f.mode])).toEqual([
    ["", "collection"],
    ["links", "collection"],
    ["ai", "section"],
    ["tools", "section"],
  ]);
  expect(onlyChild.rows.map((r) => r.folder)).toEqual([2, 3]);
  const withPending = parseImport("bookmarks", tree('<A HREF="invalid-address">Repair later</A>'));
  expect(withPending.folders.map((f) => f.name)).toEqual(["", "res", "links", "ai", "tools"]);
  const withSection = parseImport(
    "bookmarks",
    tree('<H3>Reading</H3><DL><A HREF="https://fixture-links.dev/c">C</A></DL>'),
  );
  expect(withSection.folders.map((f) => f.name)).toEqual([
    "",
    "res",
    "Reading",
    "links",
    "ai",
    "tools",
  ]);
});
