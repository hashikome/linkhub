import { Toast } from "./toast";

const messages: Record<string, string> = {
  "import-saved": "Ready links saved. Review any links still waiting below.",
  "import-queued": "Import queued. You can review another collection while it finishes.",
  "import-invalid":
    "Check the file format and limits. For CSV, use the template’s four columns and keep collections and sections together.",
  "import-large": "This file is too large. Use a file up to 10 MB.",
  "import-limited":
    "Finish one of your three open drafts, or wait for your daily lookup allowance to renew.",
  "registration-expired":
    "This account creation step expired. Start again to verify your identity.",
  "registration-invalid":
    "Enter a hub name of up to 255 characters, or leave Start with a hub unchecked.",
  "security-saved": "Your security settings have been updated.",
  "security-reconfirm": "Sign in again before changing your security settings.",
  "google-linked": "Google is connected to your account.",
  "google-email-mismatch":
    "Your Google email must match your account email. Continue with email to sign in.",
  "google-failed": "Google sign-in could not be completed. Try again or continue with email.",
  "order-saved": "Order saved.",
  "section-saved": "Section saved.",
  "link-saved": "Link saved.",
  "links-saved": "Links saved.",
  "link-not-public":
    "Use a public web address. Local, private and example addresses can't be opened by the people you share with.",
  "too-many-links": "Save up to 2 links at a time, or shorten very long addresses.",
  "link-invalid":
    "Check the links: each must be a full http:// or https:// address without a username or password.",
  "choose-destination": "Choose where to save your link, or create a collection.",
  "save-failed": "We couldn't confirm the save. Your link is still here. Try saving it again.",
  "impact-changed":
    "The collection or its references changed. Review the updated details before confirming again.",
  "collection-saved": "Collection saved.",
  "profile-saved": "Your profile has been saved.",
  "profile-invalid": "Check your profile fields, then try again.",
  "username-unavailable": "That username is already in use. Choose another.",
  "username-invalid": "Choose a different username using lowercase letters, numbers and hyphens.",
  "handle-cooldown":
    "You can change your hub handle once every 30 days. Reload Settings to see when.",
  "handle-unavailable": "That hub handle is already in use. Choose another.",
  "handle-invalid": "Choose a different hub handle using lowercase letters, numbers and hyphens.",
  "invitation-accepted":
    "Enter the emailed code to finish accepting the invitation and activate your role.",
  "wrong-account": "Sign out before accepting an invitation for another account.",
  declined: "You declined the invitation. No account or role was created.",
  sent: "We requested an email with your code. Check your inbox and spam folder.",
  resent: "We sent a new code. Check your inbox and spam folder.",
  invalid: "Check your details. The code may be incorrect or expired.",
  expired: "This email verification expired. Request a new code.",
  limited: "Too many attempts. Wait before trying again.",
  unavailable:
    "We couldn't confirm the result. Reload to check the current state before trying again.",
  "signout-failed": "We couldn't confirm sign-out. Try again.",
  "no-match": "No matching account was found.",
  done: "The action is complete.",
  conflict: "This changed since you opened it. Review the latest state before submitting again.",
  forbidden: "This action isn't available for this account or collection.",
  signin: "Your session ended. Continue with email to return.",
  "signed-out": "You're signed out.",
  cleared: "Notifications cleared.",
  "comment-posted": "Comment posted.",
  "comment-saved": "Comment updated.",
  "comment-deleted": "Comment deleted.",
  "comment-answer": "Marked as the answer.",
  "comment-empty": "Write something before posting (up to 2,000 characters).",
  "comment-unavailable": "We couldn't update that comment. Reload the page and try again.",
  "comments-off": "Comments are turned off for this collection.",
};
// Transient confirmations become a top toast; anything the reader must act on
// stays inline beside the form, in an info, warning or error tone.
const toasts = new Set([
  "link-saved",
  "links-saved",
  "collection-saved",
  "profile-saved",
  "done",
  "sent",
  "resent",
  "signed-out",
  "cleared",
  "comment-posted",
  "comment-saved",
  "comment-deleted",
  "comment-answer",
]);
const info = new Set(["invitation-accepted", "declined", "signin", "comments-off"]);
const errors = new Set([
  "link-invalid",
  "link-not-public",
  "too-many-links",
  "save-failed",
  "profile-invalid",
  "handle-unavailable",
  "handle-invalid",
  "invalid",
  "unavailable",
  "signout-failed",
  "forbidden",
  "comment-empty",
  "comment-unavailable",
]);
export function FormNotice({ code, wait }: { code?: string; wait?: string }) {
  const message = code ? messages[code] : undefined;
  if (!code || !message) return null;
  const seconds = Math.min(600, Math.max(0, Number(wait) || 0));
  const text = `${message}${seconds > 0 ? ` Wait at least ${seconds} seconds.` : ""}`;
  if (toasts.has(code))
    return (
      <Toast
        key={`${code}:${text}`}
        message={text}
        tone={code === "sent" || code === "resent" ? "info" : "success"}
      />
    );
  const tone = info.has(code) ? " info" : errors.has(code) ? " error" : "";
  return (
    <div className={`form-notice${tone}`} role="status">
      <p>{text}</p>
    </div>
  );
}
