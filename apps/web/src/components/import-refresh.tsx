"use client";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
export function ImportRefresh({ pending }: { pending: boolean }) {
  const router = useRouter();
  useEffect(() => {
    if (!pending) return;
    const timer = setInterval(() => {
      if (
        document.visibilityState !== "visible" ||
        document.querySelector(
          ".import-page details[open], .import-page form[aria-busy=true], .import-page [data-import-expanded=true]",
        ) ||
        document.activeElement?.matches("input,textarea,select")
      )
        return;
      router.refresh();
    }, 5000);
    return () => clearInterval(timer);
  }, [pending, router]);
  return null;
}
