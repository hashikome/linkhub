// Persisted tags contain normalized spaces, never line breaks. Punctuation is
// literal, so an untouched tag survives editing any other field in the row.
export const formatImportTags = (tags: string[]) => tags.join("\n");
export const parseImportTags = (value: string | null) =>
  (value ?? "")
    .split(/\r\n|\r|\n/)
    .map((tag) => tag.trim())
    .filter(Boolean);
