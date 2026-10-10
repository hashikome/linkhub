import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Header,
  Headers,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Req,
  Res,
  UseGuards,
} from "@nestjs/common";
import { ApiHeader, ApiOperation, ApiTags } from "@nestjs/swagger";
import type { Request, Response } from "express";
import { CurrentUser } from "../../common/decorators/current-user.decorator";
import { AuthGuard } from "../../common/guards/auth.guard";
import { OptionalAuthGuard } from "../../common/guards/optional-auth.guard";
import type { AuthUser } from "../../common/interfaces/auth-user.interface";
import { apiOk } from "../../common/utils/response.util";
import { shareTokenFrom } from "../../common/utils/token.util";
import type { OperatorRequest } from "../operations/operations.service";
import {
  ShareAnalyticsQueryDto,
  ShareDetailQueryDto,
  ShareListQueryDto,
  ShareOpenDto,
  ShareQueryDto,
  ShareRequestDto,
} from "./share-query.dto";
import { SharingService } from "./sharing.service";

@ApiTags("sharing")
@Controller("api/v1/share")
export class SharingController {
  constructor(private readonly sharing: SharingService) {}

  @Get("resolve")
  @UseGuards(OptionalAuthGuard)
  @Header("Cache-Control", "private, no-store")
  @Header("Vary", "Cookie, Authorization, X-Share-Token")
  @ApiOperation({ summary: "Preview a canonical sharing descriptor without creating a record" })
  @ApiHeader({
    name: "x-share-token",
    required: false,
    description: "Explicit collection access token",
  })
  async resolve(
    @Query() query: ShareQueryDto,
    @CurrentUser() viewer: AuthUser | null,
    @Req() request: Request,
    @Headers("x-share-token") headerToken?: string,
  ) {
    return apiOk(await this.sharing.resolve(query, viewer, this.token(headerToken, request)));
  }

  @Post()
  @UseGuards(AuthGuard)
  @Header("Cache-Control", "private, no-store")
  @Header("Vary", "Cookie, Authorization, X-Share-Token")
  @ApiOperation({
    summary:
      "Create a private share entry and return the complete object; does not send or grant access",
  })
  @ApiHeader({
    name: "x-share-token",
    required: false,
    description: "Explicit collection access token; never stored",
  })
  async create(
    @Body() body: ShareRequestDto,
    @CurrentUser() viewer: AuthUser,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
    @Headers("x-share-token") headerToken?: string,
  ) {
    const entry = await this.sharing.create(body, viewer, this.token(headerToken, request));
    response.setHeader("Location", `/api/v1/share/${entry.id}`);
    return apiOk(entry);
  }

  @Get("analytics")
  @UseGuards(AuthGuard)
  @Header("Cache-Control", "private, no-store")
  @Header("Vary", "Cookie, Authorization")
  @ApiOperation({
    summary: "Count share requests: own activity, an owned resource, or operator service totals",
  })
  async analytics(@Query() query: ShareAnalyticsQueryDto, @Req() request: OperatorRequest) {
    return apiOk(await this.sharing.analytics(query, request));
  }

  @Get()
  @UseGuards(AuthGuard)
  @Header("Cache-Control", "private, no-store")
  @Header("Vary", "Cookie, Authorization, X-Share-Token")
  @ApiOperation({ summary: "Search your own sharing history; always returns a paginated list" })
  async list(
    @Query() query: ShareListQueryDto,
    @Req() request: OperatorRequest,
    @Headers("x-share-token") headerToken?: string,
  ) {
    const result = await this.sharing.list(query, request, this.token(headerToken, request));
    return apiOk(result.items, result.meta);
  }

  @Post(":id/opens")
  @UseGuards(OptionalAuthGuard)
  @Header("Cache-Control", "private, no-store")
  @Header("Vary", "Cookie, Authorization, X-Share-Token")
  @ApiOperation({
    summary: "Report a loaded resource; idempotent by eventId, without granting access",
  })
  async open(
    @Param("id", ParseUUIDPipe) id: string,
    @Body() body: ShareOpenDto,
    @CurrentUser() viewer: AuthUser | null,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
    @Headers("x-share-token") headerToken?: string,
  ) {
    const { warnings, ...result } = await this.sharing.recordOpen(
      id,
      body,
      viewer,
      this.token(headerToken, request),
    );
    response.status(result.created ? 201 : 200);
    return { ...apiOk(result), warnings };
  }

  @Get(":id")
  @UseGuards(AuthGuard)
  @Header("Cache-Control", "private, no-store")
  @Header("Vary", "Cookie, Authorization, X-Share-Token")
  @ApiOperation({ summary: "Read one of your share entries with current resource access" })
  async get(
    @Param("id", ParseUUIDPipe) id: string,
    @Query() query: ShareDetailQueryDto,
    @Req() request: OperatorRequest,
    @Headers("x-share-token") headerToken?: string,
  ) {
    return apiOk(await this.sharing.get(id, query, request, this.token(headerToken, request)));
  }

  private token(headerToken: string | undefined, request: Request) {
    const token = shareTokenFrom(headerToken, request);
    if (token !== undefined && (typeof token !== "string" || token.length > 512))
      throw new BadRequestException();
    return token;
  }
}
