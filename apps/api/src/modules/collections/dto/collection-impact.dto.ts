import type { CollectionImpactRequest } from "@ntumie/types";
import { IsIn, IsOptional, Matches } from "class-validator";

export class CollectionImpactDto implements CollectionImpactRequest {
  @IsOptional()
  @Matches(/^[a-f0-9]{64}$/)
  impactToken?: string;
}

export class CollectionImpactQuery {
  @IsIn(["delete", "transfer"])
  action: "delete" | "transfer";
}
