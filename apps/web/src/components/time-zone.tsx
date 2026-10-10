"use client";
import { createContext, type ReactNode, useContext, useEffect, useState } from "react";

const TimeZoneContext = createContext({
  timeZone: undefined as string | undefined,
  preference: null as string | null,
  ready: false,
  locale: "en-GB" as string | undefined,
  setPreference: (_value: string | null) => {},
});

// The saved account value is available during SSR. Automatic is resolved only
// in the browser; a guest's device choice never overwrites the account field.
export function TimeZoneProvider({
  initialTimeZone,
  children,
}: {
  initialTimeZone: string | null;
  children: ReactNode;
}) {
  const [preference, setPreference] = useState(initialTimeZone);
  const [deviceZone, setDeviceZone] = useState<string>();
  useEffect(() => setDeviceZone(Intl.DateTimeFormat().resolvedOptions().timeZone), []);
  useEffect(() => setPreference(initialTimeZone), [initialTimeZone]);
  return (
    <TimeZoneContext.Provider
      value={{
        preference,
        setPreference,
        timeZone: preference ?? deviceZone,
        ready: preference !== null || deviceZone !== undefined,
        locale: deviceZone ? undefined : "en-GB",
      }}
    >
      {children}
    </TimeZoneContext.Provider>
  );
}

export function useTimeZone() {
  return useContext(TimeZoneContext);
}

export function TimeZoneFallbackNote() {
  const { ready } = useTimeZone();
  return ready ? null : (
    <noscript>
      <p className="meta">Times shown in UTC.</p>
    </noscript>
  );
}
