import type { Collection } from "@ntumie/types";
import { Avatar } from "./avatar";

export function CollectionContributors({
  contributors,
}: {
  contributors: Collection["contributors"];
}) {
  if (!contributors?.total || !contributors.people.length) return null;
  const remaining = contributors.total - contributors.people.length;
  const compact = contributors.total > 3;
  return (
    <section className="collection-contributors" aria-labelledby="contributors-heading">
      <h2 id="contributors-heading">
        Contributors <span className="contributors-count">{contributors.total}</span>
      </h2>
      <ul
        className={`contributor-list ${compact ? "contributor-avatars" : "contributor-names"}`}
        aria-label="Contributors"
      >
        {contributors.people.map((person) => (
          <li key={person.userId}>
            <a
              href={`/${encodeURIComponent(person.username)}`}
              aria-label={person.username}
              title={person.username}
            >
              <Avatar userId={person.userId} />
              {!compact && <span>{person.username}</span>}
            </a>
          </li>
        ))}
      </ul>
      {remaining > 0 && <p className="meta">+{remaining} more contributors</p>}
    </section>
  );
}
