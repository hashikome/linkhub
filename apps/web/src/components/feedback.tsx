"use client";

import { useEffect, useState } from "react";
import type { Failure } from "../lib/http";
import { refreshInApp } from "../lib/navigation";

export function Retry({ seconds = 0, action }: { seconds?: number; action?: () => void }) {
  const [left, setLeft] = useState(seconds);
  useEffect(() => {
    const deadline = Date.now() + seconds * 1000;
    setLeft(seconds);
    const timer = setInterval(
      () => setLeft(Math.max(0, Math.ceil((deadline - Date.now()) / 1000))),
      1000,
    );
    return () => clearInterval(timer);
  }, [seconds]);
  return (
    <button
      type="button"
      className="button"
      disabled={left > 0}
      onClick={action ?? (() => refreshInApp())}
    >
      {left ? `Try again in ${left}s` : "Try again"}
    </button>
  );
}
export function Feedback({
  error,
  collection = false,
  hub = false,
  resetPath = "/discover",
  signInHref,
}: {
  error: Failure;
  collection?: boolean;
  hub?: boolean;
  resetPath?: string;
  signInHref?: string;
}) {
  const cursor = error.code === "invalid_cursor";
  const hidden = (collection || hub) && !cursor && [400, 401, 403, 404].includes(error.status);
  return (
    <section className="feedback" data-reader>
      <h1>
        {hidden
          ? hub
            ? "This hub isn't available."
            : "This collection isn't available."
          : cursor
            ? "This list has changed."
            : "We couldn't load this page."}
      </h1>
      <p>
        {hidden
          ? collection
            ? "It may be private or no longer exist."
            : "Discover other collections to find something useful."
          : cursor
            ? "Reload the list to see the latest results."
            : error.status === 429
              ? "There have been too many requests. Please wait before trying again."
              : "Check your connection and try again."}
      </p>
      {hidden || cursor ? (
        <div className="feedback-actions">
          {hidden && signInHref && (
            <a className="button primary" href={signInHref}>
              Sign in
            </a>
          )}
          <a className="button" href={cursor ? resetPath : "/discover"}>
            {cursor
              ? collection
                ? "Reload collection"
                : "Reload collections"
              : "Discover collections"}
          </a>
        </div>
      ) : (
        <Retry seconds={error.retryAfter} />
      )}
    </section>
  );
}
