"use client";

import type { Profile, UsernameAvailability } from "@ntumie/types";
import dynamic from "next/dynamic";
import { useRouter, useSearchParams } from "next/navigation";
import { type MouseEvent, useEffect, useRef, useState } from "react";
import { browserRead } from "../lib/browser-api";
import { submitForm } from "../lib/http";
import { navigateInApp } from "../lib/navigation";
import { AppForm } from "./app-form";
import { FormNotice } from "./form-notice";
import { type Draft, type HandleState, SettingsFieldContext } from "./settings-field-context";
import SettingsProfileFields from "./settings-profile-fields";
import type { Theme } from "./theme-picker";
import { useTimeZone } from "./time-zone";

const loading = () => (
  <p className="field-help" role="status">
    Loading settings…
  </p>
);
const SettingsHubFields = dynamic(() => import("./settings-hub-fields"), { loading });
const SettingsDevice = dynamic(() => import("./settings-device"), { loading });
const SettingsNotifications = dynamic(() => import("./settings-notifications"), { loading });

type AvailabilityState = { status: HandleState; suggestion?: string };
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
function readDraft(form: HTMLFormElement, previous: Draft): Draft {
  const data = new FormData(form);
  const value = (key: keyof Draft) =>
    data.has(key) ? String(data.get(key) ?? "") : String(previous[key]);
  return {
    username: value("username"),
    displayName: value("displayName"),
    bio: value("bio"),
    timeZone: value("timeZone"),
    showOwner: form.querySelector('[name="showOwner"]')
      ? data.get("showOwner") === "on"
      : previous.showOwner,
    hubName: value("hubName"),
    handle: form.querySelector<HTMLInputElement>('[name="handle"]')?.value ?? previous.handle,
    hubDescription: value("hubDescription"),
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
export function ProfileEditor({ profile, theme }: { profile: Profile; theme: Theme }) {
  const router = useRouter();
  const query = useSearchParams();
  const notice = query.get("notice") ?? undefined;
  const requestedSection = query.get("section");
  const initialSection: SettingsSection =
    requestedSection === "hub" ||
    requestedSection === "notifications" ||
    requestedSection === "device"
      ? requestedSection
      : "profile";
  const { setPreference } = useTimeZone();
  const [section, setSection] = useState<SettingsSection>(initialSection);
  useEffect(() => setSection(initialSection), [initialSection]);
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
  const [visited, setVisited] = useState(() => new Set<SettingsSection>([initialSection]));
  useEffect(() => {
    setVisited((previous) => (previous.has(section) ? previous : new Set([...previous, section])));
  }, [section]);
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
      latest.current = readDraft(form.current, latest.current);
      setDraft(latest.current);
    }
    setEnhanced(true);
  }, []);
  const edit = () => {
    if (!form.current) return;
    const next = readDraft(form.current, latest.current);
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
    const submitted = readDraft(form.current, latest.current);
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
          navigateInApp(
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
    <SettingsFieldContext
      value={{
        profile,
        saved,
        draft,
        section,
        enhanced,
        saving,
        savingPart,
        usernameState,
        handleState,
        suggestion,
        form,
        edit,
        openPublicView,
      }}
    >
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
                router.push(event.currentTarget.href, { scroll: false });
              }}
            >
              {label}
            </a>
          ))}
          <a href="/settings/security">Security</a>
        </nav>
        <div className="settings-content">
          {!feedback &&
            !dirty &&
            !["profile-saved", "device-saved", "appearance-saved"].includes(notice ?? "") && (
              <FormNotice code={notice} />
            )}
          <AppForm
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
            {section !== "profile" &&
              !visited.has("profile") &&
              (["username", "displayName", "bio", "timeZone"] as const).map((name) => (
                <input key={name} type="hidden" name={name} value={draft[name]} />
              ))}
            {section !== "hub" && !visited.has("hub") && saved.hubId && (
              <>
                <input type="hidden" name="hubName" value={draft.hubName} />
                <input type="hidden" name="hubDescription" value={draft.hubDescription} />
                <input type="hidden" name="showOwner" value={draft.showOwner ? "on" : ""} />
              </>
            )}

            <div className="account-fields">
              {(section === "profile" || visited.has("profile")) && <SettingsProfileFields />}
              {(section === "hub" || visited.has("hub")) && <SettingsHubFields />}
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
          </AppForm>
          <AppForm
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
          </AppForm>
          {(section === "device" || visited.has("device")) && (
            <div hidden={section !== "device"}>
              <SettingsDevice theme={theme} notice={notice} />
            </div>
          )}
          <p hidden={section !== "profile"}>
            <a href="/account">Account access and deletion</a>
          </p>
          {(section === "notifications" || visited.has("notifications")) && (
            <div hidden={section !== "notifications"}>
              <SettingsNotifications />
            </div>
          )}
        </div>
      </div>
    </SettingsFieldContext>
  );
}
