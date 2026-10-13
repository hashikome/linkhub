import type { ReactNode } from "react";
import { LandingQuestions } from "./landing-questions";

export function LandingHero({
  about = false,
  children,
  action,
}: {
  about?: boolean;
  children: ReactNode;
  action: ReactNode;
}) {
  return (
    <section className="landing-hero" aria-labelledby="landing-title">
      <div className="landing-intro">
        <h1 id="landing-title">
          {about ? (
            "Good links belong together."
          ) : (
            <>
              Good links deserve
              <br />a place to belong.
            </>
          )}
        </h1>
        <LandingQuestions about={about} />
        <p>
          {about
            ? "Give someone else a place for their good finds. Get a little help, meet the person building it, or share ntumie."
            : "Turn your good finds into useful guides, share what you know, and discover what others have brought together."}
        </p>
        <div className="landing-actions">{action}</div>
      </div>
      {children}
    </section>
  );
}
