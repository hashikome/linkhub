import type { TransferCollectionRequest } from "@linkhub/types";
import { IsEmail, MaxLength } from "class-validator";

import { CollectionImpactDto } from "./collection-impact.dto";

export class TransferCollectionDto
  extends CollectionImpactDto
  implements TransferCollectionRequest
{
  // The recipient's email. They must already be a contributor on the collection.
  @IsEmail()
  @MaxLength(255)
  email: string;
}
