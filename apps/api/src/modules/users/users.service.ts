import { Injectable, NotFoundException } from "@nestjs/common";
import type { Profile, UsernameAvailability } from "@nslinkhub/types";
import { AuthUser } from "src/common/interfaces/auth-user.interface";
import { PrismaService } from "src/database/prisma.service";
import { User } from "src/generated/prisma/client";
import { appError } from "../../common/errors/app-exception";
import { HubsService } from "../hubs/hubs.service";
import { UpdateUserDto } from "./dto/update-user.dto";
import {
  hasValidUsernameFormat,
  isReservedUsername,
  normalizeUsername,
  suggestUsername,
  usernameOwner,
} from "./username";

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly hubs: HubsService,
  ) {}

  async getPublicPerson(identity: { id: string } | { username: string }) {
    const person = await this.prisma.user.findFirst({
      where: { ...identity, accountState: "active" },
      select: {
        id: true,
        username: true,
        name: true,
        bio: true,
        hub: { select: { id: true, name: true, handle: true, showOwner: true } },
      },
    });
    if (!person) throw appError("not_found");
    return person;
  }

  async getMe(actor: AuthUser) {
    const user = await this.prisma.user.findUnique({ where: { id: actor.userId } });
    if (!user) {
      throw new NotFoundException("User not found");
    }
    return this.toProfile(user);
  }

  async usernameAvailability(actor: AuthUser, raw: string): Promise<UsernameAvailability> {
    const username = normalizeUsername(raw);
    if (!hasValidUsernameFormat(username)) {
      const suggestion = await suggestUsername(this.prisma, username, actor.userId);
      return { username, status: "invalid", ...(suggestion ? { suggestion } : {}) };
    }
    if (isReservedUsername(username)) return { username, status: "reserved" };
    const person = await usernameOwner(this.prisma, username);
    return {
      username,
      status: !person ? "available" : person.id === actor.userId ? "current" : "taken",
    };
  }

  handleAvailability(actor: AuthUser, handle: string) {
    return this.hubs.handleAvailability(actor.userId, handle);
  }

  async updateMe(actor: AuthUser, dto: UpdateUserDto) {
    const user = await this.prisma.user.findUnique({ where: { id: actor.userId } });
    if (!user) {
      throw new NotFoundException("User not found");
    }

    const data: { name?: string; username?: string; bio?: string | null } = {};
    if (dto.username !== undefined && dto.username !== user.username) {
      const available = await this.usernameAvailability(actor, dto.username);
      if (available.status === "invalid") throw appError("username_invalid");
      if (available.status === "reserved") throw appError("username_reserved");
      if (available.status === "taken") throw appError("username_unavailable");
      data.username = available.username;
    }

    if (dto.displayName !== undefined && dto.displayName !== user.name) {
      data.name = dto.displayName;
    }

    if (dto.bio !== undefined) data.bio = dto.bio.trim() || null;

    if (dto.showOwner !== undefined) await this.hubs.updateShowOwner(user.id, dto.showOwner);

    // The handle lives on the hub; validated + uniqueness-checked there.
    if (dto.handle) {
      await this.hubs.updateHandle(user.id, dto.handle, dto.confirmHandle === true);
    }

    if (dto.hubName !== undefined) await this.hubs.updateName(user.id, dto.hubName);
    if (dto.hubDescription !== undefined)
      await this.hubs.updateDescription(user.id, dto.hubDescription);

    const saved = await this.prisma.user.update({ where: { id: user.id }, data });
    return this.toProfile(saved);
  }

  private async toProfile(user: User): Promise<Profile> {
    const hub = await this.prisma.hub.findUnique({
      where: { ownerUserId: user.id },
      select: {
        id: true,
        handle: true,
        name: true,
        description: true,
        showOwner: true,
        handleClaimedAt: true,
      },
    });
    return {
      id: user.id,
      username: user.username,
      handleClaimedAt: hub?.handleClaimedAt?.toISOString() ?? null,
      displayName: user.name,
      bio: user.bio,
      showOwner: hub?.showOwner ?? null,
      handle: hub?.handle ?? null,
      hubId: hub?.id ?? null,
      hubName: hub?.name ?? null,
      email: user.email,
      hubDescription: hub?.description ?? null,
      image: user.image,
      createdAt: user.createdAt.toISOString(),
      updatedAt: user.updatedAt.toISOString(),
    };
  }
}
