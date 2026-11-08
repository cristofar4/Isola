import "server-only";

import nodemailer from "nodemailer";

/**
 * Outgoing email. One transport is chosen from the environment:
 *
 * - SMTP  — SMTP_URL (smtp[s]://user:pass@host:port) or SMTP_HOST, SMTP_PORT,
 *           SMTP_USER, SMTP_PASSWORD, SMTP_SECURE. Works with most providers.
 * - Resend — RESEND_API_KEY (HTTP API).
 * - Console — development only, when nothing above is set: the message is
 *           printed to the server terminal so the flow can be tested locally.
 *
 * EMAIL_FROM sets the sender, e.g. "ISOLA <no-reply@example.com>".
 * Without a transport in production, email features report themselves as
 * unavailable rather than pretending to send.
 */

export interface EmailMessage {
  to: string;
  subject: string;
  text: string;
  html: string;
}

export interface EmailTransport {
  id: "smtp" | "resend" | "console";
  send(message: EmailMessage): Promise<void>;
}

function from() {
  return process.env.EMAIL_FROM || "ISOLA <no-reply@localhost>";
}

function smtpTransport(): EmailTransport | null {
  const url = process.env.SMTP_URL;
  const host = process.env.SMTP_HOST;
  if (!url && !host) return null;
  const transporter = url
    ? nodemailer.createTransport(url)
    : nodemailer.createTransport({
        host,
        port: Number(process.env.SMTP_PORT || 587),
        secure: process.env.SMTP_SECURE === "true",
        auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASSWORD || "" } : undefined,
      });
  return {
    id: "smtp",
    async send(message) {
      await transporter.sendMail({ from: from(), ...message });
    },
  };
}

function resendTransport(): EmailTransport | null {
  const key = process.env.RESEND_API_KEY;
  if (!key) return null;
  return {
    id: "resend",
    async send(message) {
      const response = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
        body: JSON.stringify({ from: from(), to: [message.to], subject: message.subject, text: message.text, html: message.html }),
      });
      if (!response.ok) throw new Error(`Resend responded with HTTP ${response.status}`);
    },
  };
}

function consoleTransport(): EmailTransport | null {
  if (process.env.NODE_ENV === "production") return null;
  return {
    id: "console",
    async send(message) {
      console.info(`\n[email:dev] To: ${message.to}\n[email:dev] Subject: ${message.subject}\n${message.text}\n`);
    },
  };
}

export function getEmailTransport(): EmailTransport | null {
  return smtpTransport() ?? resendTransport() ?? consoleTransport();
}

export function emailMode(): EmailTransport["id"] | null {
  return getEmailTransport()?.id ?? null;
}

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

export function passwordResetEmail({ name, url, minutes }: { name: string; url: string; minutes: number }): Omit<EmailMessage, "to"> {
  const greeting = name ? `Hi ${name},` : "Hi,";
  const text = `${greeting}

Someone asked to reset the password for your ISOLA account. To choose a new password, open this link:

${url}

The link works once and expires in ${minutes} minutes. If you didn't ask for this, you can ignore this email; your password won't change.

— ISOLA`;
  const html = `<!doctype html>
<html><body style="margin:0;background:#F5F6F3;font-family:Inter,Segoe UI,Helvetica,Arial,sans-serif;color:#20292D">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="padding:32px 16px">
    <tr><td align="center">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:480px;background:#ffffff;border:1px solid #DFE2DC;border-radius:16px;padding:32px">
        <tr><td>
          <p style="margin:0 0 24px;font-size:18px;font-weight:800;letter-spacing:.06em">ISOLA</p>
          <h1 style="margin:0 0 12px;font-size:22px;line-height:1.25">Reset your password</h1>
          <p style="margin:0 0 16px;font-size:15px;line-height:1.6;color:#3A4549">${escapeHtml(greeting)}</p>
          <p style="margin:0 0 24px;font-size:15px;line-height:1.6;color:#3A4549">Someone asked to reset the password for your ISOLA account. Choose a new password with the button below.</p>
          <p style="margin:0 0 24px"><a href="${escapeHtml(url)}" style="display:inline-block;background:#4163F4;color:#ffffff;text-decoration:none;font-weight:600;font-size:15px;padding:12px 20px;border-radius:10px">Choose a new password</a></p>
          <p style="margin:0 0 8px;font-size:13px;line-height:1.6;color:#586266">The link works once and expires in ${minutes} minutes. If you didn't ask for this, ignore this email; your password won't change.</p>
          <p style="margin:16px 0 0;font-size:12px;line-height:1.6;color:#848D91;word-break:break-all">If the button doesn't work, paste this link into your browser:<br>${escapeHtml(url)}</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;
  return { subject: "Reset your ISOLA password", text, html };
}
