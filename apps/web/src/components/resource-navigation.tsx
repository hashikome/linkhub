"use client";
import { createContext, type ReactNode, useContext, useState } from "react";

const ResourceNavigation = createContext({
  newTab: true,
  publicOrigin: "",
  setNewTab: (_enabled: boolean) => {},
});

export function ResourceNavigationProvider({
  initialNewTab,
  publicOrigin,
  children,
}: {
  initialNewTab: boolean;
  publicOrigin: string;
  children: ReactNode;
}) {
  const [newTab, setNewTab] = useState(initialNewTab);
  return (
    <ResourceNavigation.Provider value={{ newTab, publicOrigin, setNewTab }}>
      {children}
    </ResourceNavigation.Provider>
  );
}

export function useResourceNavigation() {
  return useContext(ResourceNavigation);
}

export function ResourceLink({ href, children }: { href: string; children: string }) {
  const { newTab, publicOrigin } = useResourceNavigation();
  const opensNewTab =
    newTab && !!publicOrigin && new URL(href, publicOrigin).origin !== new URL(publicOrigin).origin;
  return (
    <a
      href={href}
      target={opensNewTab ? "_blank" : undefined}
      rel="noopener noreferrer"
      referrerPolicy="no-referrer"
      title={opensNewTab ? "Opens in a new tab" : undefined}
      aria-label={opensNewTab ? `${children} (opens in a new tab)` : undefined}
    >
      {children}
    </a>
  );
}
