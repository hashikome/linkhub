import type { CreateCommentRequest, UpdateCommentRequest } from "@linkhub/types";
import { IsInt, IsOptional, IsString, IsUUID, MaxLength, Min, MinLength } from "class-validator";

import { CursorQueryDto } from "src/common/dto/cursor-query.dto";

export class CommentQueryDto extends CursorQueryDto {
  @IsOptional()
  @IsUUID()
  replyTo?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1024)
  replyCursor?: string;
}

export class CreateCommentDto implements CreateCommentRequest {
  @IsString()
  @MinLength(1)
  @MaxLength(2000)
  body: string;

  // Present for a reply; replies are one level deep.
  @IsOptional()
  @IsUUID()
  parentId?: string;
}

export class UpdateCommentDto implements UpdateCommentRequest {
  @IsString()
  @MinLength(1)
  @MaxLength(2000)
  body: string;

  @IsInt()
  @Min(1)
  version: number;
}
