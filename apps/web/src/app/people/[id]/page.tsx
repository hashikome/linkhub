import type { PersonProfile as PersonProfileData } from "@nslinkhub/types";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PersonProfile } from "../../../components/person-profile";
import { queryValue } from "../../../lib/http";
import { serverRead } from "../../../lib/server-api";
import { isUuid } from "../../../lib/validation";

export const dynamic = "force-dynamic";
export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const result = isUuid(id)
    ? await serverRead<PersonProfileData>(`/api/v1/people/${id}?limit=1`)
    : null;
  return { title: result?.ok ? result.data.person.name || result.data.person.username : "Profile" };
}
export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { id } = await params;
  if (!isUuid(id)) notFound();
  const query = await searchParams;
  return (
    <PersonProfile
      userId={id}
      shareId={queryValue(query.via)}
      cursor={queryValue(query.cursor)}
      notice={queryValue(query.notice)}
    />
  );
}
