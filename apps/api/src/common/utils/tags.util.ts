const MAX_TAGS = 30;
const MAX_TAG_LENGTH = 80;

// Tag names are normalized before resolving shared catalogue IDs: trim, lowercase,
// collapse internal whitespace, drop empties, dedup, and cap length and count.
export function normalizeTags(tags: string[] | undefined): string[] {
  if (!tags) {
    return [];
  }
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of tags) {
    const tag = raw.trim().replace(/\s+/g, " ").toLowerCase().slice(0, MAX_TAG_LENGTH).trimEnd();
    if (tag.length === 0 || seen.has(tag)) {
      continue;
    }
    seen.add(tag);
    out.push(tag);
    if (out.length >= MAX_TAGS) {
      break;
    }
  }
  return out;
}
