import {
  Controller,
  Get,
  Headers,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Req,
  Res,
  UseGuards,
} from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import type { Request, Response } from "express";
import { CurrentUser } from "src/common/decorators/current-user.decorator";
import { CursorQueryDto } from "src/common/dto/cursor-query.dto";
import { AuthGuard } from "src/common/guards/auth.guard";
import { OptionalAuthGuard } from "src/common/guards/optional-auth.guard";
import type { AuthUser } from "src/common/interfaces/auth-user.interface";
import { conditionalGetHit } from "src/common/utils/etag.util";
import { apiOk } from "src/common/utils/response.util";
import { shareTokenFrom } from "src/common/utils/token.util";
import { CollectionsService } from "./collections.service";

@ApiTags("hubs")
@Controller("api/v1/hubs")
export class HubsController {
  constructor(private readonly collectionsService: CollectionsService) {}

  @UseGuards(AuthGuard)
  @Post()
  async createHub(@CurrentUser() user: AuthUser) {
    return apiOk(await this.collectionsService.createHub(user));
  }

  // Handle → hub-page resolution (backs the web's /@handle URLs). Literal
  // segment, so it is declared before the :hubId parameter route.
  @Get("by-handle/:handle")
  async getHubPageByHandle(@Param("handle") handle: string, @Query() query: CursorQueryDto) {
    const data = await this.collectionsService.getHubPageByHandle(handle, query);
    return apiOk({ hub: data.hub, collections: data.collections }, data.meta);
  }

  // Public hub page: display info + published collections.
  @Get(":hubId")
  async getHubPage(
    @Param("hubId", new ParseUUIDPipe()) hubId: string,
    @Query() query: CursorQueryDto,
  ) {
    const data = await this.collectionsService.getHubPage(hubId, query);
    return apiOk({ hub: data.hub, collections: data.collections }, data.meta);
  }

  // Hub collection list: members see all; others see the published subset.
  @UseGuards(OptionalAuthGuard)
  @Get(":hubId/collections")
  async listHubCollections(
    @Param("hubId", new ParseUUIDPipe()) hubId: string,
    @CurrentUser() user: AuthUser | null,
    @Query() query: CursorQueryDto,
  ) {
    const data = await this.collectionsService.listHubCollections(hubId, user, query);
    return apiOk(data.items, data.meta);
  }

  // Canonical collection lookup by hub + slug (replaces the username route).
  @UseGuards(OptionalAuthGuard)
  @Get(":hubId/collections/:slug")
  async getCollectionBySlug(
    @Param("hubId", new ParseUUIDPipe()) hubId: string,
    @Param("slug") slug: string,
    @CurrentUser() user: AuthUser | null,
    @Headers("x-share-token") headerToken?: string,
    @Req() req?: Request,
    @Res({ passthrough: true }) res?: Response,
  ) {
    const data = await this.collectionsService.getHubCollectionBySlug(
      hubId,
      slug,
      user,
      shareTokenFrom(headerToken, req),
    );
    if (conditionalGetHit(req, res, data.etag, data.lastModified)) {
      return;
    }
    return apiOk(data.collection, { etag: data.etag });
  }
}
