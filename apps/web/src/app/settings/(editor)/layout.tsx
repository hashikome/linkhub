import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import { ProfileEditor } from "../../../components/profile-editor";
import { readOwnProfileResult } from "../../../lib/session";
import { readTheme } from "../../../lib/theme";
export const dynamic = "force-dynamic";
export default async function SettingsLayout({ children }: { children: ReactNode }) {
  const [result, theme] = await Promise.all([readOwnProfileResult(), readTheme()]);
  if (!result.ok && result.status === 401) redirect("/sign-in?returnTo=%2Fsettings");
  return (
    <section className="reader settings-page">
      <div className="page-heading">
        <h1>Settings</h1>
      </div>
      {!result.ok ? (
        <div className="feedback">
          <p>We couldn't load your account details. Try again shortly.</p>
          <a href="/settings" className="button">
            Reload settings
          </a>
        </div>
      ) : (
        <ProfileEditor key={result.data.id} profile={result.data} theme={theme} />
      )}
      {children}
    </section>
  );
}
