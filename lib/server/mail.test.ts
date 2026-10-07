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

import { afterEach, vi } from "vitest";
import { notificationEmail, sendMail } from "@/lib/server/mail";

describe("F50 notification email", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("escapes content and rejects unsafe action links", () => {
    const m = notificationEmail({ name: "<b>Budi</b>", title: "Tiket <terbit>", body: "ok", actionPath: "//evil.example/x" });
    expect(m.html).not.toContain("<b>Budi</b>");
    expect(m.html).toContain("&lt;terbit&gt;");
    expect(m.text).not.toContain("evil.example");
    expect(m.text).toContain("/dashboard/notifications");
  });

  it("is skipped without a provider", async () => {
    vi.stubEnv("EMAIL_PROVIDER", "sandbox");
    vi.stubEnv("RESEND_API_KEY", "");
    vi.stubEnv("EMAIL_SMTP_HOST", "");
    expect(await sendMail({ to: "a@b.c", subject: "s", text: "t", html: "<p>t</p>" })).toBe("skipped");
  });

  it("sends through the provider and throws on failure so callers can retry", async () => {
    vi.stubEnv("EMAIL_PROVIDER", "resend");
    vi.stubEnv("RESEND_API_KEY", "test-key");
    const fetchFake = vi.fn().mockResolvedValueOnce({ ok: true }).mockResolvedValueOnce({ ok: false });
    vi.stubGlobal("fetch", fetchFake);
    const msg = { to: "a@b.c", subject: "s", text: "t", html: "<p>t</p>" };
    expect(await sendMail(msg)).toBe("sent");
    await expect(sendMail(msg)).rejects.toThrow("RESEND_FAILED");
    expect(fetchFake).toHaveBeenCalledTimes(2);
  });
});

describe("F50 attachments", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });
  it("sends attachments to the provider as base64", async () => {
    vi.stubEnv("EMAIL_PROVIDER", "resend");
    vi.stubEnv("RESEND_API_KEY", "test-key");
    const fetchFake = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal("fetch", fetchFake);
    await sendMail({
      to: "a@b.c",
      subject: "s",
      text: "t",
      html: "<p>t</p>",
      attachments: [{ filename: "tiket.pdf", content: Buffer.from("%PDF-1.4"), contentType: "application/pdf" }],
    });
    const sent = JSON.parse(String(fetchFake.mock.calls[0][1].body));
    expect(sent.attachments).toEqual([{ filename: "tiket.pdf", content: Buffer.from("%PDF-1.4").toString("base64") }]);
  });
});
