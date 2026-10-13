"use client";
import { LocalTime } from "./local-time";
import { handleMessages, useSettingsFields } from "./settings-field-context";
import { SettingsTimezone } from "./settings-timezone";
export default function SettingsProfileFields() {
  const {
    profile,
    saved,
    draft,
    section,
    enhanced,
    usernameState,
    suggestion,
    form,
    edit,
    openPublicView,
  } = useSettingsFields();
  return (
    <fieldset className="account-field-group" hidden={section !== "profile"}>
      <legend>Profile</legend>
      <dl className="account-facts">
        <div>
          <dt>Email address</dt>
          <dd className="account-email">{profile.email}</dd>
        </div>
      </dl>
      <div className="settings-field">
        <label htmlFor="display-name">Full name</label>
        <input
          id="display-name"
          name="displayName"
          maxLength={255}
          autoComplete="name"
          defaultValue={draft.displayName}
          onChange={edit}
        />
      </div>
      <div className="settings-field">
        <label htmlFor="username">Username</label>
        <div className="settings-field-control">
          <input
            id="username"
            name="username"
            required
            minLength={3}
            // Enhanced drafts can exceed the saved limit to request a suggestion.
            maxLength={enhanced ? 255 : 20}
            pattern="[a-zA-Z0-9]+(-[a-zA-Z0-9]+)*"
            title="3–20 letters, numbers and single hyphens; saved in lowercase"
            autoComplete="username"
            autoCapitalize="none"
            spellCheck={false}
            defaultValue={draft.username}
            onChange={edit}
            aria-describedby="username-help username-status"
            aria-invalid={enhanced && ["invalid", "reserved", "taken"].includes(usernameState)}
          />
          <p className="field-help" id="username-help">
            3–20 characters. Saved in lowercase. Hyphens do not make a username available. Dots are
            not allowed.{" "}
            <a
              href={`/${encodeURIComponent(saved.username)}`}
              onClick={(event) => openPublicView(event, "profile")}
            >
              View your public profile
            </a>
          </p>
          <p
            id="username-status"
            role="status"
            hidden={!enhanced || usernameState === "current"}
            className={`field-help handle-status ${["invalid", "reserved", "taken"].includes(usernameState) ? "error" : usernameState === "available" ? "success" : ""}`}
          >
            {usernameState === "error" && draft.username.trim().length > 20
              ? "We couldn't suggest a shorter name. Choose 20 characters or fewer."
              : handleMessages[usernameState]
                  .replaceAll("handle", "username")
                  .replace("3–60", "3–20")}
          </p>
          {enhanced && suggestion && (
            <p className="field-help">
              <button
                type="button"
                className="text-button"
                onClick={() => {
                  const input = form.current?.elements.namedItem("username");
                  if (!(input instanceof HTMLInputElement)) return;
                  input.value = suggestion;
                  edit();
                  input.focus();
                }}
              >
                Use {suggestion}
              </button>
              {" or shorten your name."}
            </p>
          )}
        </div>
      </div>
      <div className="settings-field">
        <label htmlFor="bio">Bio</label>
        <div className="settings-field-control">
          <textarea
            id="bio"
            name="bio"
            rows={4}
            maxLength={500}
            defaultValue={draft.bio}
            onChange={edit}
            aria-describedby="bio-help"
          />
          <p className="field-help" id="bio-help">
            A little about you, shown on your public profile. Up to 500 characters.
          </p>
        </div>
      </div>
      <div className="settings-field">
        <label htmlFor="time-zone">Timezone</label>
        <div className="settings-field-control">
          <SettingsTimezone value={draft.timeZone} onChange={edit} />
          <p className="field-help" id="time-zone-help">
            Choose how dates and times appear. A selected timezone follows your account across
            devices.
          </p>
        </div>
      </div>
      <dl className="account-facts">
        <div>
          <dt>Member since</dt>
          <dd>
            <LocalTime at={profile.createdAt} variant="date" />
          </dd>
        </div>
      </dl>
      <p className="field-help">
        <a href="/support#profile-picture">How do I update my profile picture?</a>
      </p>
    </fieldset>
  );
}
