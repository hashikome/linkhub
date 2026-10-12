import type { Metadata } from "next";
import { AboutCollection } from "../../components/about-collection";
import { LandingHero } from "../../components/landing-hero";
import { ShareAction } from "../../components/share-action";

export const metadata: Metadata = {
  title: "About ntumie.",
  description: "Find support, meet the person building it, and share ntumie.",
};
export const dynamic = "force-dynamic";

export default function Page() {
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
        <AboutCollection />
      </LandingHero>
    </div>
  );
}
