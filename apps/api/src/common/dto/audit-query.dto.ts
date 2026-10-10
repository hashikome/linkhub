import { IsIn, IsISO8601, IsOptional, IsString, IsUUID, Matches, MaxLength } from "class-validator";
import { CursorQueryDto } from "./cursor-query.dto";

export class AuditLogQueryDto extends CursorQueryDto {
  @IsOptional() @IsString() @MaxLength(48) action?: string;
  @IsOptional() @IsString() @MaxLength(200) q?: string;
  @IsOptional() @IsIn(["actions", "all"]) view?: "actions" | "all";
  // Lookup inputs only. Responses and subsequent pages carry resolved full IDs.
  @IsOptional() @IsString() @MaxLength(64) @Matches(/^[a-zA-Z0-9_-]+$/) actor?: string;
  @IsOptional() @IsString() @MaxLength(64) @Matches(/^@?[a-zA-Z0-9_-]+$/) hub?: string;
  @IsOptional() @IsUUID() targetId?: string;
  @IsOptional() @IsISO8601() from?: string;
  @IsOptional() @IsISO8601() to?: string;
}
