import { Module } from "@nestjs/common";
import { CollectionsModule } from "../collections/collections.module";
import { PeopleController } from "./people.controller";
import { UsersController } from "./users.controller";
import { UsersService } from "./users.service";

@Module({
  imports: [CollectionsModule],
  controllers: [UsersController, PeopleController],
  providers: [UsersService],
  exports: [UsersService],
})
export class UsersModule {}
