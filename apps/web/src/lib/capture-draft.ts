import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { type CaptureLink, maxCaptureLinks } from "@nslinkhub/types";
import { captureUrl, isUuid } from "./validation";

export const draftTtl = 1800;
export interface CaptureDraft {
  id: string;
  operationId: string;
  links: CaptureLink[];
  destination: string;
  collectionTitle?: string;
  published?: boolean;
  issued: number;
}
const key = (secret: string) => createHash("sha256").update(`web-capture:${secret}`).digest();
// Drafts live in one cookie. When tags make it too large they are dropped;
// links themselves are kept.
export function fitDraft(draft: CaptureDraft, secret: string): string {
  try {
    return sealDraft(draft, secret);
  } catch {
    return sealDraft({ ...draft, links: draft.links.map(({ url }) => ({ url })) }, secret);
  }
}
export function sealDraft(draft: CaptureDraft, secret: string): string {
  const text = JSON.stringify(draft);
  if (Buffer.byteLength(text) > 2700) throw new Error("draft-size");
  const iv = randomBytes(12),
    cipher = createCipheriv("aes-256-gcm", key(secret), iv);
  const sealed = Buffer.concat([
    iv,
    cipher.update(text),
    cipher.final(),
    cipher.getAuthTag(),
  ]).toString("base64url");
  if (sealed.length > 3800) throw new Error("draft-size");
  return sealed;
}
export function openDraft(
  raw: string,
  id: string,
  secret: string,
  now = Date.now(),
): CaptureDraft | null {
  try {
    if (!isUuid(id) || raw.length > 3800) return null;
    const bytes = Buffer.from(raw, "base64url"),
      decipher = createDecipheriv("aes-256-gcm", key(secret), bytes.subarray(0, 12));
    decipher.setAuthTag(bytes.subarray(-16));
    const draft = JSON.parse(
      Buffer.concat([decipher.update(bytes.subarray(12, -16)), decipher.final()]).toString(),
    );
    if (
      draft.id !== id ||
      !isUuid(draft.operationId) ||
      !Array.isArray(draft.links) ||
      draft.links.length < 1 ||
      draft.links.length > maxCaptureLinks ||
      !draft.links.every(
        (link: CaptureLink) =>
          captureUrl(link?.url) &&
          (link.tags === undefined ||
            (Array.isArray(link.tags) && link.tags.every((tag) => typeof tag === "string"))),
      ) ||
      (draft.published !== undefined && typeof draft.published !== "boolean") ||
      (draft.collectionTitle !== undefined &&
        (typeof draft.collectionTitle !== "string" || draft.collectionTitle.length > 255)) ||
      !Number.isFinite(draft.issued) ||
      draft.issued > now ||
      now - draft.issued >= draftTtl * 1000 ||
      typeof draft.destination !== "string" ||
      (!["first", "new"].includes(draft.destination) && !isUuid(draft.destination))
    )
      return null;
    return draft;
  } catch {
    return null;
  }
}
