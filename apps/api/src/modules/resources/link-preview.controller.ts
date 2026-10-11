import { lookup } from "node:dns/promises";
import { Controller, Get, Query } from "@nestjs/common";
import type { LinkPreview } from "@linkhub/types";
import { appError } from "../../common/errors/app-exception";
import { apiOk } from "../../common/utils/response.util";
import {
  canonicalizeUrl,
  localCollectionAddress,
  publicLinkUrl,
} from "../../common/utils/url.util";
import { PrismaService } from "../../database/prisma.service";
import { fetchPageMetadata, linkTitlesEnabled } from "./page-metadata";

// Looks up a link's title before it is saved, so the save form can show it.
// Available before sign-in, never under the write lock, with its own small request
// budget ("lookup"). Stored metadata answers first; otherwise the page is
// fetched (same SSRF guards as background lookups) and the result kept in the
// shared metadata, so saving the link needs no second fetch. Disabled under
// test unless LINK_TITLES=on.
@Controller("api/v1/link-preview")
export class LinkPreviewController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  async preview(@Query("url") raw: unknown) {
    let url: string;
    try {
      if (typeof raw !== "string" || raw.length > 2048) throw new Error();
      const parsed = new URL(raw);
      if (!["http:", "https:"].includes(parsed.protocol) || parsed.username || parsed.password)
        throw new Error();
      url = canonicalizeUrl(parsed.href);
    } catch {
      throw appError("bad_request");
    }
    if (localCollectionAddress(url))
      return apiOk<LinkPreview>({ url, title: null, status: "found", collectionHint: true });
    url = publicLinkUrl(url);
    const title = linkTitlesEnabled() ? await this.title(url) : null;
    const preview: LinkPreview = {
      url,
      title,
      status: title ? "found" : (await hostMissing(url)) ? "no_domain" : "untitled",
    };
    return apiOk(preview);
  }

  private async title(url: string) {
    const known = await this.prisma.linkMetadata.findUnique({ where: { url } });
    if (known?.state === "ready" && known.title) return known.title;
    const metadata = await fetchPageMetadata(url);
    if (!metadata) return null;
    const ready = { ...metadata, state: "ready", attempts: 0, fetchedAt: new Date() };
    await this.prisma.linkMetadata
      .upsert({ where: { url }, create: { url, ...ready }, update: ready })
      .catch(() => undefined); // A concurrent insert of the same address is fine.
    return metadata.title;
  }
}

// Only a definite "no such host" answer marks a typo; timeouts, blocked sites
// and other failures stay saveable. Hosts here already passed the public-link
// rule, so they are names, never IP literals or reserved test domains.
async function hostMissing(url: string) {
  const host = new URL(url).hostname;
  if (!linkTitlesEnabled()) return false;
  try {
    await Promise.race([
      lookup(host),
      new Promise((_, reject) => setTimeout(() => reject(new Error("slow")), 2000)),
    ]);
    return false;
  } catch (error) {
    return ["ENOTFOUND", "ENODATA"].includes((error as NodeJS.ErrnoException).code ?? "");
  }
}
