/* Verifica finale: invio via SMTP usando EMAIL_ACCOUNT_PASSWORD da env (come il nuovo send.ts). */
import nodemailer from "nodemailer";

const account = process.env.EMAIL_ACCOUNT || "ordinidetomaso@etnatobacco.com";
const password = process.env.EMAIL_ACCOUNT_PASSWORD || "";
const server = process.env.EMAIL_SMTP_SERVER || "smtps.aruba.it";
const port = Number(process.env.EMAIL_SMTP_PORT || "465");
const secure = /ssl|tls|465/i.test(process.env.EMAIL_SMTP_SECURE || "SSL/TLS");

if (!password) {
  console.log("EMAIL_ACCOUNT_PASSWORD mancante.");
  process.exit(1);
}

const transporter = nodemailer.createTransport({
  host: server,
  port,
  secure,
  auth: { user: account, pass: password },
  tls: { rejectUnauthorized: false },
  connectionTimeout: 15000,
  socketTimeout: 20000,
});

try {
  const info = await transporter.sendMail({
    from: `"Ordini De Tomaso" <${account}>`,
    to: process.env.TEST_RECIPIENT || account,
    subject: "Verifica finale invio email ordini",
    text: "Configurazione email verificata. Gli ordini verranno inviati a questa casella.",
  });
  console.log("INVIO OK:", info.messageId, "->", process.env.TEST_RECIPIENT || account);
} catch (e) {
  console.log("INVIO FALLITO:", e.message);
  process.exit(1);
}
