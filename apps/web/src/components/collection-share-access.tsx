import type { Collection, CollectionShareView } from "@ntumie/types";
import { serverRead } from "../lib/server-api";
import { CollectionOperationForm } from "./collection-operation-form";

export async function CollectionShareAccess({ id, returnTo }: { id: string; returnTo: string }) {
  const result = await serverRead<Collection>(`/api/v1/collections/${id}`);
  if (!result.ok) return <p>Access details are unavailable. Reload to try again.</p>;
  const c = result.data;
  if (!c.capabilities?.canManage) return null;
  const shares = await serverRead<CollectionShareView[]>(`/api/v1/collections/${id}/shares`);
  return (
    <>
      <h2>People with access</h2>
      {shares?.ok ? (
        <ul className="plain-list">
          {shares.data.map((s) => (
            <li key={s.userId}>
              {s.displayName}
              {s.email ? ` (${s.email})` : ""} ·{" "}
              {s.role === "contributor" ? "Contributor" : "Viewer"}
              <CollectionOperationForm
                returnTo={returnTo}
                id={id}
                action="revoke"
                userId={s.userId}
                label={`Remove access for ${s.displayName}`}
              />
            </li>
          ))}
        </ul>
      ) : (
        <p>Access details are unavailable. Reload to try again.</p>
      )}
      {!c.restriction && (
        <CollectionOperationForm returnTo={returnTo} id={id} action="grant" label="Grant access">
          <label>
            Email
            <input type="email" name="email" required maxLength={255} />
          </label>
          <label>
            Access
            <select name="role" defaultValue="viewer">
              <option value="viewer">Can view</option>
              <option value="contributor">Can contribute</option>
            </select>
          </label>
        </CollectionOperationForm>
      )}
      <h2>Link access</h2>
      {c.linkSharingEnabled ? (
        <>
          <p>Link access is on. Replacing the link stops the previous link from working.</p>
          {!c.restriction && (
            <CollectionOperationForm
              returnTo={returnTo}
              id={id}
              action="rotate_link"
              label="Replace share link"
            />
          )}
          <CollectionOperationForm
            returnTo={returnTo}
            id={id}
            action="disable_link"
            label="Turn off link access"
          />
        </>
      ) : !c.restriction ? (
        <>
          <p>Allow anyone with the generated link to read this collection.</p>
          <CollectionOperationForm
            returnTo={returnTo}
            id={id}
            action="enable_link"
            label="Create share link"
          />
        </>
      ) : (
        <p>Sharing is on hold.</p>
      )}
    </>
  );
}
