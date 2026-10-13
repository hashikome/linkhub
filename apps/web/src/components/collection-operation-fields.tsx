"use client";

import type { ReactNode } from "react";
import { useActionState } from "react";
import { AppForm } from "./app-form";
import { ShareLink } from "./share-link";
export type CollectionOperationState = { error?: string; link?: string; token?: string };
export function CollectionOperationFields({
  id,
  action,
  label,
  children,
  userId,
  returnTo,
  submitAction,
}: {
  id: string;
  action: string;
  label: string;
  children?: ReactNode;
  userId?: string;
  returnTo?: string;
  submitAction: (
    previous: CollectionOperationState,
    data: FormData,
  ) => Promise<CollectionOperationState>;
}) {
  const [state, submit, pending] = useActionState(submitAction, {} as CollectionOperationState);
  return (
    <>
      <AppForm action={submit} className="action-form" aria-busy={pending}>
        <input type="hidden" name="id" value={id} />
        <input type="hidden" name="action" value={action} />
        {returnTo && <input type="hidden" name="returnTo" value={returnTo} />}
        {userId && <input type="hidden" name="userId" value={userId} />}
        {children}
        {state.error && (
          <p role="alert" className="form-notice error">
            {state.error}
          </p>
        )}
        <button
          type="submit"
          className={`button ${action === "delete" ? "danger" : "primary"}`}
          disabled={pending}
        >
          {pending ? "Working…" : label}
        </button>
      </AppForm>
      {state.link && (
        <>
          <p>Anyone with this link can read the collection. Save it now; it is shown only once.</p>
          <ShareLink
            key={state.link}
            url={state.link}
            target={{ kind: "collection", id }}
            token={state.token}
          />
        </>
      )}
    </>
  );
}
