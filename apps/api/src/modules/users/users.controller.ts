import { Body, Controller, Get, Patch, Query, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { CurrentUser } from "src/common/decorators/current-user.decorator";
import { AuthGuard } from "src/common/guards/auth.guard";
import type { AuthUser } from "src/common/interfaces/auth-user.interface";
import { apiOk } from "src/common/utils/response.util";
import { HandleAvailabilityDto } from "./dto/handle-availability.dto";
import { UpdateUserDto } from "./dto/update-user.dto";
import { UsernameAvailabilityDto } from "./dto/username-availability.dto";
import { UsersService } from "./users.service";

@ApiTags("profile")
@ApiBearerAuth()
@UseGuards(AuthGuard)
@Controller("api/v1/profile")
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get()
  async getMe(@CurrentUser() user: AuthUser) {
    return apiOk(await this.usersService.getMe(user));
  }

  @Get("handle-availability")
  async handleAvailability(@CurrentUser() user: AuthUser, @Query() query: HandleAvailabilityDto) {
    return apiOk(await this.usersService.handleAvailability(user, query.handle));
  }

  @Get("username-availability")
  async usernameAvailability(
    @CurrentUser() user: AuthUser,
    @Query() query: UsernameAvailabilityDto,
  ) {
    return apiOk(await this.usersService.usernameAvailability(user, query.username));
  }

  @Patch()
  async updateMe(@CurrentUser() user: AuthUser, @Body() dto: UpdateUserDto) {
    return apiOk(await this.usersService.updateMe(user, dto));
  }
}
