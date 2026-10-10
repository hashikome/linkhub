import { describe, expect, it } from "bun:test";
import { verificationPurposes } from "@nslinkhub/types";
import type { CodeEmailBaseInput } from "./code-email.js";
import { renderEmailChangeConfirmation } from "./email-change-confirm.js";
import { renderVerificationCode } from "./verification-code.js";
import { renderNewEmailVerification } from "./verify-new-email.js";

const valid: CodeEmailBaseInput & { purpose: "sign-in" } = {
  purpose: "sign-in",
  locale: "en",
  code: "729337",
  supportUrl: "https://example.com/support",
  expiresInMinutes: 10,
};

describe("code emails", () => {
  it("every template renders both formats with the code and warning without authentication links", async () => {
    const emails = [
      ...(await Promise.all(
        verificationPurposes.map((purpose) => renderVerificationCode({ ...valid, purpose })),
      )),
      await renderEmailChangeConfirmation({ ...valid, newEmail: "new@example.com" }),
      await renderNewEmailVerification(valid),
    ];
    for (const email of emails) {
      for (const body of [email.html, email.text]) {
        expect(body).toContain("729337");
        expect(body).not.toContain("token=");
        expect(body).not.toContain("use this link");
        expect(body).toContain(valid.supportUrl);
        expect(body).toContain("Do not share this code with anyone.");
        expect(body).not.toContain("Do not forward this email");
        expect(body).toContain("an ns series product");
        expect(body).not.toContain("mailto:");
      }
      // Subjects never carry the code.
      expect(email.subject).not.toContain(valid.code);
      expect(email.subject.toLowerCase()).toContain("nslinkhub");
    }
  });

  it("matches subject, preview and body to each purpose", async () => {
    const terms = {
      "sign-in": ["sign-in", "sign in"],
      "first-link": ["first link", "first link"],
      continue: ["continue", "continue"],
      resume: ["Sign back in", "session ended"],
      confirm: ["Confirm it's you", "confirm it's you"],
      deactivate: ["deactivation", "deactivate"],
      delete: ["deletion", "permanent deletion"],
      reactivate: ["Reactivate", "reactivate"],
      cancel_deletion: ["Cancel", "cancel"],
      invitation: ["invitation", "invited role"],
    } as const;
    for (const purpose of verificationPurposes) {
      const rendered = await renderVerificationCode({ ...valid, purpose });
      expect(rendered.subject).toContain(terms[purpose][0]);
      expect(rendered.text).toContain(terms[purpose][1]);
      expect(rendered.html).toContain(terms[purpose][1].replaceAll("'", "&#x27;"));
    }
    await expect(
      renderVerificationCode({ ...valid, purpose: "unknown" as "sign-in" }),
    ).rejects.toThrow(/purpose/);
  });

  it("the change confirmation names the target address; ignoring changes nothing", async () => {
    const email = await renderEmailChangeConfirmation({ ...valid, newEmail: "new@example.com" });
    expect(email.text).toContain("new@example.com");
    expect(email.text).toContain("nothing changes without this confirmation");
    await expect(
      renderEmailChangeConfirmation({ ...valid, newEmail: "not-an-email" }),
    ).rejects.toThrow(/newEmail/);
  });

  it("handles the singular expiry unit", async () => {
    const email = await renderVerificationCode({ ...valid, expiresInMinutes: 1 });
    expect(email.text).toContain("next 1 minute.");
    expect(email.text).not.toContain("1 minutes");
  });

  it("rejects non-https URLs, malformed codes, and out-of-bounds expiry", async () => {
    await expect(
      renderVerificationCode({ ...valid, supportUrl: "http://example.com/x" }),
    ).rejects.toThrow(/supportUrl/);
    await expect(renderVerificationCode({ ...valid, code: "12ab56" })).rejects.toThrow(/code/);
    await expect(renderVerificationCode({ ...valid, expiresInMinutes: 0 })).rejects.toThrow(
      /expiresInMinutes/,
    );
    await expect(renderVerificationCode({ ...valid, expiresInMinutes: 61 })).rejects.toThrow(
      /expiresInMinutes/,
    );
  });
});
