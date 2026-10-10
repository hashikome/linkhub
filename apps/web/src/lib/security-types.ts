export interface SecurityStatus {
  totp: boolean;
  fresh: boolean;
  verifiedAt: string | null;
  passkeys: { id: string; name: string | null; createdAt: string }[];
  google: boolean;
  googleLinked: boolean;
}
