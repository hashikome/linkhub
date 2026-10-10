import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import type { CreateExportRequest } from "@nslinkhub/types";
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsOptional,
  IsUUID,
} from "class-validator";
import type { ExportFormat } from "../export-document";
import { EXPORT_FORMATS } from "../export-document";

export class CreateExportDto implements CreateExportRequest {
  @ApiProperty({ enum: EXPORT_FORMATS })
  @IsIn(EXPORT_FORMATS)
  format!: ExportFormat;

  @ApiProperty({ type: [String], description: "Collections to export (one document each)" })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(20)
  @IsUUID("all", { each: true })
  collectionIds!: string[];

  @ApiPropertyOptional({
    default: false,
    description:
      "Include readable linked collections as sections, one level only. Defaults to links.",
  })
  @IsOptional()
  @IsBoolean()
  expand?: boolean;
}
