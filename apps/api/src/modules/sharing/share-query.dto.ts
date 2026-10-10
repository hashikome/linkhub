import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import type { ShareKind } from "@nslinkhub/types";
import {
  Allow,
  IsDateString,
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  ValidateIf,
} from "class-validator";
import { CursorQueryDto } from "../../common/dto/cursor-query.dto";

export class ShareTargetDto {
  @ApiProperty({ enum: ["site", "profile", "hub", "collection"] })
  @IsIn(["site", "profile", "hub", "collection"])
  kind!: ShareKind;

  @ApiPropertyOptional({
    description: "Immutable resource ID; required except for site",
    format: "uuid",
  })
  @ValidateIf((query: ShareTargetDto) => query.kind !== "site" || query.id !== undefined)
  @IsUUID()
  id?: string;
}

export class ShareQueryDto extends ShareTargetDto {
  @ApiPropertyOptional({
    description: "Collection access token; x-share-token header takes precedence",
  })
  @IsOptional()
  @IsString()
  @MaxLength(512)
  s?: string;
}

export class ShareRequestDto extends ShareTargetDto {
  @ApiPropertyOptional({
    description: "Idempotency UUID; reuse when retrying the same create request",
    format: "uuid",
  })
  @IsOptional()
  @IsUUID()
  operationId?: string;

  @ApiPropertyOptional({
    description: "Custom plain-text message, up to 1000 characters; blank uses the default",
  })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  message?: string;

  @ApiPropertyOptional({
    type: "object",
    additionalProperties: true,
    description: "Optional sharing intent and client metadata (8 KiB, depth 6)",
  })
  @Allow()
  context?: unknown;
}

export class ShareListQueryDto extends CursorQueryDto {
  @ApiPropertyOptional({ enum: ["mine", "service"], default: "mine" })
  @IsOptional()
  @IsIn(["mine", "service"])
  scope?: "mine" | "service";

  @ApiPropertyOptional({
    description: "Search own entries by exact share/resource ID or message/destination text",
  })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  q?: string;

  @ApiPropertyOptional({ description: "Exact share entry ID", format: "uuid" })
  @IsOptional()
  @IsUUID()
  id?: string;

  @ApiPropertyOptional({ enum: ["site", "profile", "hub", "collection"] })
  @IsOptional()
  @IsIn(["site", "profile", "hub", "collection"])
  kind?: ShareKind;

  @ApiPropertyOptional({ format: "uuid" })
  @IsOptional()
  @IsUUID()
  resourceId?: string;

  @ApiPropertyOptional({ description: "Case-insensitive message substring" })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  message?: string;

  @ApiPropertyOptional({ description: "Case-insensitive destination label substring" })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  destination?: string;
}

export class ShareAnalyticsQueryDto {
  @ApiPropertyOptional({ enum: ["mine", "resource", "service"], default: "mine" })
  @IsOptional()
  @IsIn(["mine", "resource", "service"])
  scope?: "mine" | "resource" | "service";

  @ApiPropertyOptional({ enum: ["site", "profile", "hub", "collection"] })
  @IsOptional()
  @IsIn(["site", "profile", "hub", "collection"])
  kind?: ShareKind;

  @ApiPropertyOptional({ format: "uuid" })
  @IsOptional()
  @IsUUID()
  resourceId?: string;

  @ApiPropertyOptional({ description: "Inclusive ISO date/time" })
  @IsOptional()
  @IsDateString()
  from?: string;

  @ApiPropertyOptional({ description: "Exclusive ISO date/time" })
  @IsOptional()
  @IsDateString()
  to?: string;
}

export class ShareDetailQueryDto {
  @ApiPropertyOptional({ enum: ["mine", "service"], default: "mine" })
  @IsOptional()
  @IsIn(["mine", "service"])
  scope?: "mine" | "service";

  @ApiPropertyOptional({
    description: "Explicit collection access token; never restored from stored history",
  })
  @IsOptional()
  @IsString()
  @MaxLength(512)
  s?: string;
}

export class ShareOpenDto extends ShareTargetDto {
  @ApiProperty({
    description: "Client-generated UUID; reuse for retries of the same open",
    format: "uuid",
  })
  @IsUUID()
  eventId!: string;

  @ApiPropertyOptional({
    type: "object",
    additionalProperties: true,
    description: "Recognized utm_* strings; unusable optional values are ignored with warnings",
  })
  @Allow()
  attribution?: unknown;

  @ApiPropertyOptional({
    type: "object",
    additionalProperties: true,
    description:
      "Optional JSON object (8 KiB, depth 6); unusable metadata is ignored with warnings",
  })
  @Allow()
  context?: unknown;

  @ApiPropertyOptional({
    description: "Client occurrence ISO timestamp with timezone; server records receipt separately",
  })
  @Allow()
  occurredAt?: unknown;
}
