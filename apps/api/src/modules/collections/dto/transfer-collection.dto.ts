import type { TransferCollectionRequest } from "@nslinkhub/types";
import { IsEmail, MaxLength } from "class-validator";

export class TransferCollectionDto implements TransferCollectionRequest {
  // The recipient's email. They must already be a contributor on the collection.
  @IsEmail()
  @MaxLength(255)
  email: string;
}
