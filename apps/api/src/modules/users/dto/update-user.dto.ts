import type { UpdateProfileRequest } from "@nslinkhub/types";
import { Transform } from "class-transformer";
import {
  IsBoolean,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
  ValidateIf,
} from "class-validator";
import { normalizeUsername, USERNAME_MAX, USERNAME_MIN } from "../username";

export class UpdateUserDto implements UpdateProfileRequest {
  @Transform(({ value }) => (typeof value === "string" ? normalizeUsername(value) : value))
  @ValidateIf((_object, value) => value !== undefined)
  @IsString()
  @Matches(/^[a-z0-9]+(-[a-z0-9]+)*$/)
  @MinLength(USERNAME_MIN)
  @MaxLength(USERNAME_MAX)
  username?: string;

  @ValidateIf((_object, value) => value !== undefined)
  @IsBoolean()
  confirmHandle?: boolean;

  @ValidateIf((_object, value) => value !== undefined)
  @IsBoolean()
  showOwner?: boolean;

  @ValidateIf((_object, value) => value !== undefined)
  @IsString()
  @MaxLength(500)
  bio?: string;

  // Account holder full name; separate from the hub public display name.
  @IsOptional()
  @IsString()
  @MaxLength(255)
  displayName?: string;

  @IsOptional()
  @IsString()
  @Matches(/\S/)
  @MaxLength(255)
  hubName?: string;

  // The hub handle (mutable public identity). Format is re-validated in the
  // service and by a DB CHECK constraint.
  @IsOptional()
  @IsString()
  @Matches(/^[a-z0-9]+(-[a-z0-9]+)*$/)
  @MinLength(3)
  @MaxLength(60)
  handle?: string;

  @IsOptional()
  @IsString()
  @MaxLength(5000)
  hubDescription?: string;
}
