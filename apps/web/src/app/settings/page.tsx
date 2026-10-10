import type { Profile } from "@nslinkhub/types";
import type { Metadata } from "next";
import { ProfileEditor } from "../../components/profile-editor";
import { queryValue } from "../../lib/http";
import { operatorRead } from "../../lib/operator-read";
export const metadata: Metadata = { title: "Settings" };
export const dynamic = "force-dynamic";
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const query = await searchParams;
  const result = await operatorRead<Profile>("/api/v1/profile", "/settings");
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
        <ProfileEditor
          profile={result.data}
          timeZones={[
            ...new Set([
              "UTC",
              ...Intl.supportedValuesOf("timeZone"),
              ...(result.data.timeZone ? [result.data.timeZone] : []),
            ]),
          ].sort()}
          notice={queryValue(query.notice)}
          section={
            queryValue(query.section) === "hub"
              ? "hub"
              : queryValue(query.section) === "notifications"
                ? "notifications"
                : "profile"
          }
        />
      )}
    </section>
  );
}
