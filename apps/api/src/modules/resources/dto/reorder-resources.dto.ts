import type { ReorderResourcesRequest } from "@linkhub/types";
import { Type } from "class-transformer";
import {
  ArrayMinSize,
  ArrayUnique,
  IsArray,
  IsInt,
  IsUUID,
  Min,
  ValidateNested,
} from "class-validator";

export class ReorderItemDto {
  @IsUUID()
  resourceId: string;

  @IsInt()
  @Min(0)
  position: number;

  @IsInt()
  @Min(1)
  version: number;
}

export class ReorderResourcesDto implements ReorderResourcesRequest {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayUnique((item: ReorderItemDto) => item.resourceId)
  @ValidateNested({ each: true })
  @Type(() => ReorderItemDto)
  items: ReorderItemDto[];
}
