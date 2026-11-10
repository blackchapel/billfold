import nodemailer from "nodemailer";
import type { GoogleOAuthClient, MailSender, OutgoingEmail } from "@/domain/ports/services";

const TIMEOUT_MS = 30_000;
const GMAIL_SEND = "https://gmail.googleapis.com/gmail/v1/users/me/messages/send";

/** Fields every transport shares: sender, recipient, subject, both bodies and the PDFs. */
function message(email: OutgoingEmail) {
  return {
    from: { name: email.fromName, address: email.from },
    to: { name: email.to.name, address: email.to.email },
    subject: email.subject, text: email.text, html: email.html,
    attachments: email.attachments.map((a) => ({ filename: a.filename, content: Buffer.from(a.bytes), contentType: a.contentType })),
  };
}

/** Sends through a mailbox's SMTP server with its app password. */
export class SmtpSender {
  async send(email: OutgoingEmail): Promise<void> {
    const { password } = JSON.parse(email.secretJson) as { password?: string };
    const c = email.config;
    const transport = nodemailer.createTransport({
      host: String(c.host), port: Number(c.port), secure: c.secure === true, auth: { user: String(c.username), pass: password ?? "" },
      connectionTimeout: TIMEOUT_MS, greetingTimeout: TIMEOUT_MS, socketTimeout: TIMEOUT_MS,
    });
    try {
      const info = await transport.sendMail(message(email));
      if (info.rejected.length > 0) throw new Error("The server rejected the recipient");
    } finally {
      transport.close();
    }
  }
}

/** Sends through the Gmail API as the connected account. The message is built as ordinary mail text first. */
export class GmailSender {
  constructor(private readonly google: GoogleOAuthClient, private readonly http: typeof fetch = fetch) {}

  async send(email: OutgoingEmail): Promise<void> {
    const { refreshToken } = JSON.parse(email.secretJson) as { refreshToken?: string };
    if (!refreshToken) throw new Error("No refresh token");
    const token = await this.google.accessToken("gmail", refreshToken);
    // streamTransport does not send anything: it only turns the message into its raw form.
    const built = await nodemailer.createTransport({ streamTransport: true, buffer: true, newline: "unix" }).sendMail(message(email));
    const res = await this.http(GMAIL_SEND, {
      method: "POST", headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
      body: JSON.stringify({ raw: (built.message as Buffer).toString("base64url") }), signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!res.ok) throw new Error(`Gmail send failed: ${res.status}`);
  }
}

export class LiveMailSender implements MailSender {
  private readonly gmail: GmailSender;
  private readonly smtp = new SmtpSender();

  constructor(google: GoogleOAuthClient, http: typeof fetch = fetch) {
    this.gmail = new GmailSender(google, http);
  }

  send(email: OutgoingEmail): Promise<void> {
    return email.kind === "gmail" ? this.gmail.send(email) : this.smtp.send(email);
  }
}
