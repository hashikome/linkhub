import { Controller, Get, Req, UseGuards } from "@nestjs/common";
import type { SessionView } from "@linkhub/types";
import { AuthGuard } from "../../common/guards/auth.guard";
import { apiOk } from "../../common/utils/response.util";
import { PrismaService } from "../../database/prisma.service";
import { notificationScope } from "./notifications.controller";
import type { OperatorRequest } from "./operations.service";
@UseGuards(AuthGuard)
@Controller("api/v1/session")
export class SessionController {
  constructor(private readonly prisma: PrismaService) {}
  @Get() async current(@Req() req: OperatorRequest) {
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: req.user.userId },
      select: {
        id: true,
        name: true,
        username: true,
        email: true,
        emailVerified: true,
        notificationsSeenAt: true,
        notificationsClearedAt: true,
        operatorGrant: { select: { userId: true } },
        adminGrant: { select: { userId: true } },
        hub: { select: { id: true } },
      },
    });
    return apiOk({
      userId: user.id,
      hubId: user.hub?.id ?? null,
      email: user.email,
      name: user.name,
      username: user.username,
      operator: !!user.operatorGrant || !!user.adminGrant,
      admin: !!user.adminGrant,
      unreadNotifications: user.emailVerified
        ? await this.prisma.serviceInvitation.count({
            where: {
              AND: [
                notificationScope(user),
                user.notificationsSeenAt ? { createdAt: { gt: user.notificationsSeenAt } } : {},
              ],
            },
          })
        : 0,
    } satisfies SessionView);
  }
}
