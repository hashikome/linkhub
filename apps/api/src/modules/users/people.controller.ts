import { Controller, Get, Param, ParseUUIDPipe, Query } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import type { PersonProfile } from "@linkhub/types";
import { CursorQueryDto } from "../../common/dto/cursor-query.dto";
import { appError } from "../../common/errors/app-exception";
import { apiOk } from "../../common/utils/response.util";
import { CollectionsService } from "../collections/collections.service";
import { hasValidUsernameFormat, isReservedUsername } from "./username";
import { UsersService } from "./users.service";

@ApiTags("people")
@Controller("api/v1/people")
export class PeopleController {
  constructor(
    private readonly users: UsersService,
    private readonly collections: CollectionsService,
  ) {}
  @Get("by-username/:username")
  async profile(@Param("username") username: string, @Query() query: CursorQueryDto) {
    if (!hasValidUsernameFormat(username) || isReservedUsername(username))
      throw appError("not_found");
    return this.readProfile({ username }, query);
  }
  @Get(":id")
  async byId(@Param("id", new ParseUUIDPipe()) id: string, @Query() query: CursorQueryDto) {
    return this.readProfile({ id }, query);
  }
  private async readProfile(
    identity: { id: string } | { username: string },
    query: CursorQueryDto,
  ) {
    const person = await this.users.getPublicPerson(identity);
    const result = await this.collections.publicContributions(person.id, query);
    return apiOk(
      {
        person: {
          userId: person.id,
          username: person.username,
          name: person.name.trim() || null,
          bio: person.bio,
        },
        hub: person.hub?.showOwner
          ? { id: person.hub.id, name: person.hub.name, handle: person.hub.handle }
          : null,
        collections: result.items,
      } satisfies PersonProfile,
      result.meta,
    );
  }
}
