"use client";
import { usePathname, useSearchParams } from "next/navigation";
export type Theme = "light" | "dark" | "system";
export function ThemePicker({
  theme,
  compact = false,
  allowSystem = true,
}: {
  theme: Theme;
  compact?: boolean;
  allowSystem?: boolean;
}) {
  const pathname = usePathname(),
    search = useSearchParams().toString();
  const nextTheme: Record<Theme, Theme> = {
    system: "light",
    light: "dark",
    dark: allowSystem ? "system" : "light",
  };
  // CSS resolves the OS preference before hydration, including native browsers.
  const automaticReader = compact && !allowSystem && theme === "system";
  const choices: Theme[] = compact
    ? automaticReader
      ? ["light", "dark"]
      : [theme]
    : allowSystem
      ? ["light", "dark", "system"]
      : ["light", "dark"];
  const toggleLabel = (value: Theme) =>
    allowSystem
      ? `Appearance: ${value}. Switch to ${nextTheme[value]}`
      : `Switch to ${nextTheme[value]} theme`;
  return (
    <form
      action="/forms/theme"
      method="post"
      className={`theme-picker${compact ? " theme-toggle" : ""}`}
    >
      <input type="hidden" name="returnTo" value={`${pathname}${search ? `?${search}` : ""}`} />
      <fieldset>
        <legend className={compact ? "sr-only" : undefined}>Appearance</legend>
        <div className="theme-options">
          {choices.map((value) => (
            <button
              key={value}
              className={automaticReader ? `theme-auto-${value}` : undefined}
              type="submit"
              name="theme"
              value={compact ? nextTheme[value] : value}
              aria-pressed={compact ? undefined : theme === value}
              aria-label={compact ? toggleLabel(value) : value[0].toUpperCase() + value.slice(1)}
              title={compact ? toggleLabel(value) : undefined}
            >
              {compact ? (
                <svg
                  width="18"
                  height="18"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.7"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  {value === "light" ? (
                    <>
                      <circle cx="12" cy="12" r="4" />
                      <path d="M12 2v2m0 16v2M2 12h2m16 0h2M5 5l1.5 1.5m11 11L19 19M5 19l1.5-1.5m11-11L19 5" />
                    </>
                  ) : value === "dark" ? (
                    <path d="M20.5 13.2A8.5 8.5 0 0 1 10.8 3.5a8.5 8.5 0 1 0 9.7 9.7Z" />
                  ) : (
                    <>
                      <rect x="3" y="4" width="18" height="13" rx="2" />
                      <path d="M12 17v4m-4 0h8" />
                    </>
                  )}
                </svg>
              ) : (
                value[0].toUpperCase() + value.slice(1)
              )}
            </button>
          ))}
        </div>
      </fieldset>
    </form>
  );
}
