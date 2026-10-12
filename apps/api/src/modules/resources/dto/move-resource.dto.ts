import type { MoveResourceRequest } from "@ntumie/types";
import { IsIn, IsInt, IsOptional, IsUUID, Min } from "class-validator";

export class MoveResourceDto implements MoveResourceRequest {
  @IsInt()
  @Min(1)
  version: number;

  @IsOptional()
  @IsIn(["up", "down"])
  direction?: "up" | "down";

  @IsOptional()
  @IsUUID()
  beforeId?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  beforeVersion?: number;
}
