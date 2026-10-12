"use client";
import type { HandleAvailability, Profile, UsernameAvailability } from "@ntumie/types";
import { type MouseEvent, useEffect, useRef, useState } from "react";
import { browserRead } from "../lib/browser-api";
import { submitForm } from "../lib/http";
import { DeviceSettings } from "./device-settings";
import { FormNotice } from "./form-notice";
import { LocalTime } from "./local-time";
import { useTimeZone } from "./time-zone";

type Draft = {
  username: string;
  showOwner: boolean;
  displayName: string;
  bio: string;
  timeZone: string;
  hubName: string;
  handle: string;
  hubDescription: string;
};
type AvailabilityState = { status: HandleState; suggestion?: string };
type HandleState = HandleAvailability["status"] | "checking" | "error";
const handleMessages: Record<HandleState, string> = {
  current: "",
  available: "Available",
  invalid: "Use 3–60 lowercase letters, numbers and single hyphens between words.",
  reserved: "This handle is reserved. Choose another.",
  taken: "This handle is already in use. Choose another.",
  checking: "Checking availability…",
  error: "We couldn't check availability. You can still try saving your profile.",
};
function draftOf(profile: Profile): Draft {
  return {
    username: profile.username,
    displayName: profile.displayName,
    bio: profile.bio ?? "",
    timeZone: profile.timeZone ?? "",
    showOwner: profile.showOwner ?? false,
    hubName: profile.hubName ?? "",
    handle: profile.handle ?? "",
    hubDescription: profile.hubDescription ?? "",
  };
}
function sameDraft(a: Draft, b: Draft) {
  return (
    a.username === b.username &&
    a.displayName === b.displayName &&
    a.bio === b.bio &&
    a.timeZone === b.timeZone &&
    a.showOwner === b.showOwner &&
    a.hubName === b.hubName &&
    a.handle === b.handle &&
    a.hubDescription === b.hubDescription
  );
}
function readDraft(form: HTMLFormElement): Draft {
  const data = new FormData(form);
  return {
    username: String(data.get("username") ?? ""),
    displayName: String(data.get("displayName") ?? ""),
    bio: String(data.get("bio") ?? ""),
    timeZone: String(data.get("timeZone") ?? ""),
    showOwner: data.get("showOwner") === "on",
    hubName: String(data.get("hubName") ?? ""),
    handle: form.querySelector<HTMLInputElement>('[name="handle"]')?.value ?? "",
    hubDescription: String(data.get("hubDescription") ?? ""),
  };
}

function useAvailability(
  kind: "handle" | "username",
  value: string,
  current: string,
  enabled = true,
): AvailabilityState {
  const normalized = value.trim().toLowerCase();
  const valid =
    /^[a-z0-9]+(-[a-z0-9]+)*$/.test(kind === "username" ? normalized : value) &&
    normalized.length >= 3 &&
    normalized.length <= (kind === "username" ? 255 : 60);
  const [check, setCheck] = useState<AvailabilityState & { value: string }>({
    value: current,
    status: "current",
  });
  useEffect(() => {
    if (!enabled || !valid || normalized === current) return;
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      const result = await browserRead<Pick<UsernameAvailability, "status" | "suggestion">>(
        `/api/v1/profile/${kind}-availability?${kind}=${encodeURIComponent(normalized)}`,
        AbortSignal.any([controller.signal, AbortSignal.timeout(5000)]),
      );
      if (!controller.signal.aborted)
        setCheck({
          value: normalized,
          status: result.ok ? result.data.status : "error",
          ...(result.ok && kind === "username" && result.data.suggestion
            ? { suggestion: result.data.suggestion }
            : {}),
        });
    }, 400);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [enabled, valid, normalized, current, kind]);
  if (!enabled || normalized === current) return { status: "current" };
  if (!valid) return { status: "invalid" };
  return check.value === normalized ? check : { status: "checking" };
}

