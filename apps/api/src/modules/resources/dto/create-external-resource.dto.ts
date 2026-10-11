import type { CreateExternalResourceRequest } from "@linkhub/types";
import {
  ArrayMaxSize,
  IsArray,
  IsInt,
  IsOptional,
  IsString,
  IsUrl,
  MaxLength,
  Min,
} from "class-validator";

// A link's title is resolved from its page by the server, never an input.
export class CreateExternalResourceDto implements CreateExternalResourceRequest {
  // Whether the host is public is decided by publicLinkUrl (link_not_public).
  @IsUrl({
    require_protocol: true,
    protocols: ["http", "https"],
    require_valid_protocol: true,
    disallow_auth: true,
    require_tld: false,
  })
  @MaxLength(2048)
  url: string;

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
