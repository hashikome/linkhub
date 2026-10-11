import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  SetMetadata,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { ApiBearerAuth, ApiConsumes, ApiTags } from "@nestjs/swagger";
import {
  AUTHORITY_AFTER_UPLOAD,
  ParsedUploadAuthorityInterceptor,
} from "../../common/authority.interceptor";
import { CurrentUser } from "../../common/decorators/current-user.decorator";
import { AuthGuard } from "../../common/guards/auth.guard";
import type { AuthUser } from "../../common/interfaces/auth-user.interface";
import { apiOk } from "../../common/utils/response.util";
import {
  CreateImportDto,
  ImportCollectionDto,
  ImportDestinationDto,
  ImportQueueDto,
  ImportRevisionDto,
  ImportRowDto,
  ImportRowsQuery,
  ImportSelectionDto,
} from "./dto/import-draft.dto";
import { IMPORT_BYTES } from "./import-parser";
import { ImportsService } from "./imports.service";

@ApiTags("imports")
@ApiBearerAuth()
@UseGuards(AuthGuard)
@Controller("api/v1/imports")
export class ImportsController {
  constructor(private readonly service: ImportsService) {}
  @Post()
  @ApiConsumes("multipart/form-data")
  @SetMetadata(AUTHORITY_AFTER_UPLOAD, true)
  @UseInterceptors(
    FileInterceptor("file", {
      limits: { fileSize: IMPORT_BYTES, files: 1, fields: 1, parts: 3, fieldSize: 32 },
    }),
    ParsedUploadAuthorityInterceptor,
  )
  async create(
    @CurrentUser() user: AuthUser,
    @Body() dto: CreateImportDto,
    @UploadedFile() file?: { buffer: Buffer; size: number },
  ) {
    return apiOk(await this.service.create(user, dto, file));
  }
  @Get() async list(@CurrentUser() user: AuthUser) {
    return apiOk(await this.service.list(user));
  }
  @Get(":id") async read(@CurrentUser() user: AuthUser, @Param("id", ParseUUIDPipe) id: string) {
    return apiOk(await this.service.read(user, id));
  }
  @Get(":id/collections/:collectionId") async collection(
    @CurrentUser() user: AuthUser,
    @Param("id", ParseUUIDPipe) id: string,
    @Param("collectionId", ParseUUIDPipe) collectionId: string,
  ) {
    return apiOk(await this.service.collection(user, id, collectionId));
  }
  @Patch(":id/collections/:collectionId") async updateCollection(
    @CurrentUser() user: AuthUser,
    @Param("id", ParseUUIDPipe) id: string,
    @Param("collectionId", ParseUUIDPipe) collectionId: string,
    @Body() dto: ImportCollectionDto,
  ) {
    return apiOk(await this.service.updateCollection(user, id, collectionId, dto));
  }
  @Post(":id/collections/:collectionId/commit") async commitCollection(
    @CurrentUser() user: AuthUser,
    @Param("id", ParseUUIDPipe) id: string,
    @Param("collectionId", ParseUUIDPipe) collectionId: string,
    @Body() dto: ImportQueueDto,
  ) {
    return apiOk(await this.service.queueCollection(user, id, collectionId, dto));
  }
  @Delete(":id/collections/:collectionId") async discardCollection(
    @CurrentUser() user: AuthUser,
    @Param("id", ParseUUIDPipe) id: string,
    @Param("collectionId", ParseUUIDPipe) collectionId: string,
    @Body() dto: ImportRevisionDto,
  ) {
    return apiOk(await this.service.discardCollection(user, id, collectionId, dto));
  }
  @Get(":id/rows") async rows(
    @CurrentUser() user: AuthUser,
    @Param("id", ParseUUIDPipe) id: string,
    @Query() query: ImportRowsQuery,
  ) {
    return this.service.rows(user, id, query);
  }
  @Get(":id/rows/:rowId")
  async row(
    @CurrentUser() user: AuthUser,
    @Param("id", ParseUUIDPipe) id: string,
    @Param("rowId", ParseUUIDPipe) rowId: string,
  ) {
    return apiOk(await this.service.row(user, id, rowId));
  }
  @Post(":id/selection") async selection(
    @CurrentUser() user: AuthUser,
    @Param("id", ParseUUIDPipe) id: string,
    @Body() dto: ImportSelectionDto,
  ) {
    return apiOk(await this.service.selection(user, id, dto));
  }
  @Patch(":id/rows/:rowId") async editRow(
    @CurrentUser() user: AuthUser,
    @Param("id", ParseUUIDPipe) id: string,
    @Param("rowId", ParseUUIDPipe) rowId: string,
    @Body() dto: ImportRowDto,
  ) {
    return apiOk(await this.service.editRow(user, id, rowId, dto));
  }
  @Delete(":id/rows/:rowId") async dropRow(
    @CurrentUser() user: AuthUser,
    @Param("id", ParseUUIDPipe) id: string,
    @Param("rowId", ParseUUIDPipe) rowId: string,
    @Body() dto: ImportRevisionDto,
  ) {
    return apiOk(await this.service.dropRow(user, id, rowId, dto));
  }
  @Patch(":id/destination") async destination(
    @CurrentUser() user: AuthUser,
    @Param("id", ParseUUIDPipe) id: string,
    @Body() dto: ImportDestinationDto,
  ) {
    return apiOk(await this.service.nameDestination(user, id, dto));
  }
  @Post(":id/revalidate") async revalidate(
    @CurrentUser() user: AuthUser,
    @Param("id", ParseUUIDPipe) id: string,
    @Body() dto: ImportRevisionDto,
  ) {
    return apiOk(await this.service.bulk(user, id, dto, "revalidate"));
  }
  @Post(":id/drop-failed") async dropFailed(
    @CurrentUser() user: AuthUser,
    @Param("id", ParseUUIDPipe) id: string,
    @Body() dto: ImportRevisionDto,
  ) {
    return apiOk(await this.service.bulk(user, id, dto, "drop-failed"));
  }
  @Post(":id/commit") async commit(
    @CurrentUser() user: AuthUser,
    @Param("id", ParseUUIDPipe) id: string,
    @Body() dto: ImportRevisionDto,
  ) {
    return apiOk(await this.service.commit(user, id, dto));
  }
  @Delete(":id") async discard(
    @CurrentUser() user: AuthUser,
    @Param("id", ParseUUIDPipe) id: string,
    @Body() dto: ImportRevisionDto,
  ) {
    return apiOk(await this.service.discard(user, id, dto));
  }
}
