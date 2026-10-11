import type { Metadata } from "next";
import { CollectionExample } from "../components/collection-example";
import { FormNotice } from "../components/form-notice";
import { LandingQuestions } from "../components/landing-questions";
import { ShareOpen } from "../components/share-open";
import { queryValue } from "../lib/http";

export const metadata: Metadata = {
  title: { absolute: "linkhub · Good links belong together." },
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
      <section className="landing-hero" aria-labelledby="landing-title">
        <div className="landing-intro">
          <h1 id="landing-title">
            Good links deserve
            <br />a place to belong.
          </h1>
          <LandingQuestions />
          <p>
            Turn your good finds into useful guides, share what you know, and discover what others
            have brought together.
          </p>
          <div className="landing-actions">
            <a className="button primary" href="/capture">
              Save your first link
            </a>
          </div>
        </div>

        <CollectionExample selectedItemId={queryValue(query.item)} />
      </section>
    </div>
  );
}
