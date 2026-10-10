"use client";
import { useApiOrigin } from "./api-origin";
export function Avatar({ userId, large = false }: { userId: string; large?: boolean }) {
  const origin = useApiOrigin();
  return (
    // biome-ignore lint/performance/noImgElement: Backend avatar resolver owns image selection and fallback.
    <img
      className={`avatar${large ? " avatar-large" : ""}`}
      src={`${origin}/api/v1/users/${encodeURIComponent(userId)}/avatar`}
      width={large ? 64 : 36}
      height={large ? 64 : 36}
      alt=""
      aria-hidden="true"
    />
  );
}
