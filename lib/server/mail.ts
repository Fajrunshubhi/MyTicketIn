import { sendSmtpMail } from "@/lib/server/smtp";

const RESET_TTL_MINUTES = 30;

export function publicAppOrigin(): string {
  const raw = String(process.env.WEB_ORIGIN || process.env.NEXTAUTH_URL || "").trim().replace(/\/+$/, "");
  if (/^https?:\/\/localhost(?::\d+)?$/i.test(raw) || /^https:\/\/[a-z0-9.-]+$/i.test(raw) || /^http:\/\/127\.0\.0\.1(?::\d+)?$/i.test(raw)) {
    return raw;
  }
  return "http://localhost:3000";
}

export function passwordResetUrl(rawToken: string): string {
  const token = encodeURIComponent(rawToken.trim());
  return `${publicAppOrigin()}/reset-password?token=${token}`;
}

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function passwordResetEmail(input: { name: string; resetUrl: string }) {
  const name = input.name.trim() || "Pengguna";
  const safeName = escapeHtml(name);
  const safeUrl = escapeHtml(input.resetUrl);
  const subject = "Atur ulang kata sandi MyTicketIn";
  const text = [
    `Halo ${name},`,
    "",
    "Kami menerima permintaan untuk mengatur ulang kata sandi akun MyTicketIn Anda.",
    `Tautan ini hanya dapat dipakai sekali dan kedaluwarsa dalam ${RESET_TTL_MINUTES} menit.`,
    "",
    input.resetUrl,
    "",
    "Jika Anda tidak meminta tautan ini, abaikan email ini. Kata sandi tidak berubah.",
    "",
    "MyTicketIn",
  ].join("\n");
  const html = `<!DOCTYPE html>
<html lang="id">
<body style="margin:0;padding:0;background:#f4f1fb;font-family:Arial,Helvetica,sans-serif;color:#1c1636;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f4f1fb;padding:32px 16px;">
    <tr>
      <td align="center">
        <table role="presentation" width="560" cellspacing="0" cellpadding="0" style="max-width:560px;width:100%;background:#ffffff;border-radius:24px;overflow:hidden;border:1px solid #ece8f5;">
          <tr>
            <td style="background:#6d4aff;padding:20px 28px;color:#ffffff;font-size:18px;font-weight:700;letter-spacing:.04em;">MYTICKETIN</td>
          </tr>
          <tr>
            <td style="padding:28px;">
              <p style="margin:0 0 8px;font-size:13px;letter-spacing:.12em;text-transform:uppercase;color:#6d4aff;font-weight:700;">Pemulihan akun</p>
              <h1 style="margin:0 0 16px;font-size:24px;line-height:1.3;">Atur kata sandi baru</h1>
              <p style="margin:0 0 16px;font-size:15px;line-height:1.6;">Halo ${safeName}, kami menerima permintaan mengatur ulang kata sandi akun MyTicketIn.</p>
              <p style="margin:0 0 24px;font-size:15px;line-height:1.6;">Tautan ini <strong>sekali pakai</strong> dan berlaku ${RESET_TTL_MINUTES} menit. Jangan teruskan email ini kepada siapa pun.</p>
              <p style="margin:0 0 28px;">
                <a href="${safeUrl}" style="display:inline-block;background:#6d4aff;color:#ffffff;text-decoration:none;border-radius:999px;padding:14px 22px;font-size:15px;font-weight:700;">Atur kata sandi baru</a>
              </p>
              <p style="margin:0 0 8px;font-size:13px;color:#5c5674;line-height:1.5;">Jika tombol tidak berfungsi, salin tautan ini ke peramban:</p>
              <p style="margin:0;font-size:12px;line-height:1.5;word-break:break-all;color:#6d4aff;">${safeUrl}</p>
            </td>
          </tr>
          <tr>
            <td style="padding:0 28px 28px;font-size:12px;line-height:1.6;color:#7a748c;">
              Jika Anda tidak meminta tautan ini, abaikan email. Tidak ada perubahan pada akun.
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
  return { subject, text, html, ttlMinutes: RESET_TTL_MINUTES };
}

function fromHeader(): string {
  const from = String(process.env.EMAIL_FROM || "MyTicketIn <noreply@myticketin.local>").trim();
  return from;
}

export type MailAttachment = { filename: string; content: Buffer; contentType: string };
export type MailMessage = { to: string; subject: string; text: string; html: string; attachments?: MailAttachment[] };

/** Email for an in-app notification. Contains only title/body and an app link; never QR tokens or payment secrets. */
export function notificationEmail(input: { name: string; title: string; body: string; actionPath?: string | null }) {
  const name = input.name.trim() || "Pengguna";
  const path = input.actionPath && input.actionPath.startsWith("/") && !input.actionPath.startsWith("//") ? input.actionPath : "/dashboard/notifications";
  const url = `${publicAppOrigin()}${path}`;
  const subject = input.title.slice(0, 160);
  const text = [`Halo ${name},`, "", input.title, input.body, "", `Buka di MyTicketIn: ${url}`, "", "MyTicketIn (sandbox akademik)"].join("\n");
  const html = `<!DOCTYPE html>
<html lang="id"><body style="margin:0;padding:24px 12px;background:#f4f1fb;font-family:Arial,Helvetica,sans-serif;color:#1c1636;">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0"><tr><td align="center">
<table role="presentation" width="560" cellspacing="0" cellpadding="0" style="max-width:560px;width:100%;background:#fff;border-radius:24px;overflow:hidden;border:1px solid #ece8f5;">
<tr><td style="background:#6d4aff;padding:20px 28px;color:#fff;font-size:18px;font-weight:700;letter-spacing:.04em;">MYTICKETIN</td></tr>
<tr><td style="padding:28px;">
<p style="margin:0 0 8px;font-size:15px;">Halo ${escapeHtml(name)},</p>
<h1 style="margin:0 0 12px;font-size:22px;line-height:1.3;">${escapeHtml(input.title)}</h1>
<p style="margin:0 0 24px;font-size:15px;line-height:1.6;">${escapeHtml(input.body)}</p>
<p style="margin:0 0 20px;"><a href="${escapeHtml(url)}" style="display:inline-block;background:#6d4aff;color:#fff;text-decoration:none;border-radius:999px;padding:14px 22px;font-size:15px;font-weight:700;">Buka di MyTicketIn</a></p>
<p style="margin:0;font-size:12px;color:#7a748c;">Email ini dikirim dari lingkungan sandbox akademik. Tidak ada transaksi uang nyata.</p>
</td></tr></table></td></tr></table></body></html>`;
  return { subject, text, html };
}

/** Sends one email. Returns "skipped" when no provider is configured; throws on provider failure so callers can retry. */
export async function sendMail(message: MailMessage): Promise<"sent" | "skipped"> {
  const from = fromHeader();
  const resendKey = String(process.env.RESEND_API_KEY || "").trim();
  const smtpHost = String(process.env.EMAIL_SMTP_HOST || "").trim();
  const provider = String(process.env.EMAIL_PROVIDER || "sandbox").trim().toLowerCase();
  if (provider === "resend" || resendKey) {
    if (!resendKey) return "skipped";
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${resendKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from,
        to: [message.to],
        subject: message.subject,
        html: message.html,
        text: message.text,
        attachments: message.attachments?.map((a) => ({ filename: a.filename, content: a.content.toString("base64") })),
      }),
    });
    if (!res.ok) throw new Error("RESEND_FAILED");
    return "sent";
  }
  if (smtpHost) {
    await sendSmtpMail({
      from,
      to: message.to,
      subject: message.subject,
      html: message.html,
      text: message.text,
      attachments: message.attachments,
    });
    return "sent";
  }
  return "skipped";
}

export async function sendPasswordResetMail(input: { to: string; name: string; resetUrl: string }): Promise<"sent" | "skipped"> {
  const message = passwordResetEmail({ name: input.name, resetUrl: input.resetUrl });
  const from = fromHeader();
  const provider = String(process.env.EMAIL_PROVIDER || "sandbox").trim().toLowerCase();
  const resendKey = String(process.env.RESEND_API_KEY || "").trim();
  const smtpHost = String(process.env.EMAIL_SMTP_HOST || "").trim();
  try {
    if (provider === "resend" || resendKey) {
      if (!resendKey) return "skipped";
      const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${resendKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from,
          to: [input.to],
          subject: message.subject,
          html: message.html,
          text: message.text,
        }),
      });
      if (!res.ok) throw new Error("RESEND_FAILED");
      return "sent";
    }
    if (smtpHost) {
      await sendSmtpMail({
        from,
        to: input.to,
        subject: message.subject,
        html: message.html,
        text: message.text,
      });
      return "sent";
    }
    return "skipped";
  } catch (err) {
    const detail = err instanceof Error ? err.message : "email_failed";
    console.error("password_reset_email_failed", detail.slice(0, 80));
    return "skipped";
  }
}
