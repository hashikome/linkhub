"use client";
import { DeviceSettings } from "./device-settings";
import { type Theme, ThemePicker } from "./theme-picker";
export default function SettingsDevice({ theme, notice }: { theme: Theme; notice?: string }) {
  return (
    <div className="device-settings">
      <ThemePicker theme={theme} saved={notice === "appearance-saved"} />
      <DeviceSettings saved={notice === "device-saved"} />
    </div>
  );
}
