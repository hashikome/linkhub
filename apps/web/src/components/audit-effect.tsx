import { type AuditLogEntry, auditOutcomeLabels, auditReadActions } from "@ntumie/types";
import { auditState } from "../lib/audit-presentation";
import { AuditIdValue } from "./audit-identity";

export function AuditOutcome({ event }: { event: AuditLogEntry }) {
  const effect = event.outcome === null ? null : event;
  if (!effect) return <span className="meta">Not recorded</span>;
  const label = auditOutcomeLabels[effect.outcome ?? ""] ?? effect.outcome;
  return <span className="ops-primary">{label}</span>;
}

export function AuditEffect({ event }: { event: AuditLogEntry }) {
  const effect = event.outcome === null ? null : event;
  const read = (auditReadActions as readonly string[]).includes(event.action);
  if (!effect)
    return (
      <>
        {event.action.startsWith("share.") && event.targetUserId && (
          <span className="ops-secondary">
            Access for{" "}
            <AuditIdValue
              id={event.targetUserId}
              kind="User"
              display={event.targetUserId.split("-").at(-1)}
            />
          </span>
        )}
        {event.role && (
          <span className="ops-secondary">
            Recorded access: {event.role === "contributor" ? "Contributor" : "Viewer"}
          </span>
        )}
        <span className="meta">{read ? "Read only" : "Not recorded"}</span>
      </>
    );
  const transfer = event.action.startsWith("collection.transferred_");
  const share = event.action.startsWith("share.");
  return (
    <>
      {read && <span className="meta">Read only</span>}
      {share && event.targetUserId && (
        <span className="ops-secondary">
          Access for{" "}
          <AuditIdValue
            id={event.targetUserId}
            kind="User"
            display={event.targetUserId.split("-").at(-1)}
          />
        </span>
      )}
      {effect.beforeState && effect.afterState && event.action !== "sessions.revoke" && (
        <span className="ops-secondary">
          {transfer ? (
            <>
              Hub{" "}
              <AuditIdValue
                id={effect.beforeState}
                kind="Hub"
                display={effect.beforeState.split("-").at(-1)}
              />
              {" → "}
              <AuditIdValue
                id={effect.afterState}
                kind="Hub"
                display={effect.afterState.split("-").at(-1)}
              />
            </>
          ) : (
            <>
              {auditState(effect.beforeState)} → {auditState(effect.afterState)}
            </>
          )}
        </span>
      )}
      {!effect.beforeState && effect.afterState && (
        <span className="ops-secondary">Resulting state: {auditState(effect.afterState)}</span>
      )}
      {event.action === "link.rotated" && effect.outcome === "success" && (
        <span className="ops-secondary">
          {effect.beforeState === "enabled"
            ? "Previous share link invalidated"
            : "New share link issued"}
        </span>
      )}
      {event.action === "sessions.revoke" && (
        <span className="ops-secondary">Session count not recorded</span>
      )}
      {!read && !effect.beforeState && !effect.afterState && event.action !== "sessions.revoke" && (
        <span className="ops-secondary">Not recorded</span>
      )}
      {event.reason && (
        <span className="ops-secondary">Reason: {event.reason.replaceAll("_", " ")}</span>
      )}
    </>
  );
}
