import type { ImportTargetRequest } from "@nslinkhub/types";
import { Transform } from "class-transformer";
import { IsBoolean, IsOptional, IsString, IsUUID, Matches, MaxLength } from "class-validator";

export class ImportTargetDto implements ImportTargetRequest {
  @IsOptional()
  @IsUUID()
  targetCollectionId?: string;

  @IsOptional()
  @Transform(({ value }: { value: unknown }) => {
    if (typeof value === "boolean") {
      return value;
    }
    if (typeof value === "string") {
      const normalized = value.trim().toLowerCase();
      if (normalized === "true") {
        return true;
      }
      if (normalized === "false") {
        return false;
      }
    }
    return value;
  })
  @IsBoolean()
  createCollection?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  collectionTitle?: string;

  @IsOptional()
  @IsString()
  @Matches(/^[a-z0-9-]+$/)
  @MaxLength(120)
  collectionSlug?: string;
}
