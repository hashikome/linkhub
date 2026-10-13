"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { AppForm } from "./app-form";
import { Avatar } from "./avatar";
export function AccountMenu({
  userId,
  hubId,
  username,
  name,
  email,
  canManage,
  unreadNotifications,
}: {
  userId: string;
  hubId: string | null;
  username: string;
  name: string;
  email: string;
  canManage: boolean;
  unreadNotifications: number;
}) {
  const menu = useRef<HTMLDetailsElement>(null);
  const pathname = usePathname();
  const search = useSearchParams().toString();
  // biome-ignore lint/correctness/useExhaustiveDependencies: Close persistent shell UI after route changes.
  useEffect(() => {
    if (menu.current) menu.current.open = false;
  }, [pathname, search]);
  const [displayName, setDisplayName] = useState(name);
  const [profileUsername, setProfileUsername] = useState(username);
  const [unread, setUnread] = useState(unreadNotifications);
  useEffect(() => setDisplayName(name), [name]);
  useEffect(() => setProfileUsername(username), [username]);
  useEffect(() => setUnread(unreadNotifications), [unreadNotifications]);
  useEffect(() => {
    const updated = (event: Event) => {
      const { name, username } =
        (event as CustomEvent<{ name?: string; username?: string }>).detail ?? {};
      if (typeof username === "string") setProfileUsername(username);
      if (typeof name === "string") setDisplayName(name);
    };
    window.addEventListener("profile:updated", updated);
    const seen = () => setUnread(0);
    window.addEventListener("notifications:seen", seen);
    const outside = (event: PointerEvent) => {
      if (event.target instanceof Node && !menu.current?.contains(event.target) && menu.current)
        menu.current.open = false;
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape" && menu.current?.open) {
        menu.current.open = false;
        menu.current.querySelector("summary")?.focus();
      }
    };
    document.addEventListener("pointerdown", outside);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      window.removeEventListener("profile:updated", updated);
      window.removeEventListener("notifications:seen", seen);
      document.removeEventListener("pointerdown", outside);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, []);
  return (
    <details className="account-menu" ref={menu}>
      <summary aria-label="Account menu">
        <Avatar userId={userId} />
      </summary>
      <div className="account-menu-panel">
        <div className="account-menu-identity">
          {displayName && <strong>{displayName}</strong>}
          <span>{email}</span>
        </div>
        <nav aria-label="Account navigation">
          <a href={`/${encodeURIComponent(profileUsername)}`}>Profile</a>
          <a href={hubId ? `/h/${hubId}` : "/hub"}>Hub</a>
          <a
            href="/notifications"
            className="notifications-link"
            aria-label={unread ? `Notifications, ${unread} new` : "Notifications"}
          >
            Notifications
            {unread > 0 && <span className="notification-count">{unread}</span>}
          </a>
          <a href="/settings">Settings</a>
          {canManage && <a href="/manage">Manage</a>}
        </nav>
        <AppForm action="/forms/sign-out" method="post">
          <button type="submit">Sign out</button>
        </AppForm>
      </div>
    </details>
  );
}
