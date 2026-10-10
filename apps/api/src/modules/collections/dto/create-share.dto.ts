import type { CreateShareRequest } from "@nslinkhub/types";
import { IsEmail, IsIn, IsOptional, IsString } from "class-validator";

export class CreateShareDto implements CreateShareRequest {
  @IsEmail()
  email: string;

  @IsOptional()
  @IsString()
  @IsIn(["viewer", "contributor"])
  role?: "viewer" | "contributor";
}
