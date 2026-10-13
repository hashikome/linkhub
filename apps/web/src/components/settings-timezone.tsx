"use client";
import { useState } from "react";
import { flushSync } from "react-dom";

// Ship the selected value only. Populate the native picker before it opens,
// rather than serializing/rendering hundreds of unused options on every visit.
let available: string[] | undefined;
export function SettingsTimezone({ value, onChange }: { value: string; onChange: () => void }) {
  const [expanded, setExpanded] = useState(false);
  const expand = () => {
    if (!expanded) flushSync(() => setExpanded(true));
  };
  if (expanded && !available) available = ["UTC", ...Intl.supportedValuesOf("timeZone")];
  const options = expanded
    ? [...new Set([...(available ?? []), ...(value ? [value] : [])])].sort()
    : value
      ? [value]
      : [];
  return (
    <select
      id="time-zone"
      name="timeZone"
      defaultValue={value}
      onChange={onChange}
      onFocus={expand}
      onPointerDown={expand}
      aria-describedby="time-zone-help"
    >
      <option value="">Automatic (your device’s timezone)</option>
      {options.map((zone) => (
        <option key={zone} value={zone}>
          {zone.replaceAll("_", " ")}
        </option>
      ))}
    </select>
  );
}