export type SettingsSection = "profile" | "hub" | "notifications" | "device";
export function ProfileEditor({
  profile,
  notice,
  section: initialSection = "profile",
  timeZones,
}: {
  profile: Profile;
  notice?: string;
  section?: SettingsSection;
  timeZones: string[];
}) {
  const { setPreference } = useTimeZone();
  const [section, setSection] = useState<SettingsSection>(initialSection);
  useEffect(() => {
    const sync = () => {
      const value = new URL(window.location.href).searchParams.get("section");
      setSection(
        value === "hub" || value === "notifications" || value === "device" ? value : "profile",
      );
    };
    window.addEventListener("popstate", sync);
    return () => window.removeEventListener("popstate", sync);
  }, []);
  const [saved, setSaved] = useState(profile);
  const [draft, setDraft] = useState(() => draftOf(profile));
  const form = useRef<HTMLFormElement>(null);
  const latest = useRef(draft);
  const [enhanced, setEnhanced] = useState(false);
  const [savingPart, setSavingPart] = useState<"profile" | "handle" | null>(null);
  const saving = savingPart !== null;
  const busy = useRef(false);
  const navigateAfterSave = useRef<"profile" | "hub" | null>(null);
  const [feedback, setFeedback] = useState<{
    message: string;
    success: boolean;
    signIn?: boolean;
    part: "profile" | "handle";
  }>();
  const { status: handleState } = useAvailability(
    "handle",
    draft.handle,
    saved.handle ?? "",
    !!saved.hubId,
  );
  const { status: usernameState, suggestion } = useAvailability(
    "username",
    draft.username,
    saved.username,
  );
  const invalidStates = ["invalid", "checking", "taken", "reserved"];
  const validFormat = draft.username.trim().length <= 20 && !invalidStates.includes(usernameState);
  const dirty = !sameDraft(draft, { ...draftOf(saved), handle: draft.handle });
  const savedFeedback =
    !saving && !dirty && (feedback ? feedback.success : notice === "profile-saved");

  useEffect(() => {
    // Preserve typing/autofill that happened before hydration. Native controls
    // own their values; React owns validation and confirmed-save feedback.
    if (form.current) {
      latest.current = readDraft(form.current);
      setDraft(latest.current);
    }
    setEnhanced(true);
  }, []);
  const edit = () => {
    if (!form.current) return;
    const next = readDraft(form.current);
    latest.current = next;
    setDraft(next);
    setFeedback(undefined);
  };

  function openPublicView(event: MouseEvent<HTMLAnchorElement>, target: "profile" | "hub") {
    if (
      !enhanced ||
      (!dirty && !saving) ||
      event.metaKey ||
      event.ctrlKey ||
      event.shiftKey ||
      event.altKey
    )
      return;
    event.preventDefault();
    if (!form.current) return;
    for (const field of form.current.elements) {
      if (
        (field instanceof HTMLInputElement ||
          field instanceof HTMLTextAreaElement ||
          field instanceof HTMLSelectElement) &&
        field.name !== "handle" &&
        !field.reportValidity()
      )
        return;
    }
    navigateAfterSave.current = target;
    if (!saving) void save("profile");
  }

  // Native fields retain typing during requests; only confirmed server values
  // replace an unchanged draft. Newer edits schedule their own subsequent save.
  async function save(part: "profile" | "handle" = "profile") {
    if (busy.current || !form.current) return;
    busy.current = true;
    setSavingPart(part);
    setFeedback(undefined);
    const submitted = readDraft(form.current);
    latest.current = submitted;
    setDraft(submitted);
    try {
      const result = await submitForm<Profile>(
        "/forms/profile-save",
        new URLSearchParams(
          part === "handle"
            ? { savePart: "handle", handle: submitted.handle }
            : {
                username: submitted.username,
                displayName: submitted.displayName,
                bio: submitted.bio,
                timeZone: submitted.timeZone,
                ...(saved.hubId
                  ? {
                      showOwner: submitted.showOwner ? "on" : "",
                      hubName: submitted.hubName,
                      hubDescription: submitted.hubDescription,
                    }
                  : {}),
              },
        ),
      );
      if (result.ok) {
        setSaved(result.data);
        setPreference(result.data.timeZone);
        const confirmed = draftOf(result.data);
        const next = { ...latest.current };
        for (const key of Object.keys(confirmed) as (keyof Draft)[]) {
          const sent =
            part === "handle"
              ? key === "handle"
              : key !== "handle" || (!saved.hubId && !!result.data.hubId);
          // A confirmed rename starts cooldown: reconcile that field even if
          // its DOM value changed, while preserving newer unrelated edits.
          if (sent && (key === "handle" || latest.current[key] === submitted[key])) {
            Object.assign(next, { [key]: confirmed[key] });
            const field = form.current?.querySelector(`[name="${key}"]`);
            const value = confirmed[key];
            if (field instanceof HTMLInputElement && typeof value === "boolean")
              field.checked = value;
            else if (
              (field instanceof HTMLInputElement ||
                field instanceof HTMLTextAreaElement ||
                field instanceof HTMLSelectElement) &&
              typeof value === "string"
            )
              field.value = value;
          }
        }
        latest.current = next;
        setDraft(next);
        const unchanged = sameDraft(next, { ...confirmed, handle: next.handle });
        setFeedback({
          part,
          success: true,
          message: unchanged
            ? "Your profile has been saved."
            : "Your earlier changes were saved. You still have unsaved changes.",
        });
        if (unchanged && navigateAfterSave.current) {
          window.location.assign(
            navigateAfterSave.current === "hub" && result.data.hubId
              ? `/h/${encodeURIComponent(result.data.hubId)}?view=public`
              : `/${encodeURIComponent(result.data.username)}`,
          );
          navigateAfterSave.current = null;
        }
        window.dispatchEvent(
          new CustomEvent("profile:updated", {
            detail: { name: result.data.displayName, username: result.data.username },
          }),
        );
      } else {
        navigateAfterSave.current = null;
        const code = result.code;
        const message =
          code === "username_unavailable"
            ? "That username is already in use. Choose another."
            : code === "username_reserved" || code === "username_invalid"
              ? "Choose a different username using lowercase letters, numbers and hyphens."
              : code === "handle_change_cooldown"
                ? "You can change your hub handle once every 30 days. Reload Settings to see when."
                : code === "handle_unavailable"
                  ? "That hub handle is already in use. Choose another."
                  : code === "handle_reserved" || code === "handle_invalid"
                    ? "Choose a different hub handle using lowercase letters, numbers and hyphens."
                    : code === "unauthorized"
                      ? "Your session ended. Continue with email before saving."
                      : code === "too_many_requests"
                        ? "Too many attempts. Wait a minute, then save again."
                        : code === "validation_failed"
                          ? "Check your name and hub handle, then save again."
                          : "We couldn't confirm the save. Your edits are still here; try saving again.";
        setFeedback({ part, success: false, message, signIn: code === "unauthorized" });
      }
    } catch {
      navigateAfterSave.current = null;
      setFeedback({
        part,
        success: false,
        message: "We couldn't confirm the save. Your edits are still here; try saving again.",
      });
    } finally {
      busy.current = false;
      setSavingPart(null);
    }
  }

  useEffect(() => {
    if (
      !enhanced ||
      !dirty ||
      saving ||
      !validFormat ||
      (saved.hubId && !draft.hubName.trim()) ||
      (feedback?.part === "profile" && !feedback.success)
    )
      return;
    const timer = setTimeout(() => {
      if (form.current?.checkValidity()) form.current.requestSubmit();
    }, 800);
    return () => clearTimeout(timer);
  }, [enhanced, dirty, draft, saving, validFormat, feedback, saved.hubId]);

  return (
    <div className="settings-layout">
      <nav className="settings-nav" aria-label="Settings sections">
        {(
          [
            ["profile", "Profile"],
            ["hub", "Hub"],
            ["notifications", "Notifications"],
            ["device", "On this device"],
          ] as const
        ).map(([key, label]) => (
          <a
            key={key}
            href={key === "profile" ? "/settings" : `/settings?section=${key}`}
            aria-current={section === key ? "page" : undefined}
            onClick={(event) => {
              if (
                event.button !== 0 ||
                event.metaKey ||
                event.ctrlKey ||
                event.shiftKey ||
                event.altKey
              )
                return;
              event.preventDefault();
              if (dirty && !form.current?.reportValidity()) return;
              setSection(key);
              window.history.pushState(null, "", event.currentTarget.href);
            }}
          >
            {label}
          </a>
        ))}
        <a href="/settings/security">Security</a>
      </nav>
      <div className="settings-content">
        {!feedback && !dirty && !["profile-saved", "device-saved"].includes(notice ?? "") && (
          <FormNotice code={notice} />
        )}
        <form
          ref={form}
          action="/forms/profile-save"
          method="post"
          className="action-form"
          aria-busy={saving}
          onSubmit={(event) => {
            event.preventDefault();
            void save();
          }}
        >
          <input type="hidden" name="section" value={section} />
          <div className="account-fields">
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
                  defaultValue={profile.displayName}
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
                    defaultValue={profile.username}
                    onChange={edit}
                    aria-describedby="username-help username-status"
                    aria-invalid={
                      enhanced && ["invalid", "reserved", "taken"].includes(usernameState)
                    }
                  />
                  <p className="field-help" id="username-help">
                    3–20 characters. Saved in lowercase. Hyphens do not make a username available.
                    Dots are not allowed.{" "}
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
                    defaultValue={profile.bio ?? ""}
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
                  <select
                    id="time-zone"
                    name="timeZone"
                    defaultValue={profile.timeZone ?? ""}
                    onChange={edit}
                    aria-describedby="time-zone-help"
                  >
                    <option value="">Automatic (your device’s timezone)</option>
                    {timeZones.map((zone) => (
                      <option key={zone} value={zone}>
                        {zone.replaceAll("_", " ")}
                      </option>
                    ))}
                  </select>
                  <p className="field-help" id="time-zone-help">
                    Choose how dates and times appear. A selected timezone follows your account
                    across devices.
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
            <fieldset className="account-field-group" hidden={section !== "hub"}>
              <legend>Hub</legend>
              {!saved.hubId ? (
                <p className="field-help">
                  Your hub is created when you save your first link or create a collection. You can
                  read and contribute without one. <a href="/hub">Create your hub</a> or{" "}
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
                      defaultValue={saved.hubName ?? ""}
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
                        aria-invalid={
                          enhanced && ["invalid", "reserved", "taken"].includes(handleState)
                        }
                        readOnly={!!saved.handleChangeAvailableAt || savingPart === "handle"}
                        defaultValue={saved.handle ?? ""}
                        onChange={edit}
                      />
                      <p className="field-help">
                        You can change your handle once every 30 days. Once changed, your previous
                        handle can never be used again. Shared links will keep working.
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
                          defaultChecked={saved.showOwner ?? false}
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
                      defaultValue={saved.hubDescription ?? ""}
                      onChange={edit}
                    />
                  </div>
                </>
              )}
            </fieldset>
          </div>
          <div
            className="profile-save-actions"
            hidden={(section === "notifications" || section === "device") && !dirty && !saving}
          >
            <noscript>
              <button className="button primary" type="submit">
                Save changes
              </button>
            </noscript>
            <span
              className={`profile-save-status meta${savedFeedback ? " success" : ""}`}
              role="status"
            >
              {saving ? (
                "Saving…"
              ) : dirty ? (
                feedback?.success ? (
                  "Newer changes aren't saved yet."
                ) : (
                  "Unsaved changes"
                )
              ) : savedFeedback ? (
                <>
                  <span aria-hidden="true">✓ </span>Saved
                </>
              ) : (
                ""
              )}
            </span>
          </div>
          {feedback && !feedback.success && (
            <div className="form-notice error" role="alert">
              <p>{feedback.message}</p>
              {enhanced && !feedback.signIn && (
                <button
                  type="button"
                  className="button"
                  onClick={() => {
                    const target =
                      feedback.part === "handle"
                        ? document.getElementById("profile-handle-form")
                        : form.current;
                    if (target instanceof HTMLFormElement) target.requestSubmit();
                  }}
                >
                  Retry
                </button>
              )}
              {feedback.signIn && <a href="/sign-in?returnTo=%2Fsettings">Sign in</a>}
            </div>
          )}
        </form>
        <form
          id="profile-handle-form"
          action="/forms/profile-save"
          method="post"
          onSubmit={(event) => {
            event.preventDefault();
            void save("handle");
          }}
        >
          <input type="hidden" name="savePart" value="handle" />
          <input type="hidden" name="section" value="hub" />
        </form>
        <DeviceSettings hidden={section !== "device"} saved={notice === "device-saved"} />
        <p hidden={section !== "profile"}>
          <a href="/account">Account access and deletion</a>
        </p>
        <section
          className="notification-settings"
          hidden={section !== "notifications"}
          aria-labelledby="notification-settings-heading"
        >
          <h2 id="notification-settings-heading">Notifications</h2>
          <dl className="account-facts">
            <div>
              <dt>Invitations</dt>
              <dd>Always on</dd>
            </div>
          </dl>
          <p className="field-help">
            Invitations appear in your inbox. Invitation links and sign-in codes are sent by email.
          </p>
        </section>
      </div>
    </div>
  );
}
