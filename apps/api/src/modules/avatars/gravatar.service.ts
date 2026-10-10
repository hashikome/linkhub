import { createHash } from "node:crypto";
import { Injectable } from "@nestjs/common";

export type AvatarImage = { body: Buffer; contentType: string };
const MAX_BYTES = 256 * 1024;
const MAX_ENTRIES = 128;

function imageType(bytes: Buffer): string | null {
  if (bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])))
    return "image/png";
  if (bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255) return "image/jpeg";
  if (["GIF87a", "GIF89a"].includes(bytes.subarray(0, 6).toString())) return "image/gif";
  if (bytes.subarray(0, 4).toString() === "RIFF" && bytes.subarray(8, 12).toString() === "WEBP")
    return "image/webp";
  return null;
}

@Injectable()
export class GravatarService {
  private readonly cache = new Map<string, { expires: number; image: AvatarImage | null }>();
  private readonly pending = new Map<string, Promise<AvatarImage | null>>();

  async resolve(email: string): Promise<AvatarImage | null> {
    const hash = createHash("sha256").update(email.trim().toLowerCase()).digest("hex");
    const cached = this.cache.get(hash);
    if (cached && cached.expires > Date.now()) return cached.image;
    const pending = this.pending.get(hash);
    if (pending) return pending;
    // Avoid unbounded concurrent upstream work even for authenticated callers.
    if (this.pending.size >= 16) return null;
    const task = this.load(hash).finally(() => this.pending.delete(hash));
    this.pending.set(hash, task);
    return task;
  }

  private async load(hash: string): Promise<AvatarImage | null> {
    let image: AvatarImage | null = null;
    let ttl = 60_000;
    try {
      const response = await fetch(`https://gravatar.com/avatar/${hash}?s=128&d=404&r=g`, {
        // Allow cold DNS/TLS connections on higher-latency networks while
        // bounding the entire image transfer, including response-body reads.
        signal: AbortSignal.timeout(5000),
        redirect: "error",
        headers: { Accept: "image/png,image/jpeg,image/webp,image/gif" },
      });
      if (response.status === 404) ttl = 15 * 60_000;
      const contentType = response.headers.get("content-type")?.split(";")[0].trim();
      if (
        response.ok &&
        response.body &&
        ["image/png", "image/jpeg", "image/webp", "image/gif"].includes(contentType ?? "") &&
        Number(response.headers.get("content-length") ?? 0) <= MAX_BYTES
      ) {
        const reader = response.body.getReader();
        const chunks: Uint8Array[] = [];
        let length = 0;
        try {
          while (true) {
            const chunk = await reader.read();
            if (chunk.done) break;
            length += chunk.value.byteLength;
            if (length > MAX_BYTES) throw new Error("Avatar too large");
            chunks.push(chunk.value);
          }
          const body = Buffer.concat(chunks);
          const type = imageType(body);
          if (type && type === contentType) {
            image = { body, contentType: type };
            ttl = 60 * 60_000;
          }
        } finally {
          await reader.cancel().catch(() => undefined);
        }
      } else await response.body?.cancel();
    } catch {
      // An unavailable avatar provider must never prevent account use.
    }
    this.cache.delete(hash);
    if (this.cache.size >= MAX_ENTRIES) {
      const oldest = this.cache.keys().next().value;
      if (oldest) this.cache.delete(oldest);
    }
    this.cache.set(hash, { image, expires: Date.now() + ttl });
    return image;
  }
}
