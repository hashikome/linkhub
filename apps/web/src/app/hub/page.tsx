import type { Profile } from "@nslinkhub/types";
import { redirect } from "next/navigation";
import { Feedback } from "../../components/feedback";
import { FormNotice } from "../../components/form-notice";
import { NativeForm } from "../../components/native-form";
import { queryValue } from "../../lib/http";
import { operatorRead } from "../../lib/operator-read";
export const dynamic = "force-dynamic";
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const profile = await operatorRead<Profile>("/api/v1/profile", "/hub");
  if (!profile.ok) return <Feedback error={profile} resetPath="/hub" />;
  const query = await searchParams;
  if (!profile.data.hubId) {
    return (
      <section className="reader account-flow">
        <h1>Your hub</h1>
        <FormNotice code={queryValue(query.notice)} />
        <p>Create a hub to curate collections of your own.</p>
        <p className="meta">
          You can bookmark collections, read, comment and contribute without one.
        </p>
        <NativeForm action="/forms/create-hub">
          <button type="submit" className="button primary">
            Create hub
          </button>
        </NativeForm>
      </section>
    );
  }
  const cursor = queryValue(query.cursor);
  redirect(`/h/${profile.data.hubId}${cursor ? `?cursor=${encodeURIComponent(cursor)}` : ""}`);
}
