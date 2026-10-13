"use client";
import { useEffect, useRef, useState } from "react";
import { submitForm } from "../lib/http";
import { AppForm } from "./app-form";
export type Theme = "light" | "dark" | "system";

export function ThemePicker({ theme, saved }: { theme: Theme; saved: boolean }) {
  const [selected, setSelected] = useState(theme);
  const [pending, setPending] = useState(false);
  const [feedback, setFeedback] = useState(saved ? "Appearance saved." : "");
  const saving = useRef(false);
  useEffect(() => setSelected(theme), [theme]);
  return (
    <AppForm
      action="/forms/theme"
      method="post"
      className="theme-picker"
      onSubmit={async (event) => {
        event.preventDefault();
        if (saving.current) return;
        const submitter = (event.nativeEvent as SubmitEvent).submitter as HTMLButtonElement | null;
        const next = submitter?.value;
        if (next !== "light" && next !== "dark" && next !== "system") return;
        saving.current = true;
        setPending(true);
        setFeedback("Saving…");
        const previous = selected;
        const session = document.documentElement.dataset.session;
        setSelected(next);
        document.documentElement.dataset.theme = next;
        const result = await submitForm<{ theme: Theme }>(
          "/forms/theme",
          new URLSearchParams({ theme: next }),
        );
        if (result.ok) setFeedback("Appearance saved.");
        else {
          setSelected(previous);
          if (
            document.documentElement.dataset.session === session &&
            document.documentElement.dataset.theme === next
          )
            document.documentElement.dataset.theme = previous;
          setFeedback("Couldn’t save your appearance. Try again.");
        }
        saving.current = false;
        setPending(false);
      }}
    >
      <fieldset
        className="account-field-group"
        aria-describedby="appearance-help"
        disabled={pending}
      >
        <legend>Appearance</legend>
        <p className="field-help" id="appearance-help">
          System follows your device’s light or dark appearance. Your choice is saved in this
          browser and used while you’re signed in.
        </p>
        <div className="theme-options">
          {(["system", "light", "dark"] as const).map((value) => (
            <button
              key={value}
              type="submit"
              name="theme"
              value={value}
              aria-pressed={selected === value}
            >
              {value[0].toUpperCase() + value.slice(1)}
            </button>
          ))}
        </div>
        <p className="meta" role="status">
          {feedback}
        </p>
      </fieldset>
    </AppForm>
  );
}
