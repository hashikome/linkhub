"use client";
import { useRef, useState } from "react";
import { submitForm } from "../lib/http";
import { useResourceNavigation } from "./resource-navigation";

export function DeviceSettings({ hidden, saved }: { hidden: boolean; saved: boolean }) {
  const { newTab, setNewTab } = useResourceNavigation();
  const busy = useRef(false);
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState(saved ? "Saved" : "");
  return (
    <form
      hidden={hidden}
      action="/forms/device-preferences"
      method="post"
      className="action-form"
      aria-busy={saving}
      onSubmit={async (event) => {
        event.preventDefault();
        if (busy.current) return;
        const enabled = new FormData(event.currentTarget).get("resourceSameTab") === "on";
        busy.current = true;
        setSaving(true);
        setFeedback("");
        const result = await submitForm<{ resourceSameTab: boolean }>(
          "/forms/device-preferences",
          new URLSearchParams(enabled ? { resourceSameTab: "on" } : {}),
        );
        if (result.ok) setNewTab(!result.data.resourceSameTab);
        setFeedback(result.ok ? "Saved" : "Couldn't save. Try again.");
        busy.current = false;
        setSaving(false);
      }}
    >
      <fieldset className="account-field-group" disabled={saving}>
        <legend>On this device</legend>
        <div className="settings-field">
          <label htmlFor="resource-same-tab">Open external resources in the same tab</label>
          <div className="settings-field-control">
            <div className="settings-toggle-control">
              <input
                id="resource-same-tab"
                name="resourceSameTab"
                type="checkbox"
                // biome-ignore lint/a11y/useAriaPropsForRole: Native checkbox exposes checked state without JavaScript.
                role="switch"
                defaultChecked={!newTab}
                onChange={() => setFeedback("")}
                aria-describedby="resource-same-tab-help"
              />
              <span className="settings-toggle-track" aria-hidden="true" />
            </div>
            <p className="field-help" id="resource-same-tab-help">
              External resources open in new tabs by default. Links within ntumie. always stay in
              the same tab. Saved only in this browser; your other devices keep their own setting.
            </p>
          </div>
        </div>
        <div className="form-actions">
          <button className="button primary" type="submit">
            Save preference
          </button>
          <span className="meta" role="status">
            {saving ? "Saving…" : feedback}
          </span>
        </div>
      </fieldset>
    </form>
  );
}
