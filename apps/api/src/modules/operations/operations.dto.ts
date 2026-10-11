import type { OperationCommand } from "@linkhub/types";
import {
  type OperationAction,
  type OperationReason,
  operationActions,
  operationReasons,
} from "@linkhub/types";
import { IsIn, IsInt, IsOptional, IsString, IsUUID, MaxLength, Min } from "class-validator";
import { CursorQueryDto } from "../../common/dto/cursor-query.dto";
export class OperationDto implements OperationCommand {
  @IsIn(operationActions) action!: OperationAction;
  @IsUUID() targetId!: string;
  @IsIn(operationReasons) reason!: OperationReason;
  @IsInt() @Min(0) version!: number;
  @IsUUID() operationId!: string;
}
// Accounts are found the way people know them: an email or a hub handle.
export class AccountListQueryDto extends CursorQueryDto {
  @IsOptional() @IsString() @MaxLength(254) q?: string;
}
