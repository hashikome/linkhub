import { Module } from "@nestjs/common";
import { ParsedUploadAuthorityInterceptor } from "src/common/authority.interceptor";
import { CollectionsModule } from "../collections/collections.module";
import { ResourcesModule } from "../resources/resources.module";
import { ImportsController } from "./imports.controller";
import { ImportsService } from "./imports.service";

@Module({
  imports: [CollectionsModule, ResourcesModule],
  controllers: [ImportsController],
  providers: [ImportsService, ParsedUploadAuthorityInterceptor],
  exports: [ImportsService],
})
export class ImportsModule {}
