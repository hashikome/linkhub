"use client";

import type {
  ImportDraftView,
  ImportRowStatus,
  ImportRowView,
  ImportSelectionResult,
} from "@ntumie/types";
import { useRouter } from "next/navigation";
import { type FormEvent, useEffect, useRef, useState } from "react";
import { browserRead } from "../lib/browser-api";
import { type Failure, submitForm } from "../lib/http";
import { importReasons, importStatusLabels } from "../lib/import-presentation";
import { formatImportTags } from "../lib/import-tags";
import { navigateInApp, refreshInApp } from "../lib/navigation";
import { AppForm } from "./app-form";
import { Retry } from "./feedback";
import { NativeForm } from "./native-form";
import { OperatorTableRegion } from "./operator-table-region";

export function ImportRevision({
  draft,
  status,
}: {
  draft: ImportDraftView;
  status?: ImportRowStatus;
}) {
  return (
    <>
      <input type="hidden" name="id" value={draft.id} />
      <input type="hidden" name="version" value={draft.version} />
      {draft.collectionId && <input type="hidden" name="collectionId" value={draft.collectionId} />}
      {status && <input type="hidden" name="status" value={status} />}
    </>
  );
}
export function ImportRows({
  draft,
  initial,
  nextCursor,
  status,
  firstPage,
  initialEdit,
  editRow,
}: {
  draft: ImportDraftView;
  initial: ImportRowView[];
  nextCursor?: string | null;
  status?: ImportRowStatus;
  firstPage: boolean;
  initialEdit?: string;
  editRow?: ImportRowView;
}) {
  const router = useRouter();
  const [revision, setRevision] = useState(draft);
  const candidate = revision.version > draft.version ? revision : draft;
  const collection = candidate.collections.find((c) => c.id === draft.collectionId);
  const liveDraft = {
    ...candidate,
    collectionId: draft.collectionId,
    counts: collection?.counts ?? draft.counts,
  };
  const working = !!collection && ["queued", "running"].includes(collection.jobState);
  const [updates, setUpdates] = useState<Record<string, ImportRowView>>({});
  const [selected, setSelected] = useState<string[]>([]);
  const [editing, setEditing] = useState(initialEdit);
  const [commandVersion, setCommandVersion] = useState(initialEdit ? draft.version : undefined);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => setHydrated(true), []);
  const [extra, setExtra] = useState<ImportRowView[]>([]);
  const [cursor, setCursor] = useState(nextCursor);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<Failure>();
  const [announcement, setAnnouncement] = useState("");
  const active = useRef<AbortController | null>(null);
  const table = useRef<HTMLTableElement>(null);
  const path = `/manage/import-export/${draft.id}`;
  const here = `${path}?collection=${draft.collectionId}`;
  const params = new URLSearchParams({
    limit: "25",
    collectionId: draft.collectionId ?? "",
    ...(status ? { status } : {}),
    ...(cursor ? { cursor } : {}),
  });
  useEffect(() => {
    const stop = () => {
      active.current?.abort();
      active.current = null;
      setPending(false);
    };
    window.addEventListener("reader:suspend", stop);
    return () => {
      stop();
      window.removeEventListener("reader:suspend", stop);
    };
  }, []);
  // Background refreshes update the first page. Once extended, keep the view
  // stable until the person refreshes; ImportRefresh observes this marker.
  useEffect(() => {
    if (!extra.length) setCursor(nextCursor);
  }, [nextCursor, extra.length]);
  useEffect(() => {
    setUpdates((current) =>
      Object.fromEntries(
        Object.entries(current).filter(([id]) => !initial.some((r) => r.id === id)),
      ),
    );
  }, [initial]);
  const items = [
    ...(editRow && !initial.some((r) => r.id === editRow.id) ? [editRow] : []),
    ...initial,
    ...extra.filter((row) => !initial.some((first) => first.id === row.id)),
  ]
    .map((row) => updates[row.id] ?? row)
    .filter(
      (row) =>
        row.collectionKey === draft.collectionId &&
        (!status || row.status === status || row.id === editing),
    );
  const selectable = (row: ImportRowView) =>
    !liveDraft.closed && !working && !["imported", "skipped"].includes(row.status);
  const choices = items.filter(selectable);
  const selectedRows = items.filter((r) => selected.includes(r.id));
  const canPlace = selectedRows.length > 0 && selectedRows.every((r) => !r.collectionTitle);
  const canRetry =
    selectedRows.length > 0 &&
    selectedRows.every((r) => r.status === "failed" && r.reason === "unreachable");
  const affected = hydrated
    ? `${selected.length} ${selected.length === 1 ? "link" : "links"}`
    : "selected links";
  const current = status ? `${here}&status=${status}` : here;
  function toggle(id: string) {
    if (saving || editing) return;
    if (!selected.length) setCommandVersion(liveDraft.version);
    setSelected((ids) =>
      ids.includes(id) ? ids.filter((value) => value !== id) : ids.length < 50 ? [...ids, id] : ids,
    );
  }
  async function save(event: FormEvent<HTMLFormElement>, bulk = false) {
    event.preventDefault();
    if (saving) return;
    const data = new FormData(event.currentTarget, (event.nativeEvent as SubmitEvent).submitter);
    const body = new URLSearchParams();
    for (const [key, value] of data) if (typeof value === "string") body.append(key, value);
    setSaving(true);
    setSaveError("");
    const result = await submitForm<ImportDraftView | ImportSelectionResult>(
      bulk ? "/forms/import-selection" : "/forms/import-row",
      body,
    );
    if (!result.ok) {
      setSaving(false);
      if (result.status === 401) {
        navigateInApp(`/sign-in?returnTo=${encodeURIComponent(current)}`);
        return;
      }
      setSaveError(
        result.status === 409
          ? "This draft changed. Refresh before trying again."
          : "Could not save these changes. Your edits and selection are still here.",
      );
      return;
    }
    const nextDraft = "draft" in result.data ? result.data.draft : result.data;
    if (!nextDraft.collections.some((c) => c.id === draft.collectionId)) {
      navigateInApp("/manage/import-export?tab=review&notice=done");
      return;
    }
    if ("draft" in result.data) {
      const selection = result.data;
      setRevision(selection.draft);
      setUpdates((old) => ({
        ...old,
        ...Object.fromEntries(selection.rows.map((r) => [r.id, r])),
      }));
      setSelected([]);
      setAnnouncement(
        body.get("selectionAction") === "remove"
          ? "Selected links removed from the draft."
          : body.get("selectionAction") === "place"
            ? "Collection assigned to selected links."
            : "Selected links queued for another check.",
      );
    } else {
      setRevision(result.data);
      const row = await browserRead<ImportRowView>(
        `/api/v1/imports/${draft.id}/rows/${body.get("rowId")}`,
        AbortSignal.timeout(10000),
      );
      if (row.ok) setUpdates((old) => ({ ...old, [row.data.id]: row.data }));
      else setSaveError("Changes saved. Refresh to see the updated link.");
      setEditing(undefined);
      setAnnouncement("Link changes saved.");
    }
    setSaving(false);
    router.refresh();
  }
  async function more() {
    if (!cursor || active.current) return;
    const controller = new AbortController();
    active.current = controller;
    setPending(true);
    setError(undefined);
    const result = await browserRead<ImportRowView[]>(
      `/api/v1/imports/${draft.id}/rows?${params}`,
      controller.signal,
    );
    active.current = null;
    setPending(false);
    if (controller.signal.aborted) return;
    if (!result.ok) {
      if ([401, 403, 404].includes(result.status)) {
        refreshInApp();
        return;
      }
      setError(result);
      return;
    }
    const ids = new Set(items.map((row) => row.id));
    const additions = result.data.filter((row) => !ids.has(row.id));
    setExtra((current) => [...current, ...additions]);
    setCursor(result.meta?.nextCursor);
    setAnnouncement(
      `${additions.length} more links loaded.${result.meta?.nextCursor ? "" : " All matching links loaded."}`,
    );
    if (!result.meta?.nextCursor) table.current?.focus({ preventScroll: true });
  }
  return (
    <>
      {saveError && (
        <p role="alert" className="import-reason">
          {saveError}
        </p>
      )}
      <datalist id="import-edit-collections">
        {[
          ...new Set(
            liveDraft.folders
              .filter((f) => f.mode === "collection" && f.newTitle)
              .map((f) => f.newTitle),
          ),
        ].map((title) => (
          <option key={title} value={title} />
        ))}
      </datalist>
      <OperatorTableRegion label="Import links">
        <div
          data-import-expanded={
            extra.length > 0 || pending || saving || selected.length > 0 || editing || !firstPage
              ? "true"
              : undefined
          }
        >
          {status === "imported" && (
            <p className="meta">
              Already saved to your collections. These links will not be imported again.
            </p>
          )}
          {items.length ? (
            <table
              className="ops-table import-table"
              ref={table}
              tabIndex={-1}
              aria-busy={pending || saving}
            >
              <caption className="sr-only">Links in this import</caption>
              <thead>
                <tr>
                  <th scope="col">
                    <span className="sr-only">Select</span>
                    {hydrated && choices.length > 0 && (
                      <input
                        type="checkbox"
                        aria-label="Select visible links (up to 50)"
                        disabled={saving || !!editing}
                        checked={
                          selected.length > 0 &&
                          choices.slice(0, 50).every((r) => selected.includes(r.id))
                        }
                        ref={(input) => {
                          if (input)
                            input.indeterminate =
                              selected.length > 0 &&
                              !choices.slice(0, 50).every((r) => selected.includes(r.id));
                        }}
                        onChange={(e) => {
                          setCommandVersion(liveDraft.version);
                          setSelected(
                            e.target.checked ? choices.slice(0, 50).map((r) => r.id) : [],
                          );
                        }}
                      />
                    )}
                  </th>
                  <th scope="col">Link</th>
                  <th scope="col">Tags</th>
                  <th scope="col">Section</th>
                  <th scope="col">Collection</th>
                  <th scope="col">Status</th>
                  <th scope="col">Edit</th>
                </tr>
              </thead>
              <tbody>
                {items.map((row) => {
                  const edit = editing === row.id && selectable(row);
                  const form = `import-edit-${row.id}`;
                  const csv = liveDraft.sourceKind === "csv";
                  return (
                    <tr
                      key={row.id}
                      data-selected={selected.includes(row.id) || undefined}
                      data-editing={edit || undefined}
                      onClick={(event) => {
                        if (
                          !selectable(row) ||
                          (event.target as HTMLElement).closest(
                            "a,button,input,textarea,select,label,summary,details,form",
                          )
                        )
                          return;
                        if (window.getSelection()?.toString()) return;
                        toggle(row.id);
                      }}
                    >
                      <td data-label="Select">
                        {selectable(row) && (
                          <input
                            type="checkbox"
                            name="rowIds"
                            data-unassigned={!row.collectionTitle ? "true" : undefined}
                            data-status={row.status}
                            data-retryable={
                              row.status === "failed" && row.reason === "unreachable"
                                ? "true"
                                : undefined
                            }
                            value={row.id}
                            form="import-selection"
                            aria-label={`Select ${row.title ?? row.address}`}
                            checked={selected.includes(row.id)}
                            disabled={
                              saving ||
                              !!editing ||
                              (selected.length >= 50 && !selected.includes(row.id))
                            }
                            onChange={() => toggle(row.id)}
                          />
                        )}
                      </td>
                      <td data-label="Link">
                        <div className="import-link">
                          {row.title && <strong className="import-link-title">{row.title}</strong>}
                          {edit ? (
                            <label>
                              <span className="sr-only">Address</span>
                              <input
                                form={form}
                                name="address"
                                defaultValue={row.address}
                                maxLength={8192}
                                required
                                disabled={saving}
                              />
                            </label>
                          ) : (
                            <span
                              className={row.title ? "import-address" : "import-link-title"}
                              title={row.address}
                            >
                              {row.address}
                            </span>
                          )}
                          {edit && row.reason && (
                            <p className="import-reason">
                              {importReasons[row.reason] ?? "Check this link before importing."}
                            </p>
                          )}
                        </div>
                      </td>
                      <td data-label="Tags">
                        {edit ? (
                          <label>
                            <span className="sr-only">Tags, one per line</span>
                            <textarea
                              form={form}
                              name="tags"
                              defaultValue={formatImportTags(row.tags)}
                              rows={3}
                              wrap="off"
                              placeholder="One tag per line"
                              maxLength={2429}
                              disabled={saving}
                            />
                            <span className="meta">One per line</span>
                          </label>
                        ) : (
                          <span className="import-tags" title={row.tags.join(", ")}>
                            {row.tags.join(", ") || "—"}
                          </span>
                        )}
                      </td>
                      <td data-label="Section">
                        {edit ? (
                          <label>
                            <span className="sr-only">Section (optional)</span>
                            <input
                              form={form}
                              name="sectionTitle"
                              defaultValue={row.sectionTitle}
                              maxLength={255}
                              readOnly={csv}
                              disabled={saving}
                            />
                          </label>
                        ) : (
                          row.sectionTitle || <span className="meta">—</span>
                        )}
                      </td>
                      <td data-label="Collection">
                        {edit ? (
                          <label>
                            <span className="sr-only">Collection</span>
                            <input
                              form={form}
                              name="collectionTitle"
                              defaultValue={row.collectionTitle}
                              maxLength={255}
                              required
                              readOnly={csv}
                              disabled={saving}
                              list={csv ? undefined : "import-edit-collections"}
                            />
                          </label>
                        ) : (
                          row.collectionTitle || <span className="meta">Choose a collection</span>
                        )}
                      </td>
                      <td data-label="Status">
                        <span className="import-status" data-status={row.status}>
                          {importStatusLabels[row.status]}
                        </span>
                      </td>
                      <td data-label="Edit">
                        {edit ? (
                          <AppForm
                            id={form}
                            action="/forms/import-row"
                            method="post"
                            className="import-inline-form"
                            aria-busy={saving}
                            onSubmit={(e) => void save(e)}
                          >
                            <ImportRevision
                              draft={{ ...liveDraft, version: commandVersion ?? liveDraft.version }}
                              status={status}
                            />
                            <input type="hidden" name="rowId" value={row.id} />
                            <button
                              type="submit"
                              className="button primary"
                              aria-label="Save"
                              disabled={saving}
                            >
                              {saving ? "Saving…" : "Save"}
                            </button>
                            <a
                              href={current}
                              onClick={(e) => {
                                if (saving) {
                                  e.preventDefault();
                                  return;
                                }
                                e.preventDefault();
                                setEditing(undefined);
                                setSaveError("");
                              }}
                            >
                              Cancel
                            </a>
                          </AppForm>
                        ) : (
                          selectable(row) && (
                            <a
                              href={`${current}&edit=${row.id}`}
                              aria-label={`Edit ${row.title ?? row.address}`}
                              aria-disabled={saving || !!editing}
                              onClick={(event) => {
                                if (
                                  event.metaKey ||
                                  event.ctrlKey ||
                                  event.shiftKey ||
                                  event.altKey
                                )
                                  return;
                                event.preventDefault();
                                if (saving || editing) return;
                                setSelected([]);
                                setCommandVersion(liveDraft.version);
                                setEditing(row.id);
                                setSaveError("");
                                requestAnimationFrame(() =>
                                  document
                                    .querySelector<HTMLInputElement>(
                                      `input[form="import-edit-${row.id}"][name="address"]`,
                                    )
                                    ?.focus({ preventScroll: true }),
                                );
                              }}
                            >
                              Edit
                            </a>
                          )
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          ) : (
            <p className="empty">
              No links match this status. <a href={here}>View all links</a>
            </p>
          )}
          <p className="sr-only" role="status">
            {announcement}
          </p>
          {(cursor || error) && (
            <div className="continuation">
              {error && (
                <p role="status">Couldn't load more links. Your current results are still here.</p>
              )}
              {error ? (
                <Retry seconds={error.retryAfter} action={() => void more()} />
              ) : (
                <a
                  className="button"
                  href={`${here}&${new URLSearchParams({ ...(status ? { status } : {}), ...(cursor ? { cursor } : {}) })}`}
                  aria-disabled={pending}
                  onClick={(event) => {
                    if (
                      event.button !== 0 ||
                      event.metaKey ||
                      event.ctrlKey ||
                      event.shiftKey ||
                      event.altKey
                    )
                      return;
                    event.preventDefault();
                    void more();
                  }}
                >
                  {pending ? "Loading…" : "Load more"}
                </a>
              )}
            </div>
          )}
          {extra.length > 0 && <p className="meta">{items.length} links shown.</p>}
          {!firstPage && (
            <p>
              <a href={status ? `${here}&status=${status}` : here}>First links</a>
            </p>
          )}
        </div>
      </OperatorTableRegion>
      <div className="import-footer">
        <AppForm action={path} method="get" className="action-form">
          <input type="hidden" name="collection" value={draft.collectionId} />
          {status && <input type="hidden" name="status" value={status} />}
          <button className="button" type="submit" disabled={saving}>
            Refresh
          </button>
        </AppForm>
        {!liveDraft.closed && (selected.length > 0 || !hydrated) && (
          <AppForm
            id="import-selection"
            action="/forms/import-selection"
            method="post"
            className="import-selection"
            aria-busy={saving}
            onSubmit={(e) => void save(e, true)}
          >
            <ImportRevision
              draft={{ ...liveDraft, version: commandVersion ?? liveDraft.version }}
              status={status}
            />
            {liveDraft.sourceKind !== "csv" && (!hydrated || canPlace) && (
              <div className="import-selection-destination">
                <label>
                  Collection for selected links
                  <input
                    name="collectionTitle"
                    maxLength={255}
                    list="import-edit-collections"
                    disabled={saving}
                  />
                </label>
                <button
                  name="selectionAction"
                  value="place"
                  type="submit"
                  className="button"
                  disabled={saving}
                >
                  Set collection for {affected}
                </button>
              </div>
            )}
            {(!hydrated || canRetry) && (
              <button
                type="submit"
                name="selectionAction"
                value="revalidate"
                className="button"
                disabled={saving}
              >
                Revalidate {affected}
              </button>
            )}
            <details className="import-remove" key={selected.join(",")}>
              <summary className="button">Remove {affected}</summary>
              <p>Remove {affected} from this draft?</p>
              <button
                type="submit"
                name="selectionAction"
                value="remove"
                className="button danger"
                disabled={saving}
              >
                Confirm removal
              </button>
            </details>
          </AppForm>
        )}
        <NativeForm
          id="import-collection"
          action="/forms/import-collection"
          className="action-form"
        >
          <ImportRevision draft={liveDraft} status={status} />
          {!liveDraft.closed && !working && liveDraft.counts.ready > 0 && (
            <button className="button primary" type="submit" disabled={saving || !!editing}>
              Import
            </button>
          )}
        </NativeForm>
        {selected.length > 0 && (
          <button
            className="text-button"
            type="button"
            disabled={saving}
            onClick={() => setSelected([])}
          >
            Clear selection
          </button>
        )}
        {!hydrated && !liveDraft.closed && (
          <button form="import-selection" type="reset" className="text-button import-native-clear">
            Clear selection
          </button>
        )}
      </div>
    </>
  );
}

export function ImportDiscard({ draft }: { draft: ImportDraftView }) {
  return (
    <details className="import-discard">
      <summary className="button">Discard draft</summary>
      <p>Discard this draft? Links already imported stay saved.</p>
      <NativeForm action="/forms/import-discard">
        <ImportRevision draft={draft} />
        <button type="submit" className="button danger">
          Confirm discard
        </button>
      </NativeForm>
    </details>
  );
}
