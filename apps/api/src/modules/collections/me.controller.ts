import { Controller, Get, Query, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { CurrentUser } from "src/common/decorators/current-user.decorator";
import { AuthGuard } from "src/common/guards/auth.guard";
import type { AuthUser } from "src/common/interfaces/auth-user.interface";
import { apiOk } from "src/common/utils/response.util";
import { CursorQueryDto } from "../../common/dto/cursor-query.dto";
import { CollectionsService } from "./collections.service";

// User-level surfaces: shared/ (access granted to you) and saved/ (what you
// kept from the public surface).
@ApiTags("me")
@ApiBearerAuth()
@UseGuards(AuthGuard)
@Controller("api/v1/me")
export class MeController {
  constructor(private readonly collectionsService: CollectionsService) {}

  @Get("people")
  async people(@CurrentUser() user: AuthUser, @Query() query: CursorQueryDto) {
    const result = await this.collectionsService.listPeople(user, query);
    return apiOk(result.items, result.meta);
  }

  @Get("shared")
  async shared(@CurrentUser() user: AuthUser) {
    return apiOk(await this.collectionsService.listShared(user));
  }

  @Get("saved")
  async saved(@CurrentUser() user: AuthUser) {
    return apiOk(await this.collectionsService.listSaved(user));
  }
}
