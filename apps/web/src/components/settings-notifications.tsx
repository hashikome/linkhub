"use client";
export default function SettingsNotifications() {
  return (
    <section className="notification-settings" aria-labelledby="notification-settings-heading">
      <h2 id="notification-settings-heading">Notifications</h2>
      <dl className="account-facts">
        <div>
          <dt>Invitations</dt>
          <dd>Always on</dd>
        </div>
      </dl>
      <p className="field-help">
        Invitations appear in your inbox. Invitation links and sign-in codes are sent by email.
      </p>
    </section>
  );
}
