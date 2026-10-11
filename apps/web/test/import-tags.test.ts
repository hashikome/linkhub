import { expect, it } from "bun:test";
import { formatImportTags, parseImportTags } from "../src/lib/import-tags";

it("round-trips stored tags literally, including commas, semicolons, quotes and Unicode", () => {
  const tags = ["research, notes", "reading", 'a "quoted" tag', "one;two", "café", "日本語"];
  expect(parseImportTags(formatImportTags(tags))).toEqual(tags);
  expect(parseImportTags(formatImportTags(tags).replaceAll("\n", "\r\n"))).toEqual(tags);
  expect(parseImportTags("\n research, notes \n\nreading\n")).toEqual(tags.slice(0, 2));
  expect(parseImportTags("")).toEqual([]);
});
it("leaves length and count validation to the API without silently truncating edits", () => {
  const tags = Array.from({ length: 31 }, (_, i) => `${i}-${"x".repeat(81)}`);
  expect(parseImportTags(formatImportTags(tags))).toEqual(tags);
});
