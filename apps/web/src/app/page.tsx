import type { Metadata } from "next";
import { FormNotice } from "../components/form-notice";
import { LandingQuestions } from "../components/landing-questions";
import { ShareAction } from "../components/share-action";
import { ShareOpen } from "../components/share-open";
import { queryValue } from "../lib/http";

export const metadata: Metadata = {
  title: { absolute: "nslinkhub · Useful links, collected and shared" },
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
            nslinkhub brings useful links together in collections, with a personal hub to call home.
          </p>
          <div className="landing-actions">
            <a className="button primary" href="/capture">
              Save your first link
            </a>
            <a className="button landing-secondary" href="/sign-in">
              Sign in
            </a>
          </div>
        </div>
        <figure className="collection-example collection-sheet" aria-label="Example collection">
          <div className="sheet-bar">
            <span className="context">
              <span>Ada's reading shelf</span>
            </span>
            <span className="example-badge">Example</span>
          </div>
          <div className="page-heading">
            <h2>Type for screens</h2>
            <p className="description">
              How to choose, size and set type for interfaces people read for hours.
            </p>
            <ul className="tags" aria-label="Tags">
              <li>typography</li>
              <li>design</li>
            </ul>
            <div className="row-meta">
              <span>@ada-reads</span>
              <span>Published by Ada Lindqvist</span>
              <span>Updated 2 days ago</span>
            </div>
          </div>
          <ol className="resource-list">
            <li className="resource-heading">
              <h3>Foundations</h3>
            </li>
            <li className="resource-row">
              <h3>Practical Typography</h3>
              <p className="meta resource-meta">practicaltypography.com</p>
            </li>
            <li className="resource-row">
              <h3>Modern CSS techniques to improve legibility</h3>
              <p className="meta resource-meta">smashingmagazine.com</p>
            </li>
            <li className="resource-heading">
              <h3>Keep reading</h3>
            </li>
            <li className="resource-row">
              <h3>Small details, better interfaces</h3>
              <p className="meta resource-meta">
                <span className="resource-kind">Collection</span>
              </p>
            </li>
          </ol>
          <figcaption className="sr-only">
            Example collection: a few good finds, one place to come back to.
          </figcaption>
        </figure>
      </section>
      <section className="landing-discovery" aria-labelledby="discovery-title">
        <div>
          <h2 id="discovery-title">
            Someone already found
            <br />
            your next good read.
          </h2>
          <a href="/discover">Discover the links someone kept</a>
          <p>
            <ShareAction
              target={{ kind: "site" }}
              returnTo="/"
              label="Share nslinkhub"
              className=""
            />
          </p>
        </div>
      </section>
    </div>
  );
}
