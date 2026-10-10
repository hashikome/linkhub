"use client";
import { useEffect, useState } from "react";

function dateInput(value: string | undefined, local: boolean) {
  if (!value) return "";
  if (!local || /^\d{4}-\d{2}-\d{2}$/.test(value)) return value.slice(0, 10);
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "";
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function boundary(value: string, end: boolean) {
  if (!value) return "";
  const date = new Date(`${value}T${end ? "23:59:59.999" : "00:00:00.000"}`);
  return Number.isFinite(date.getTime()) ? date.toISOString() : "";
}

export function AuditDates({ from, to }: { from?: string; to?: string }) {
  const [local, setLocal] = useState(false);
  const [start, setStart] = useState(() => dateInput(from, false));
  const [end, setEnd] = useState(() => dateInput(to, false));
  useEffect(() => {
    setLocal(true);
    setStart(dateInput(from, true));
    setEnd(dateInput(to, true));
  }, [from, to]);
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
        disabled={!local}
        value={local ? boundary(start, false) : ""}
      />
      <input
        type="hidden"
        name="toInstant"
        disabled={!local}
        value={local ? boundary(end, true) : ""}
      />
    </>
  );
}
