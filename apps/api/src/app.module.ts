import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { APP_INTERCEPTOR } from "@nestjs/core";
import { AuthorityInterceptor } from "./common/authority.interceptor";
import { RequestBudgetMaintenance } from "./common/request-budget-maintenance";
import { validateEnv } from "./config/env.validation";
import { PrismaModule } from "./database/prisma.module";
import { AvatarsModule } from "./modules/avatars/avatars.module";
import { CollectionsModule } from "./modules/collections/collections.module";
import { CommentsModule } from "./modules/comments/comments.module";
import { ExportsModule } from "./modules/exports/exports.module";
import { HealthModule } from "./modules/health/health.module";
import { HubsModule } from "./modules/hubs/hubs.module";
import { ImportsModule } from "./modules/imports/imports.module";
import { OperationsModule } from "./modules/operations/operations.module";
import { ResourcesModule } from "./modules/resources/resources.module";
import { SharingModule } from "./modules/sharing/sharing.module";
import { UsersModule } from "./modules/users/users.module";

@Module({
  providers: [
    RequestBudgetMaintenance,
    { provide: APP_INTERCEPTOR, useClass: AuthorityInterceptor },
  ],
  imports: [
    ConfigModule.forRoot({ isGlobal: true, validate: validateEnv }),
    PrismaModule,
    AvatarsModule,
    HubsModule,
    UsersModule,
    OperationsModule,
    CollectionsModule,
    ResourcesModule,
    SharingModule,
    CommentsModule,
    ImportsModule,
    ExportsModule,
    HealthModule,
  ],
})
export class AppModule {}
