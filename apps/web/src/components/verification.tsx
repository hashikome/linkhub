import type { ReactNode } from "react";
import type { VerificationCopy, VerificationPurpose } from "../lib/verification";
import { FormNotice } from "./form-notice";
import { NativeForm } from "./native-form";
import { ResendCode } from "./resend-code";

// The two screens every email-code situation shares, written to scan at a
// glance: why we're asking, then where the code goes (the address in bold) and
// what happens next, then the actions.

// Step 1: send a code. A known address (signed in, invitation) is shown, never
// asked for; otherwise the person enters it.
export function VerifyStart({
  copy,
  purpose,
  email,
  sendAction,
  returnTo,
  notice,
  cancelAction,
  footer,
  alternatives,
  sendLabel = "Send code",
}: {
  alternatives?: ReactNode;
  sendLabel?: string;
  copy: VerificationCopy;
  purpose: VerificationPurpose;
  email?: string;
  sendAction: `/forms/${string}`;
  returnTo?: string;
  notice?: string;
  /** A form action that abandons the flow, shown as the secondary button. */
  cancelAction?: `/forms/${string}`;
  footer?: ReactNode;
}) {
  return (
    <section className="reader account-flow verify">
      <h1>{copy.title}</h1>
      <p className="verify-reason">{copy.reason}</p>
      <FormNotice code={notice} />
      {alternatives}
      <NativeForm action={sendAction}>
        <input type="hidden" name="purpose" value={purpose} />
        {returnTo && <input type="hidden" name="returnTo" value={returnTo} />}
        {email ? (
          <p className="verify-detail">
            We'll send a code to <strong>{email}</strong>. {copy.after}
          </p>
        ) : (
          <>
            <label htmlFor="email">Email address</label>
            <input
              id="email"
              name="email"
              type="email"
              autoComplete="email"
              required
              maxLength={254}
            />
          </>
        )}
        {!email && <p className="verify-detail">{copy.after}</p>}
        <div className="verify-actions">
          <button type="submit" className="button primary">
            {sendLabel}
          </button>
          {cancelAction && (
            <button type="submit" formAction={cancelAction} className="button" formNoValidate>
              Cancel
            </button>
          )}
        </div>
      </NativeForm>
      {footer && <div className="verify-footer">{footer}</div>}
    </section>
  );
}

// Step 2: enter the code. Choosing to send it was the decision, so the way on
// is the code, or a new one if it didn't arrive.
export function VerifyCode({
  copy,
  email,
  notice,
  wait,
  resendIn,
  footer,
}: {
  copy: VerificationCopy;
  email: string;
  notice?: string;
  wait?: string;
  resendIn: number;
  footer?: ReactNode;
}) {
  return (
    <section className="reader account-flow verify">
      <h1>{copy.codeTitle}</h1>
      <p className="verify-reason">
        We sent a code to <strong>{email}</strong>. It expires in five minutes.
      </p>
      {/* The page already says the code was sent; only problems need a notice. */}
      <FormNotice code={notice === "sent" ? undefined : notice} wait={wait} />
      <NativeForm action="/forms/code-verify">
        <label htmlFor="code">Eight-digit code</label>
        <input
          id="code"
          name="code"
          autoComplete="one-time-code"
          inputMode="numeric"
          pattern="[0-9\s\-]{8,16}"
          maxLength={16}
          required
        />
        <p className="verify-detail">{copy.after}</p>
        <div className="verify-actions">
          <button type="submit" className="button primary">
            {copy.codeButton}
          </button>
        </div>
      </NativeForm>
      <ResendCode remaining={resendIn} />
      {footer && <div className="verify-footer">{footer}</div>}
    </section>
  );
}
