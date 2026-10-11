import { Controller, Get, HttpCode, Post, Req, UseGuards } from "@nestjs/common";
import type { NotificationView } from "@linkhub/types";
import { AuthGuard } from "../../common/guards/auth.guard";
import { apiOk } from "../../common/utils/response.util";
import { PrismaService } from "../../database/prisma.service";
import type { Prisma } from "../../generated/prisma/client";
import type { OperatorRequest } from "./operations.service";

// Invitations addressed to this account's verified email, minus cleared ones.
// Shared with the session's unread count so the badge and list always agree.
export function notificationScope(user: {
  id: string;
  email: string;
  notificationsClearedAt: Date | null;
}): Prisma.ServiceInvitationWhereInput {
  return {
    email: user.email,
    OR: [{ inviteeUserId: null }, { inviteeUserId: user.id }],
    ...(user.notificationsClearedAt ? { createdAt: { gt: user.notificationsClearedAt } } : {}),
  };
}
const reader = {
  id: true,
  email: true,
  emailVerified: true,
  notificationsSeenAt: true,
  notificationsClearedAt: true,
} as const;

@UseGuards(AuthGuard)
@Controller("api/v1/notifications")
export class NotificationsController {
  constructor(private readonly prisma: PrismaService) {}

  @Get() async list(@Req() req: OperatorRequest) {
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: req.user.userId },
      select: reader,
    });
    if (!user.emailVerified) return apiOk([] satisfies NotificationView[]);
    const rows = await this.prisma.serviceInvitation.findMany({
      where: notificationScope(user),
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: 50,
    });
    const items = rows.map(
      (row): NotificationView => ({
        id: row.id,
        kind: "service_invitation",
        role: row.role as NotificationView["role"],
        state: (row.expiresAt <= new Date() && ["pending", "verifying"].includes(row.state)
          ? "expired"
          : row.state) as NotificationView["state"],
        createdAt: row.createdAt.toISOString(),
        unread: !user.notificationsSeenAt || row.createdAt > user.notificationsSeenAt,
      }),
    );
    // Unread first, each group newest first.
    return apiOk([...items.filter((i) => i.unread), ...items.filter((i) => !i.unread)]);
  }

  // Opening Notifications resets the badge.
  @Post("seen") @HttpCode(200) async seen(@Req() req: OperatorRequest) {
    const now = new Date();
    await this.prisma.user.update({
      where: { id: req.user.userId },
      data: { notificationsSeenAt: now },
    });
    return apiOk({ seenAt: now.toISOString() });
  }

  // Clear all: hide everything present now (newer items still arrive).
  @Post("clear") @HttpCode(200) async clear(@Req() req: OperatorRequest) {
    const now = new Date();
    await this.prisma.user.update({
      where: { id: req.user.userId },
      data: { notificationsSeenAt: now, notificationsClearedAt: now },
    });
    return apiOk({ clearedAt: now.toISOString() });
  }
}
