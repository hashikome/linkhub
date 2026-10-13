import { auditActions, authenticationAuditActions, operatorAuditActions } from "@ntumie/types";
import { auditActionLabel } from "../lib/audit-presentation";
import { queryValue } from "../lib/http";
import { AppForm } from "./app-form";
import { AuditDates } from "./audit-dates";

export function AuditFilters({ query }: { query: Record<string, string | string[] | undefined> }) {
  const search = queryValue(query.q) ?? queryValue(query.actor) ?? queryValue(query.targetId) ?? "";
  const reads = queryValue(query.view) === "all";
  const filtered =
    reads ||
    ["q", "actor", "targetId", "hub", "action", "from", "to", "fromInstant", "toInstant"].some(
      (key) => Boolean(queryValue(query[key])),
    );
  // Client navigation keeps uncontrolled fields; remount so they show the applied,
  // server-normalised filters rather than what was typed.
  const applied = ["q", "actor", "targetId", "hub", "action", "from", "to", "view"]
    .map((key) => `${key}=${queryValue(query[key]) ?? ""}`)
    .join("&");
  return (
    <>
      <AppForm
        key={applied}
        method="post"
        action="/forms/manage-search"
        className="ops-filters audit-filters"
      >
        <input type="hidden" name="page" value="audit" />
        <label className="audit-search">
          Search
          <input
            type="search"
            name="q"
            placeholder="Actor, action, target, outcome or change"
            defaultValue={search}
            maxLength={200}
            autoComplete="off"
          />
        </label>
        <label>
          Action
          <select name="action" aria-label="Action" defaultValue={queryValue(query.action) ?? ""}>
            <option value="">All actions</option>
            {[
              ...new Set([...auditActions, ...operatorAuditActions, ...authenticationAuditActions]),
            ].map((action) => (
              <option key={action} value={action}>
                {auditActionLabel(action)}
              </option>
            ))}
          </select>
        </label>
        <AuditDates from={queryValue(query.from)} to={queryValue(query.to)} />
        <div className="audit-filter-footer">
          <div className="audit-filter-options">
            <label className="audit-read-toggle">
              <input type="checkbox" name="view" value="all" defaultChecked={reads} />
              Include read events
            </label>
          </div>
          <div className="audit-filter-actions">
            <button type="submit" className="button">
              Apply filters
            </button>
            {filtered && (
              <a href="/manage/audit" className="ops-clear">
                Clear filters
              </a>
            )}
          </div>
        </div>
      </AppForm>
      {queryValue(query.notice) === "filters-unavailable" && (
        <p role="alert">
          Couldn't apply these filters. Check the search text and date range, then try again.
        </p>
      )}
    </>
  );
}
