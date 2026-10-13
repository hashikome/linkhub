import type { NotificationView } from "@ntumie/types";
import type { Metadata } from "next";
import { AppForm } from "../../components/app-form";
import { FormNotice } from "../../components/form-notice";
import { Updated } from "../../components/local-time";
import { MarkNotificationsSeen } from "../../components/mark-seen";
import { queryValue } from "../../lib/http";
import { serverRead } from "../../lib/server-api";
export const metadata: Metadata = { title: "Notifications" };
export const dynamic = "force-dynamic";

const roleName = (role: NotificationView["role"]) =>
  role === "admin" ? "service admin" : "service operator";
function detail(item: NotificationView) {
  switch (item.state) {
    case "pending":
      return "Check your inbox for the invitation email. Use its Review invitation button to accept or decline.";
    case "verifying":
      return "Check your inbox and open the invitation email to finish verifying your acceptance.";
    case "accepted":
      return `You accepted. Your ${roleName(item.role)} access is active.`;
    case "declined":
      return "You declined this invitation. No role was granted.";
    case "cancelled":
      return "This invitation was cancelled by an admin.";
    default:
      return "This invitation expired. Ask an admin to send a new one if you still need access.";
  }
}

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const query = await searchParams;
  const result = await serverRead<NotificationView[]>("/api/v1/notifications");
  const unread = result.ok ? result.data.filter((item) => item.unread).length : 0;
  return (
    <section className="reader notifications-page">
      <FormNotice code={queryValue(query.notice)} />
      <div className="page-heading notifications-heading">
        <div>
          <h1>Notifications</h1>
          <p>Invitations and updates for your account.</p>
        </div>
        {result.ok && result.data.length > 0 && (
          <AppForm action="/forms/notifications-clear" method="post">
            <button type="submit" className="button">
              Clear all
            </button>
          </AppForm>
        )}
      </div>
      {!result.ok ? (
        <div className="feedback">
          <p>We couldn't load your notifications.</p>
          <a className="button" href="/notifications">
            Try again
          </a>
        </div>
      ) : result.data.length ? (
        <>
          <MarkNotificationsSeen unread={unread} />
          <ul className="notification-list">
            {result.data.map((item) => (
              <li key={item.id}>
                <details className={`notification${item.unread ? " unread" : ""}`}>
                  <summary>
                    <span className="notification-title">
                      You're invited to be a {roleName(item.role)}
                    </span>
                    <span className="notification-meta">
                      {item.unread && <span className="notification-new">New</span>}
                      <Updated at={item.createdAt} />
                    </span>
                  </summary>
                  <p>{detail(item)}</p>
                </details>
              </li>
            ))}
          </ul>
        </>
      ) : (
        <div className="empty">
          <h2>You're all caught up</h2>
          <p>New invitations and updates will appear here.</p>
        </div>
      )}
    </section>
  );
}
