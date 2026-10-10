import { Controller, Get, Query, Req, UseGuards } from "@nestjs/common";
import { IsOptional, IsString, MaxLength } from "class-validator";
import { CursorQueryDto } from "../../common/dto/cursor-query.dto";
import { AuthGuard } from "../../common/guards/auth.guard";
import { apiOk } from "../../common/utils/response.util";
import { OperationsService, type OperatorRequest } from "./operations.service";

class ManagedCollectionsQuery extends CursorQueryDto {
  @IsOptional() @IsString() @MaxLength(2048) q?: string;
}

@UseGuards(AuthGuard)
@Controller("api/v1/manage/collections")
export class ManagedCollectionsController {
  constructor(private readonly operations: OperationsService) {}
  @Get()
  async list(@Req() req: OperatorRequest, @Query() query: ManagedCollectionsQuery) {
    const result = await this.operations.managedCollections(req, query);
    return apiOk(result.items, result.meta);
  }
}
