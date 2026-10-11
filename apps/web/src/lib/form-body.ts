export async function readFormData(
  request: Request,
  publicOrigin: string,
  action = "",
): Promise<URLSearchParams> {
  if (
    request.headers.get("origin") !== publicOrigin ||
    request.headers.get("sec-fetch-site") === "cross-site"
  )
    throw new Error("origin");
  if (!request.headers.get("content-type")?.startsWith("application/x-www-form-urlencoded"))
    throw new Error("format");
  // Import edits include up to 30 × 80-character tags, a URL and placement.
  // Percent-encoded Unicode can use nine bytes per BMP character.
  const limit = action === "import-row" ? 64 * 1024 : 16 * 1024;
  const reader = request.body?.getReader();
  let size = 0;
  const chunks: Uint8Array[] = [];
  if (reader)
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > limit) {
        await reader.cancel();
        throw new Error("size");
      }
      chunks.push(value);
    }
  return new URLSearchParams(Buffer.concat(chunks).toString());
}
