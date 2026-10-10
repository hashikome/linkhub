import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AuthEntry } from "../../components/auth-entry";
import { queryValue, safeReturn } from "../../lib/http";
export const metadata: Metadata = { title: "Create your account" };
export const dynamic = "force-dynamic";
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const query = await searchParams;
  const returnTo = safeReturn(queryValue(query.returnTo) ?? "/hub");
  if (/^\/capture\/[a-f0-9-]{36}$/.test(returnTo))
    redirect(`/sign-in?returnTo=${encodeURIComponent(returnTo)}`);
  return <AuthEntry intent="sign-up" returnTo={returnTo} notice={queryValue(query.notice)} />;
}
