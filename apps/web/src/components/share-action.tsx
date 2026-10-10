import { type ShareTarget, sharePath } from "../lib/sharing";

export function ShareAction({
  target,
  returnTo,
  label = "Share",
  className = "button",
}: {
  target: ShareTarget;
  returnTo: string;
  label?: string;
  className?: string;
}) {
  return (
    <a className={className} href={sharePath(target, returnTo)}>
      {label}
    </a>
  );
}
