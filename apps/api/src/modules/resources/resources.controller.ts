import {
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import type { Request } from "express";
import { CurrentUser } from "src/common/decorators/current-user.decorator";
import { CursorQueryDto } from "src/common/dto/cursor-query.dto";
import { AuthGuard } from "src/common/guards/auth.guard";
import { OptionalAuthGuard } from "src/common/guards/optional-auth.guard";
import type { AuthUser } from "src/common/interfaces/auth-user.interface";
import { apiOk } from "src/common/utils/response.util";
import { shareTokenFrom } from "src/common/utils/token.util";
import {
  CreateCollectionResourceDto,
  CreateHeadingResourceDto,
} from "./dto/create-collection-resource.dto";
import { CreateExternalResourceDto } from "./dto/create-external-resource.dto";
import { MoveResourceDto } from "./dto/move-resource.dto";
import { ReorderResourcesDto } from "./dto/reorder-resources.dto";
import { UpdateResourceDto } from "./dto/update-resource.dto";
import { ResourcesService } from "./resources.service";

@ApiTags("resources")
@Controller("api/v1/collections/:id/resources")
export class ResourcesController {
  constructor(private readonly resourcesService: ResourcesService) {}

  @ApiBearerAuth()
  @UseGuards(AuthGuard)
  @Post("external")
  async createExternal(
    @Param("id", new ParseUUIDPipe()) collectionId: string,
    @CurrentUser() user: AuthUser,
    @Body() dto: CreateExternalResourceDto,
  ) {
    const data = await this.resourcesService.createExternal(collectionId, user, dto);
    return apiOk(data);
  }

  @ApiBearerAuth()
  @UseGuards(AuthGuard)
  @Post("collection")
  async createCollectionLink(
    @Param("id", new ParseUUIDPipe()) id: string,
    @CurrentUser() user: AuthUser,
    @Body() dto: CreateCollectionResourceDto,
  ) {
    return apiOk(await this.resourcesService.createCollectionLink(id, user, dto));
  }

  @ApiBearerAuth()
  @UseGuards(AuthGuard)
  @Post("heading")
  async createHeading(
    @Param("id", new ParseUUIDPipe()) id: string,
    @CurrentUser() user: AuthUser,
    @Body() dto: CreateHeadingResourceDto,
  ) {
    return apiOk(await this.resourcesService.createHeading(id, user, dto));
  }

  @UseGuards(OptionalAuthGuard)
  @Get()
  async getByCollection(
    @Param("id", new ParseUUIDPipe()) collectionId: string,
    @CurrentUser() user: AuthUser | null,
    @Headers("x-share-token") headerToken?: string,
    @Req() req?: Request,
    @Query() query?: CursorQueryDto,
  ) {
    const shareToken = shareTokenFrom(headerToken, req);
    const safeQuery = query ?? { limit: 20 };
    const data = await this.resourcesService.getByCollection(
      collectionId,
      user,
      shareToken,
      safeQuery,
    );
    return apiOk(data.items, data.meta);
  }

  // Must be declared before the ':resourceId' routes or it is unreachable.
  @ApiBearerAuth()
  @UseGuards(AuthGuard)
  @Patch("reorder")
  async reorder(
    @Param("id", new ParseUUIDPipe()) collectionId: string,
    @CurrentUser() user: AuthUser,
    @Body() dto: ReorderResourcesDto,
  ) {
    const data = await this.resourcesService.reorder(collectionId, user, dto);
    return apiOk(data);
  }

  @ApiBearerAuth()
  @UseGuards(AuthGuard)
  @Patch(":resourceId/move")
  async move(
    @Param("id", new ParseUUIDPipe()) collectionId: string,
    @Param("resourceId", new ParseUUIDPipe()) resourceId: string,
    @CurrentUser() user: AuthUser,
    @Body() dto: MoveResourceDto,
  ) {
    return apiOk(await this.resourcesService.move(collectionId, resourceId, user, dto));
  }

  @Get(":resourceId")
  @UseGuards(OptionalAuthGuard)
  async getOne(
    @Param("id", new ParseUUIDPipe()) collectionId: string,
    @Param("resourceId", new ParseUUIDPipe()) resourceId: string,
    @CurrentUser() user: AuthUser | null,
    @Req() req: Request,
    @Headers("x-share-token") headerToken?: string,
  ) {
    return apiOk(
      await this.resourcesService.getOne(
        collectionId,
        resourceId,
        user,
        shareTokenFrom(headerToken, req),
      ),
    );
  }

  @ApiBearerAuth()
  @UseGuards(AuthGuard)
  @Patch(":resourceId")
  async update(
    @Param("id", new ParseUUIDPipe()) collectionId: string,
    @Param("resourceId", new ParseUUIDPipe()) resourceId: string,
    @CurrentUser() user: AuthUser,
    @Body() dto: UpdateResourceDto,
  ) {
    const data = await this.resourcesService.update(collectionId, resourceId, user, dto);
    return apiOk(data);
  }

  @ApiBearerAuth()
  @UseGuards(AuthGuard)
  @Delete(":resourceId")
  async remove(
    @Param("id", new ParseUUIDPipe()) collectionId: string,
    @Param("resourceId", new ParseUUIDPipe()) resourceId: string,
    @CurrentUser() user: AuthUser,
  ) {
    const data = await this.resourcesService.remove(collectionId, resourceId, user);
    return apiOk(data);
  }
}
