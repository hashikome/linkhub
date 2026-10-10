/** Presentation context only; never grants access or changes code verification rules. */
export const signInCodePurposes = [
  "sign-in",
  "first-link",
  "continue",
  "resume",
  "confirm",
] as const;
export type SignInCodePurpose = (typeof signInCodePurposes)[number];
export const accountActions = ["deactivate", "delete", "reactivate", "cancel_deletion"] as const;
export type AccountAction = (typeof accountActions)[number];
export const verificationPurposes = [
  ...signInCodePurposes,
  "invitation",
  ...accountActions,
] as const;
export type VerificationPurpose = (typeof verificationPurposes)[number];

/** App-owned codes-only HTTP inputs; auth-library internals stay API-private. */
export interface SendSignInCodeRequest {
  email: string;
  /** Defaults to sign-in. Invitation copy is selected by the invitation workflow. */
  purpose?: SignInCodePurpose;
}
export interface VerifySignInCodeRequest {
  email: string;
  code: string;
  /** Optional display name, used only when the verified address creates an account. */
  name?: string;
}
export interface StartEmailChangeRequest {
  newEmail: string;
}
export interface ConfirmEmailChangeRequest {
  code: string;
}
export interface AuthActionSuccess {
  success: true;
}
