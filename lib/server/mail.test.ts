import { describe, expect, it } from "vitest";
import { escapeHtml, passwordResetEmail, passwordResetUrl, publicAppOrigin } from "@/lib/server/mail";

describe("password reset mail", () => {
  it("escapes names in HTML", () => {
    expect(escapeHtml(`A <script> "x"`)).toBe("A &lt;script&gt; &quot;x&quot;");
  });

  it("builds a one-time link from the trusted origin, not the Host header", () => {
    const url = passwordResetUrl("abc123");
    expect(url).toContain("/reset-password?token=abc123");
    expect(url.startsWith(publicAppOrigin())).toBe(true);
    expect(url).not.toContain("evil.example");
  });

  it("keeps the token out of the subject and states single-use expiry", () => {
    const mail = passwordResetEmail({
      name: "Budi",
      resetUrl: "http://localhost:3000/reset-password?token=secret-token",
    });
    expect(mail.subject.toLowerCase()).not.toContain("secret-token");
    expect(mail.ttlMinutes).toBe(30);
    expect(mail.text).toContain("sekali");
    expect(mail.html).toContain("Atur kata sandi baru");
    expect(mail.html).toContain("secret-token");
  });
});
