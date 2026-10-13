import type { SessionView } from "@ntumie/types";
import { AccountMenu } from "./account-menu";
export function SessionNav({ session }: { session: SessionView | null }) {
  if (!session)
    return (
      <div className="session-nav">
        <a className="button nav-button" href="/sign-in">
          Sign in
        </a>
      </div>
    );
  return (
    <div className="session-nav">
      <a className="button primary nav-button nav-save" href="/capture">
        <svg
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          aria-hidden="true"
        >
          <path d="M12 5v14M5 12h14" />
        </svg>
        <span className="nav-save-label">Save a link</span>
      </a>
      <AccountMenu
        userId={session.userId}
        hubId={session.hubId}
        username={session.username}
        name={session.name}
        email={session.email}
        canManage={session.operator || !!session.hubId}
        unreadNotifications={session.unreadNotifications}
      />
    </div>
  );
}
