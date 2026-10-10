import type { ReactNode } from "react";
import { collectionOperation } from "../lib/collection-operation";
import { CollectionOperationFields } from "./collection-operation-fields";
export function CollectionOperationForm(props: {
  id: string;
  action: string;
  label: string;
  children?: ReactNode;
  userId?: string;
  returnTo?: string;
}) {
  return <CollectionOperationFields {...props} submitAction={collectionOperation} />;
}
