import type { ShareTarget } from "@nslinkhub/types";
import type { ReactNode } from "react";
import { ShareLink } from "./share-link";

export function ShareScreen({
  heading,
  name,
  resourcePath,
  url,
  linkLabel,
  back,
  restricted = false,
  children,
  target,
  token,
}: {
  heading: string;
  name: string;
  resourcePath: string;
  url: string;
  linkLabel: string;
  back: { href: string; label: string };
  restricted?: boolean;
  children?: ReactNode;
  target?: ShareTarget;
  token?: string;
}) {
  return (
    <section className="reader account-flow">
      <nav className="context">
        <a href={resourcePath}>{name}</a>
      </nav>
      <h1>{heading}</h1>
      <ShareLink
        url={url}
        label={linkLabel}
        restricted={restricted}
        target={target}
        token={token}
      />
      {children}
      <p>
        <a href={back.href}>{back.label}</a>
      </p>
    </section>
  );
}
