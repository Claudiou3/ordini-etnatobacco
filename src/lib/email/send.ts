import nodemailer from "nodemailer";
import { getSetting } from "@/lib/settings/runtime";
import { getEmailConfig } from "@/lib/email/config";
import { readStoredSetting } from "@/lib/settings/store";

/**
 * Invio email transazionali.
 *
 * Canali disponibili, in ordine di priorita':
 *  1. SMTP dell'account aziendale (configurazione in Impostazioni ->
 *     "Configurazione server email", default Aruba smtps.aruba.it:465). E'
 *     il canale "naturale" dopo il cambio gestore hosting: il mittente e'
 *     l'account stesso, quindi non servono domini verificati.
 *  2. Resend (API REST) come fallback, se e' configurata una RESEND_API_KEY.
 *
 * Il destinatario degli ordini e' configurabile dall'amministratore
 * (Impostazioni -> "Email destinataria ordini", chiave ORDER_EMAIL_TO);
 * il mittente da EMAIL_FROM, con fallback sull'account aziendale.
 */

export const DEFAULT_ORDER_EMAIL = "ordinidetomaso@etnatobacco.com";

export type SendEmailResult = {
  ok: boolean;
  sent: boolean;
  error?: string;
  recipient?: string;
};

type EmailOpts = {
  to?: string;
  subject: string;
  text: string;
  attachment?: { filename: string; content: Uint8Array };
};

const EMAIL_ACCOUNT_PASSWORD = "EMAIL_ACCOUNT_PASSWORD";

/** Invia via SMTP (nodemailer) usando la configurazione dell'account aziendale. */
async function sendViaSmtp(
  opts: EmailOpts & { recipient: string }
): Promise<SendEmailResult | null> {
  const config = await getEmailConfig();
  const password = await readStoredSetting(EMAIL_ACCOUNT_PASSWORD);
  if (!config.account || !config.smtpServer || !password) return null;

  const secure = /ssl|tls|465/i.test(config.smtpSecure);
  const port = Number(config.smtpPort) || (secure ? 465 : 587);

  const transporter = nodemailer.createTransport({
    host: config.smtpServer,
    port,
    secure,
    auth: {
      user: config.username || config.account,
      pass: password,
    },
    // Aruba usa una catena di certificati che Node non riconosce
    // ("self-signed certificate in certificate chain"): la connessione resta
    // TLS, ma senza validazione del certificato (workaround standard).
    tls: { rejectUnauthorized: false },
    // Timeout contenuti: non bloccare mai la trasmissione dell'ordine.
    connectionTimeout: 15_000,
    socketTimeout: 20_000,
  });

  try {
    await transporter.sendMail({
      from: `"${config.displayName || "Ordini De Tomaso"}" <${config.account}>`,
      to: opts.recipient,
      subject: opts.subject,
      text: opts.text,
      attachments: opts.attachment
        ? [
            {
              filename: opts.attachment.filename,
              content: Buffer.from(opts.attachment.content),
            },
          ]
        : undefined,
    });
    return { ok: true, sent: true, recipient: opts.recipient };
  } catch (err) {
    return {
      ok: false,
      sent: false,
      error: "Invio SMTP fallito: " + (err as Error).message,
      recipient: opts.recipient,
    };
  }
}

/** Invia via Resend (API REST, senza dipendenze extra). */
async function sendViaResend(
  apiKey: string,
  from: string,
  opts: EmailOpts & { recipient: string }
): Promise<SendEmailResult> {
  const body: Record<string, unknown> = {
    from,
    to: [opts.recipient],
    subject: opts.subject,
    text: opts.text,
  };

  if (opts.attachment) {
    body.attachments = [
      {
        filename: opts.attachment.filename,
        content: Buffer.from(opts.attachment.content).toString("base64"),
        content_type:
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      },
    ];
  }

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      return {
        ok: false,
        sent: false,
        error: `Invio email fallito (${res.status}): ${detail.slice(0, 300)}`,
        recipient: opts.recipient,
      };
    }

    return { ok: true, sent: true, recipient: opts.recipient };
  } catch (err) {
    return {
      ok: false,
      sent: false,
      error: "Invio email fallito: " + (err as Error).message,
      recipient: opts.recipient,
    };
  }
}

export async function sendOrderEmail(opts: EmailOpts): Promise<SendEmailResult> {
  const recipient =
    (opts.to && opts.to.trim()) ||
    (await getSetting("ORDER_EMAIL_TO")) ||
    DEFAULT_ORDER_EMAIL;

  const fromSetting = await getSetting("EMAIL_FROM");
  const emailConfig = await getEmailConfig();
  const from =
    (fromSetting && fromSetting.trim()) ||
    (emailConfig.account
      ? `${emailConfig.displayName || "Ordini De Tomaso"} <${emailConfig.account}>`
      : `Ordini De Tomaso <${DEFAULT_ORDER_EMAIL}>`);

  const withRecipient = { ...opts, recipient };

  // 1) SMTP dell'account aziendale (canale preferito dopo il cambio hosting).
  const smtp = await sendViaSmtp(withRecipient);
  if (smtp?.sent) return smtp;

  // 2) Fallback Resend.
  const apiKey = await getSetting("RESEND_API_KEY");
  if (apiKey && apiKey.trim() !== "") {
    const resend = await sendViaResend(apiKey.trim(), from, withRecipient);
    if (resend.sent) return resend;
    const errors = [smtp?.error, resend.error].filter(Boolean);
    return {
      ok: false,
      sent: false,
      error: errors.length > 0 ? errors.join(" | ") : undefined,
      recipient,
    };
  }

  return {
    ok: false,
    sent: false,
    error:
      smtp?.error ??
      "Nessun canale email configurato: imposta la password dell'account in Impostazioni (SMTP) o la RESEND_API_KEY.",
    recipient,
  };
}
