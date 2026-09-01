import { NextResponse } from "next/server";
import { getCurrentAdmin } from "@/lib/supabase/session";
import { sendOrderEmail } from "@/lib/email/send";
import { getSetting } from "@/lib/settings/runtime";
import { DEFAULT_ORDER_EMAIL } from "@/lib/email/send";
import { getEmailConfig } from "@/lib/email/config";

/**
 * Verifica rapida della configurazione email (solo amministratore principale).
 * Invia un'email di prova al destinatario configurato (ORDER_EMAIL_TO) oppure
 * all'indirizzo passato come parametro `?to=...`.
 *
 * Risposta JSON:
 *   { ok: true, sent: true, recipient, smtp: {...} }        -> inviata
 *   { ok: false, sent: false, error, details }              -> errore
 */
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const admin = await getCurrentAdmin();
  if (!admin || admin.subAdmin) {
    return NextResponse.json(
      { ok: false, error: "Operazione riservata all'amministratore." },
      { status: 403 }
    );
  }

  const to = new URL(request.url).searchParams.get("to")?.trim() || undefined;
  const recipient =
    to ||
    (await getSetting("ORDER_EMAIL_TO")) ||
    DEFAULT_ORDER_EMAIL;

  const emailConfig = await getEmailConfig();

  const result = await sendOrderEmail({
    subject: "Test invio email — Ordini De Tomaso",
    text:
      "Questa è un'email di prova generata dalla piattaforma ordini.\n" +
      "Se la ricevi, la trasmissione email degli ordini è configurata correttamente.",
    ...(to ? { to } : {}),
  });

  return NextResponse.json({
    ok: result.ok,
    sent: result.sent,
    recipient: result.recipient ?? recipient,
    error: result.error ?? null,
    smtp: {
      server: emailConfig.smtpServer,
      port: emailConfig.smtpPort,
      account: emailConfig.account,
      passwordSet: emailConfig.passwordSet,
    },
  });
}
