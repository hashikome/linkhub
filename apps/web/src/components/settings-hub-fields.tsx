"use client";
import { LocalTime } from "./local-time";
import { handleMessages, useSettingsFields } from "./settings-field-context";

const invalidStates = ["invalid", "checking", "taken", "reserved"];
export default function SettingsHubFields() {
  const { saved, draft, section, enhanced, saving, savingPart, handleState, edit, openPublicView } =
    useSettingsFields();
  return (
    <fieldset className="account-field-group" hidden={section !== "hub"}>
      <legend>Hub</legend>
      {!saved.hubId ? (
        <p className="field-help">
          Your hub is created when you save your first link or create a collection. You can read and
          contribute without one. <a href="/hub">Create your hub</a> or{" "}
          <a href="/capture">Save your first link</a>.
        </p>
      ) : (
        <>
          <dl className="account-facts">
            <div>
              <dt>Hub ID</dt>
              <dd className="hub-id">{saved.hubId ?? "Not available"}</dd>
            </div>
          </dl>
          <div className="settings-field">
            <label htmlFor="hub-name">Hub name</label>
            <input
              id="hub-name"
              name="hubName"
              required
              maxLength={255}
              defaultValue={draft.hubName}
              onChange={edit}
            />
          </div>
          <div className="settings-field">
            <label htmlFor="handle">Handle</label>
            <div className="settings-field-control">
              <input
                id="handle"
                name="handle"
                form="profile-handle-form"
                required
                minLength={3}
                maxLength={60}
                pattern="[a-z0-9]+(-[a-z0-9]+)*"
                title="3–60 lowercase letters, numbers and hyphens"
                autoCapitalize="none"
                spellCheck={false}
                aria-describedby={`handle-help handle-status${saved.handleChangeAvailableAt ? " handle-cooldown" : ""}`}
                aria-invalid={enhanced && ["invalid", "reserved", "taken"].includes(handleState)}
                readOnly={!!saved.handleChangeAvailableAt || savingPart === "handle"}
                defaultValue={draft.handle}
                onChange={edit}
              />
              <p className="field-help">
                You can change your handle once every 30 days. Once changed, your previous handle
                can never be used again. Shared links will keep working.
              </p>
              {saved.handleChangeAvailableAt && (
                <p className="field-help" id="handle-cooldown">
                  You can change your handle again on{" "}
                  <LocalTime at={saved.handleChangeAvailableAt} />.
                </p>
              )}
              <p className="field-help">Your hub address: /@{draft.handle}</p>
              <button
                className="button handle-save-button"
                type="submit"
                form="profile-handle-form"
                disabled={
                  !!saved.handleChangeAvailableAt ||
                  (enhanced &&
                    (saving ||
                      draft.handle === saved.handle ||
                      invalidStates.includes(handleState)))
                }
              >
                Save handle
              </button>
              <p id="handle-help" className="field-help">
                <a
                  href={`/h/${encodeURIComponent(saved.hubId)}?view=public`}
                  onClick={(event) => openPublicView(event, "hub")}
                >
                  View your public hub
                </a>
              </p>
              <p
                id="handle-status"
                className={`field-help handle-status ${["invalid", "reserved", "taken"].includes(handleState) ? "error" : handleState === "available" ? "success" : ""}`}
                role="status"
                hidden={!enhanced || handleState === "current"}
              >
                {handleMessages[handleState]}
              </p>
            </div>
          </div>
          <div className="settings-field">
            <label htmlFor="show-owner">Show owner</label>
            <div className="settings-field-control">
              <div className="settings-toggle-control">
                <input
                  id="show-owner"
                  name="showOwner"
                  type="checkbox"
                  // biome-ignore lint/a11y/useAriaPropsForRole: Native checkbox exposes checked state, including without JavaScript.
                  role="switch"
                  defaultChecked={draft.showOwner}
                  onChange={edit}
                  aria-describedby="show-owner-help"
                />
                <span className="settings-toggle-track" aria-hidden="true" />
              </div>
              <p className="field-help" id="show-owner-help">
                Show the owner on this hub and link to this hub from their profile.
              </p>
            </div>
          </div>
          <div className="settings-field">
            <label htmlFor="hub-description">Description</label>
            <textarea
              id="hub-description"
              name="hubDescription"
              rows={4}
              maxLength={5000}
              defaultValue={draft.hubDescription}
              onChange={edit}
            />
          </div>
        </>
      )}
    </fieldset>
  );
}
