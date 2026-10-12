import { expect, test } from "bun:test";
import { googleCredentials } from "./security-config";

test("Google opt-out skips stale secret files and rejects ambiguous enablement", () => {
  expect(
    googleCredentials({ GOOGLE_AUTH_ENABLED: "false", GOOGLE_CLIENT_ID_FILE: "/missing/client" }),
  ).toBeUndefined();
  expect(() => googleCredentials({ GOOGLE_AUTH_ENABLED: "yes" })).toThrow("true or false");
  expect(() => googleCredentials({ GOOGLE_AUTH_ENABLED: "true" })).toThrow("configured together");
  expect(googleCredentials({})).toBeUndefined();
  expect(
    googleCredentials({
      GOOGLE_AUTH_ENABLED: "true",
      GOOGLE_CLIENT_ID: "id",
      GOOGLE_CLIENT_SECRET: "secret",
    }),
  ).toEqual({ clientId: "id", clientSecret: "secret" });
  expect(
    googleCredentials({
      GOOGLE_AUTH_ENABLED: "",
      GOOGLE_CLIENT_ID: "id",
      GOOGLE_CLIENT_SECRET: "secret",
    }),
  ).toEqual({ clientId: "id", clientSecret: "secret" });
});
