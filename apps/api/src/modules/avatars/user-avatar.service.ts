import { Injectable } from "@nestjs/common";
import { PrismaService } from "src/database/prisma.service";
import { type AvatarImage, GravatarService } from "./gravatar.service";

type ResolvedAvatar = { location: string } | AvatarImage;

@Injectable()
export class UserAvatarService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly gravatar: GravatarService,
  ) {}

  async resolve(id: string): Promise<ResolvedAvatar> {
    const fallback = { location: `/api/v1/avatars/${id}.svg` };
    // Public pictures follow current account eligibility for every viewer.
    // Missing and unavailable accounts share the same generated fallback.
    const user = await this.prisma.user.findUnique({
      where: { id },
      select: { email: true, emailVerified: true, accountState: true, deletionScheduledFor: true },
    });
    if (!user?.emailVerified || user.accountState !== "active" || user.deletionScheduledFor)
      return fallback;
    const image = await this.gravatar.resolve(user.email);
    if (!image) return fallback;
    // The provider can take time. Never serve an old email's picture or an
    // account's cached photo after it became unavailable during that wait.
    const current = await this.prisma.user.findFirst({
      where: {
        id,
        email: user.email,
        emailVerified: true,
        accountState: "active",
        deletionScheduledFor: null,
      },
      select: { id: true },
    });
    return current ? image : fallback;
  }
}
