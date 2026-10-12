import {
  type ImportCreateRequest,
  type ImportDestinationUpdate,
  type ImportRevision,
  type ImportRowUpdate,
  type ImportSelectionRequest,
  type ImportSourceKind,
  importRowStatuses,
  importSourceKinds,
} from "@ntumie/types";
import {
  ArrayMaxSize,
  ArrayMinSize,
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
  MinLength,
  NotContains,
  ValidateIf,
} from "class-validator";
import { CursorQueryDto } from "../../../common/dto/cursor-query.dto";
export class CreateImportDto implements ImportCreateRequest {
  @IsIn(importSourceKinds) sourceKind: ImportSourceKind;
}
export class ImportRevisionDto implements ImportRevision {
  @IsInt() @Min(1) version: number;
}
export class ImportQueueDto extends ImportRevisionDto {
  @ValidateIf((_object, value) => value !== undefined) @IsBoolean() published?: boolean;
}
export class ImportCollectionDto extends ImportRevisionDto {
  @IsBoolean() published: boolean;
}
export class ImportRowDto extends ImportRevisionDto implements ImportRowUpdate {
  @ValidateIf((_object, value) => value !== undefined)
  @IsString()
  @NotContains("\0")
  @MinLength(1)
  @MaxLength(255)
  collectionTitle?: string;
  @ValidateIf((_object, value) => value !== undefined)
  @IsString()
  @NotContains("\0")
  @MaxLength(255)
  sectionTitle?: string;
  @ValidateIf((_object, value) => value !== undefined)
  @IsString()
  @NotContains("\0")
  @MaxLength(8192)
  address?: string;
  @ValidateIf((_object, value) => value !== undefined)
  @IsArray()
  @ArrayMaxSize(30)
  @IsString({ each: true })
  @NotContains("\0", { each: true })
  @MaxLength(80, { each: true })
  tags?: string[];
}
export class ImportDestinationDto extends ImportRevisionDto implements ImportDestinationUpdate {
  @IsString()
  @NotContains("\0")
  @MinLength(1)
  @MaxLength(255)
  collectionTitle: string;
}
export class ImportRowsQuery extends CursorQueryDto {
  @IsOptional() @IsUUID() collectionId?: string;
  @IsOptional() @IsIn(importRowStatuses) status?: (typeof importRowStatuses)[number];
}

export class ImportSelectionDto extends ImportRevisionDto implements ImportSelectionRequest {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(50)
  @ArrayUnique()
  @IsUUID(undefined, { each: true })
  rowIds: string[];
  @IsIn(["revalidate", "remove", "place"])
  action: "revalidate" | "remove" | "place";
  @ValidateIf((object, value) => object.action === "place" || value !== undefined)
  @IsString()
  @NotContains("\0")
  @MinLength(1)
  @MaxLength(255)
  collectionTitle?: string;
}
