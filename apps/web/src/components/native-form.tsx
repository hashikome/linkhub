import type { ReactNode } from "react";
import { AppForm } from "./app-form";

// Shared command form; requests run in the background after hydration.
export function NativeForm({
  action,
  id,
  children,
  encType,
  className,
}: {
  action: string;
  id?: string;
  children: ReactNode;
  encType?: "multipart/form-data";
  className?: string;
}) {
  return (
    <AppForm
      id={id}
      action={action}
      method="post"
      encType={encType}
      className={["action-form", className].filter(Boolean).join(" ")}
    >
      {children}
    </AppForm>
  );
}
