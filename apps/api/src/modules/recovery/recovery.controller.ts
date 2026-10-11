import { createHash } from "node:crypto";
import { Body, Controller, Headers, Module, Post } from "@nestjs/common";
import {
  recoveryPayloadLimit,
  recoveryTtl,
  validRecoveryProof,
} from "@linkhub/config/action-recovery";
import { IsIn, IsOptional, IsString, Matches, MaxLength } from "class-validator";
import { appError } from "../../common/errors/app-exception";
import { apiOk } from "../../common/utils/response.util";
import { readSecret } from "../../config/secret";
import { PrismaService } from "../../database/prisma.service";

class RecoveryDto {
  @IsIn(["put", "get", "delete"])
  operation!: "put" | "get" | "delete";

  @Matches(/^[a-f0-9]{64}$/)
  token!: string;

  @IsOptional()
  @IsString()
  @Matches(/^[A-Za-z0-9_-]+$/)
  @MaxLength(recoveryPayloadLimit)
  payload?: string;
}

// Service-authenticated opaque storage. The browser never receives the proof;
// payload decryption and account-bound replay remain in the web adapter.
@Controller("api/v1/action-recovery")
export class RecoveryController {
  constructor(private readonly prisma: PrismaService) {}

  @Post()
  async command(@Body() dto: RecoveryDto, @Headers("x-action-recovery") proof?: string) {
    if (!validRecoveryProof(dto, proof, readSecret("WEB_SOURCE_SECRET")))
      throw appError("forbidden");
    const tokenHash = createHash("sha256").update(dto.token).digest("hex");
    if (dto.operation === "put") {
      if (!dto.payload) throw appError("bad_request");
      const row = await this.prisma.pendingActionPayload.upsert({
        where: { tokenHash },
        create: {
          tokenHash,
          payload: dto.payload,
          expiresAt: new Date(Date.now() + recoveryTtl * 1000),
        },
        update: {},
      });
      if (row.payload !== dto.payload || row.expiresAt.getTime() <= Date.now())
        throw appError("conflict");
      return apiOk({ payload: null });
    }
    if (dto.operation === "delete") {
      await this.prisma.pendingActionPayload.deleteMany({ where: { tokenHash } });
      return apiOk({ payload: null });
    }
    const row = await this.prisma.pendingActionPayload.findFirst({
      where: { tokenHash, expiresAt: { gt: new Date() } },
    });
    return apiOk({ payload: row?.payload ?? null });
  }
}

@Module({ controllers: [RecoveryController] })
export class RecoveryModule {}
