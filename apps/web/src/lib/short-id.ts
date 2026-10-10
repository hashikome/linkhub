// The final UUID segment is a display hint, not a unique reference. Full IDs
// remain available in the disclosure and are used by every filter and route.
export function shortIds(ids: string[]) {
  return new Map(ids.map((id) => [id, id.split("-").at(-1) ?? id]));
}
