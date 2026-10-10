import type { Failure } from "../lib/http";
export function OperatorFailure({
  error,
  returnTo = "/manage",
}: {
  error: Failure;
  returnTo?: string;
}) {
  const denied = [403, 404].includes(error.status);
  return (
    <section className="reader feedback">
      <h1>{denied ? "Manage unavailable" : "We couldn't load management"}</h1>
      <p>
        {denied
          ? "This account or target isn't available for management."
          : error.status === 429
            ? `Too many requests. Wait${error.retryAfter ? ` at least ${error.retryAfter} seconds` : ""} before trying again.`
            : "Reload to check the current state. Your actions won't be submitted again."}
      </p>
      {denied ? (
        <a className="button" href="/discover">
          Discover collections
        </a>
      ) : (
        <a className="button" href={returnTo}>
          Reload management
        </a>
      )}
    </section>
  );
}
