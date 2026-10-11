import type { CreateCollectionResourceRequest, CreateHeadingResourceRequest } from "@linkhub/types";
import {
  ArrayMaxSize,
  IsArray,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  Min,
  ValidateIf,
} from "class-validator";

export class CreateHeadingResourceDto implements CreateHeadingResourceRequest {
  @IsString()
  @Matches(/\S/)
  @MaxLength(255)
  title: string;

  @ValidateIf((_object, value) => value !== undefined)
  @IsString()
  @MaxLength(500)
  description?: string;

  @IsUUID()
  firstItemId: string;

  @IsInt()
  @Min(1)
  firstItemVersion: number;
}
// A reference's title is its target collection's title, never an input.
export class CreateCollectionResourceDto implements CreateCollectionResourceRequest {
  @IsUUID()
  linkedCollectionId: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(30)
  @IsString({ each: true })
  @MaxLength(80, { each: true })
  tags?: string[];

  @IsInt()
  @Min(0)
  position: number;
}
