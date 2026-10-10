"use client";
import { useEffect, useState } from "react";

import { calendarDate, dayBoundary } from "../lib/time";
import { useTimeZone } from "./time-zone";

function dateInput(value: string | undefined, timeZone: string) {
  if (!value) return "";
  return /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : calendarDate(value, timeZone);
}

export function AuditDates({ from, to }: { from?: string; to?: string }) {
  const { timeZone, ready } = useTimeZone();
  const zone = timeZone ?? "UTC";
  const [enhanced, setEnhanced] = useState(false);
  useEffect(() => setEnhanced(true), []);
  const [start, setStart] = useState(() => dateInput(from, zone));
  const [end, setEnd] = useState(() => dateInput(to, zone));
  useEffect(() => {
    setStart(dateInput(from, zone));
    setEnd(dateInput(to, zone));
  }, [from, to, zone]);
  return (
    <>
      <label>
        From
        <input
          type="date"
          name="from"
          value={start}
          onChange={(event) => setStart(event.target.value)}
        />
      </label>
      <label>
        To
        <input type="date" name="to" value={end} onChange={(event) => setEnd(event.target.value)} />
      </label>
      <input
        type="hidden"
        name="fromInstant"
        disabled={!ready || !enhanced}
        value={ready ? dayBoundary(start, false, zone) : ""}
      />
      <input
        type="hidden"
        name="toInstant"
        disabled={!ready || !enhanced}
        value={ready ? dayBoundary(end, true, zone) : ""}
      />
    </>
  );
}
