import type { Metadata } from "next";
import { AboutCollection } from "../../components/about-collection";
import { LandingHero } from "../../components/landing-hero";
import { ShareAction } from "../../components/share-action";
import { queryValue } from "../../lib/http";

export const metadata: Metadata = {
  title: "About ntumie.",
  description: "Find support, meet the person building it, and share ntumie.",
};
export const dynamic = "force-dynamic";

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const query = await searchParams;
  return (
    <div className="landing" data-reader>
      <LandingHero
        about
        action={
          <ShareAction
            target={{ kind: "site" }}
            returnTo="/about"
            label="Share ntumie."
            className="button primary"
          />
        }
      >
        <AboutCollection selectedItemId={queryValue(query.item)} />
      </LandingHero>
    </div>
  );
}
