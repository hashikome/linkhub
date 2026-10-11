import { describe, expect, it } from "bun:test";
import { renderServiceInvitation } from "./service-invitation.js";

describe("service invitations", () => {
  it("renders both roles with an explicit acceptance link and expiry in both formats", async () => {
    for (const role of ["admin", "operator"] as const) {
      const url = "https://links.example/invitations/01922f61-6023-711c-819e-ddfa33a3c624";
      const mail = await renderServiceInvitation({
        role,
        invitationUrl: url,
        expiresAt: new Date("2026-10-13T12:00:00Z"),
        supportUrl: "https://links.example/support",
      });
      expect(mail.subject).toContain(`linkhub service ${role}`);
      expect(mail.html).toContain(url);
      expect(mail.text).toContain(url);
      expect(mail.text).toContain("explicitly accept");
      expect(mail.text).toContain("2026-10-13");
      expect(mail.html).not.toContain("Pigfarm");
      for (const body of [mail.html, mail.text]) {
        expect(body).toContain("https://links.example/support");
        expect(body).toContain("Good links belong together.");
      }
    }
  });
  it("rejects credential-bearing and non-web links", async () => {
    for (const invitationUrl of [
      "javascript:alert(1)",
      "https://user:password@example.com/invitations/1",
    ])
      await expect(
        renderServiceInvitation({
          role: "admin",
          invitationUrl,
          expiresAt: new Date(),
          supportUrl: "https://links.example/support",
        }),
      ).rejects.toThrow();
  });
});
