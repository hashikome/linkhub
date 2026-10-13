import type { HubPage, PersonProfile as PersonProfileData } from "@ntumie/types";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Feedback } from "../../components/feedback";
import { OwnedHub } from "../../components/owned-hub";
import { PersonProfile } from "../../components/person-profile";
import { PublicHub } from "../../components/public-hub";
import {
  failure,
  hubPath,
  queryValue,
  routeHandle,
  routeSegment,
  withCursor,
} from "../../lib/http";
import { readShared } from "../../lib/server-api";
import { readOwnProfile } from "../../lib/session";
import { sourcePath } from "../../lib/sharing";

export const dynamic = "force-dynamic";
export async function generateMetadata({
  params,
  searchParams,
}: {
  params: Promise<{ handle: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}): Promise<Metadata> {
  const segment = routeSegment((await params).handle);
  if (!segment.startsWith("@")) {
    const person =
      /^[a-z0-9]+(-[a-z0-9]+)*$/.test(segment) && segment.length >= 3 && segment.length <= 20
        ? await readShared<PersonProfileData>(
            withCursor(
              `/api/v1/people/by-username/${encodeURIComponent(segment)}`,
              queryValue((await searchParams).cursor),
            ),
          )
        : null;
    return {
      title: person?.ok ? person.data.person.name || person.data.person.username : "Profile",
    };
  }
  const handle = routeHandle(segment);
  const result = handle
    ? await readShared<HubPage>(withCursor(`/api/v1/hubs/by-handle/${encodeURIComponent(handle)}`))
    : null;
  return { title: result?.ok ? result.data.hub.name : "Hub" };
}
export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ handle: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const segment = routeSegment((await params).handle);
  if (!segment.startsWith("@")) {
    if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(segment) || segment.length < 3 || segment.length > 20)
      notFound();
    const query = await searchParams;
    return (
      <PersonProfile
        username={segment}
        cursor={queryValue(query.cursor)}
        notice={queryValue(query.notice)}
      />
    );
  }
  const handle = routeHandle(segment);
  if (!handle) return <Feedback hub error={failure("not_found", 404)} />;
  const query = await searchParams;
  const path = `/api/v1/hubs/by-handle/${encodeURIComponent(handle)}` as const;
  // Shared with metadata and started before the owner check resolves.
  const firstPage = readShared<HubPage>(withCursor(path));
  const profile = queryValue(query.view) === "public" ? null : await readOwnProfile();
  const cursor = queryValue(query.cursor);
  // Resolve the immutable identity before applying an owner's list cursor.
  let result = await (profile || !cursor
    ? firstPage
    : readShared<HubPage>(withCursor(path, cursor)));
  if (!result.ok) return <Feedback hub error={result} resetPath={hubPath(handle)} />;
  if (profile?.hubId === result.data.hub.id)
    return (
      <OwnedHub
        profile={profile}
        cursor={queryValue(query.cursor)}
        returnTo={sourcePath(hubPath(handle), query)}
      />
    );
  if (profile && cursor) result = await readShared<HubPage>(withCursor(path, cursor));
  if (!result.ok) return <Feedback hub error={result} resetPath={hubPath(handle)} />;
  return (
    <PublicHub
      returnTo={sourcePath(hubPath(handle), query)}
      data={result.data}
      nextCursor={result.meta?.nextCursor}
      preview={queryValue(query.view) === "public"}
    />
  );
}
