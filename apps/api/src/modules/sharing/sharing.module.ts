import { Module } from "@nestjs/common";
import { CollectionsModule } from "../collections/collections.module";
import { OperationsModule } from "../operations/operations.module";
import { UsersModule } from "../users/users.module";
import { SharingController } from "./sharing.controller";
import { SharingService } from "./sharing.service";

@Module({
  imports: [CollectionsModule, UsersModule, OperationsModule],
  controllers: [SharingController],
  providers: [SharingService],
})
export class SharingModule {}
