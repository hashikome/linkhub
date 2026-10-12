import type { Metadata } from "next";
import { CollectionExample } from "../components/collection-example";
import { FormNotice } from "../components/form-notice";
import { LandingHero } from "../components/landing-hero";
import { ShareOpen } from "../components/share-open";
import { queryValue } from "../lib/http";

export const metadata: Metadata = {
  title: { absolute: "ntumie. · Good links belong together." },
  description: "Discover useful collections and give your favourite links a place to belong.",
};
export const dynamic = "force-dynamic";

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const query = await searchParams;
  const notice = queryValue(query.notice);
  return (
    <div className="landing" data-reader>
      <ShareOpen shareId={queryValue(query.via)} kind="site" />
      {notice === "signed-out" && <FormNotice code={notice} />}
      <LandingHero
        action={
          <a className="button primary" href="/capture">
            Save your first link
          </a>
        }
      >
        <CollectionExample selectedItemId={queryValue(query.item)} />
      </LandingHero>
    </div>
  );
}
