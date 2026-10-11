// Compile-time checks run in api:typecheck, including optional keys.
import type * as Wire from "@nslinkhub/types";
import type { CaptureDto, CaptureLinkDto } from "../src/modules/collections/dto/capture.dto";
import type { CreateCollectionDto } from "../src/modules/collections/dto/create-collection.dto";
import type { CreateShareDto } from "../src/modules/collections/dto/create-share.dto";
import type { SetLinkSharingDto } from "../src/modules/collections/dto/set-link-sharing.dto";
import type { TransferCollectionDto } from "../src/modules/collections/dto/transfer-collection.dto";
import type { UpdateCollectionDto } from "../src/modules/collections/dto/update-collection.dto";
import type { CreateCommentDto, UpdateCommentDto } from "../src/modules/comments/dto/comment.dto";
import type { CreateExportDto } from "../src/modules/exports/dto/create-export.dto";
import type {
  CreateImportDto,
  ImportDestinationDto,
  ImportRowDto,
} from "../src/modules/imports/dto/import-draft.dto";
import type { OperationDto } from "../src/modules/operations/operations.dto";
import type {
  CreateCollectionResourceDto,
  CreateHeadingResourceDto,
} from "../src/modules/resources/dto/create-collection-resource.dto";
import type { CreateExternalResourceDto } from "../src/modules/resources/dto/create-external-resource.dto";
import type { MoveResourceDto } from "../src/modules/resources/dto/move-resource.dto";
import type { ReorderResourcesDto } from "../src/modules/resources/dto/reorder-resources.dto";
import type { UpdateResourceDto } from "../src/modules/resources/dto/update-resource.dto";
import type { UpdateUserDto } from "../src/modules/users/dto/update-user.dto";

type Equal<A, B> =
  (<T>() => T extends { [K in keyof A]: A[K] } ? 1 : 2) extends <T>() => T extends {
    [K in keyof B]: B[K];
  }
    ? 1
    : 2
    ? true
    : false;
type Assert<T extends true> = T;

export type RequestContractChecks = [
  Assert<Equal<CreateCollectionDto, Wire.CreateCollectionRequest>>,
  Assert<Equal<UpdateCollectionDto, Wire.UpdateCollectionRequest>>,
  Assert<Equal<SetLinkSharingDto, Wire.SetLinkSharingRequest>>,
  Assert<Equal<CreateShareDto, Wire.CreateShareRequest>>,
  Assert<Equal<TransferCollectionDto, Wire.TransferCollectionRequest>>,
  Assert<Equal<CaptureDto, Wire.CaptureRequest>>,
  Assert<Equal<CaptureLinkDto, Wire.CaptureLink>>,
  Assert<Equal<CreateExternalResourceDto, Wire.CreateExternalResourceRequest>>,
  Assert<Equal<CreateCollectionResourceDto, Wire.CreateCollectionResourceRequest>>,
  Assert<Equal<CreateHeadingResourceDto, Wire.CreateHeadingResourceRequest>>,
  Assert<Equal<UpdateResourceDto, Wire.UpdateResourceRequest>>,
  Assert<Equal<MoveResourceDto, Wire.MoveResourceRequest>>,
  Assert<Equal<ReorderResourcesDto, Wire.ReorderResourcesRequest>>,
  Assert<Equal<UpdateUserDto, Wire.UpdateProfileRequest>>,
  Assert<Equal<CreateImportDto, Wire.ImportCreateRequest>>,
  Assert<Equal<ImportRowDto, Wire.ImportRowUpdate>>,
  Assert<Equal<ImportDestinationDto, Wire.ImportDestinationUpdate>>,
  Assert<Equal<CreateExportDto, Wire.CreateExportRequest>>,
  Assert<Equal<CreateCommentDto, Wire.CreateCommentRequest>>,
  Assert<Equal<UpdateCommentDto, Wire.UpdateCommentRequest>>,
  Assert<Equal<OperationDto, Wire.OperationCommand>>,
];
