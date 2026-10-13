"use client";
import { useEffect } from "react";

// Opening Reply or Edit puts the cursor in its text box (caret at the end), so
// people can type straight away. Add a comment uses the same native disclosure.
// Closing it preserves the draft. A sign-in return opens and focuses it.
// Delete is left alone so Enter never confirms a deletion by accident.
export function CommentFocus() {
  useEffect(() => {
    const opened = (event: Event) => {
      const details = event.target;
      if (!(details instanceof HTMLDetailsElement) || !details.open) return;
      if (!details.matches(".comment-more, .comment-compose")) return;
      const field = details.querySelector("textarea");
      if (!field) return;
      field.focus({ preventScroll: true });
      field.setSelectionRange(field.value.length, field.value.length);
      field.scrollIntoView({ block: "nearest" });
    };
    const composer = document.querySelector<HTMLDetailsElement>(".comment-compose[open]");
    composer?.querySelector("textarea")?.focus();
    // A streamed discussion can arrive after the router attempted its fragment
    // scroll. Resolve discussion anchors when their actual content is mounted.
    const fragment = window.location.hash.slice(1);
    if (fragment === "comments" || fragment.startsWith("comment-"))
      document.getElementById(fragment)?.scrollIntoView({ block: "nearest" });
    // "toggle" does not bubble; listen in the capture phase.
    document.addEventListener("toggle", opened, true);
    return () => {
      document.removeEventListener("toggle", opened, true);
    };
  }, []);
  return null;
}
