import { Module } from "@nestjs/common";
import { HubsModule } from "../hubs/hubs.module";
import { AdministrationController } from "./administration.controller";
import { AdministrationService } from "./administration.service";
import { ManagedAuditController } from "./managed-audit.controller";
import { ManagedCollectionsController } from "./managed-collections.controller";
import { NotificationsController } from "./notifications.controller";
import { OperationsController } from "./operations.controller";
import { OperationsService } from "./operations.service";
import { SessionController } from "./session.controller";
@Module({
  imports: [HubsModule],
  controllers: [
    OperationsController,
    ManagedCollectionsController,
    ManagedAuditController,
    SessionController,
    NotificationsController,
    AdministrationController,
  ],
  providers: [OperationsService, AdministrationService],
  exports: [OperationsService],
})
export class OperationsModule {}
