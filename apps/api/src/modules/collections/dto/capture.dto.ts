import type { CaptureLink, CaptureRequest } from "@linkhub/types";
import { Type } from "class-transformer";
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  IsUrl,
  IsUUID,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from "class-validator";

export class CaptureLinkDto implements CaptureLink {
  @IsUrl({
    require_protocol: true,
    protocols: ["http", "https"],
    require_valid_protocol: true,
    disallow_auth: true,
    // Whether the host is public is decided by publicLinkUrl (link_not_public).
    require_tld: false,
  })
  @MaxLength(2048)
  url: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(30)
  @IsString({ each: true })
  @MaxLength(80, { each: true })
  tags?: string[];
}

export class CaptureDto implements CaptureRequest {
  @IsOptional() @IsBoolean() published?: boolean;
  @IsInt()
  @Min(1)
  startedAt: number;

  @IsUUID()
  operationId: string;

  @IsArray()
  @ArrayMinSize(1)
  // Saving is for one or two links copied by hand; more is what import is for.
  @ArrayMaxSize(2)
  @ValidateNested({ each: true })
  @Type(() => CaptureLinkDto)
  links: CaptureLinkDto[];

  @IsString()
  @MaxLength(36)
  destination: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(255)
  collectionTitle?: string;
}
