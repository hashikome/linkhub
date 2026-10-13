"use client";
import type { HandleAvailability, Profile } from "@ntumie/types";
import { createContext, type MouseEvent, type RefObject, useContext } from "react";
export type Draft = {
  username: string;
  showOwner: boolean;
  displayName: string;
  bio: string;
  timeZone: string;
  hubName: string;
  handle: string;
  hubDescription: string;
};
export type HandleState = HandleAvailability["status"] | "checking" | "error";
export const handleMessages: Record<HandleState, string> = {
  current: "",
  available: "Available",
  invalid: "Use 3–60 lowercase letters, numbers and single hyphens between words.",
  reserved: "This handle is reserved. Choose another.",
  taken: "This handle is already in use. Choose another.",
  checking: "Checking availability…",
  error: "We couldn't check availability. You can still try saving your profile.",
};

export type SettingsFieldState = {
  profile: Profile;
  saved: Profile;
  draft: Draft;
  section: "profile" | "hub" | "notifications" | "device";
  enhanced: boolean;
  saving: boolean;
  savingPart: "profile" | "handle" | null;
  usernameState: HandleState;
  handleState: HandleState;
  suggestion?: string;
  form: RefObject<HTMLFormElement | null>;
  edit: () => void;
  openPublicView: (event: MouseEvent<HTMLAnchorElement>, target: "profile" | "hub") => void;
};
export const SettingsFieldContext = createContext<SettingsFieldState | null>(null);
export function useSettingsFields() {
  const value = useContext(SettingsFieldContext);
  if (!value) throw new Error("Settings fields require their editor");
  return value;
}
