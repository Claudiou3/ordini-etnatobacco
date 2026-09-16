import { promises as fs } from "node:fs";
import path from "node:path";
import { appDataPath } from "@/lib/data-dir";
import { getAppSetting, setAppSetting } from "@/lib/supabase/app-settings";
import { formatDate, formatEur } from "@/lib/format";
import type { OrderItem } from "@/lib/types";

/**
 * COPIA DELL'ORDINE AL CLIENTE.
 *
 * L'amministratore decide (Impostazioni) se la funzione e' attiva per tutti:
 *  - funzione NON attiva -> il modulo "Nuovo ordine" non mostra nulla di nuovo;
 *  - funzione attiva    -> l'agente, nel modulo, puo' decidere ordine per ordine
 *    se inviare al cliente la copia (solo la stampa, nessun file Excel).
 *
 * L'email del cliente e' quella del Passo 2 del modulo: arriva dall'anagrafica
 * quando e' presente, altrimenti la scrive l'agente (campo obbligatorio).
 * L'ordine ufficiale (con il modulo Excel allegato) continua a partire verso
 * l'ufficio come prima: questa copia e' un invio SEPARATO e non bloccante.
 *
 * Dove si salva l'impostazione: chiave `customer_copy_settings` nella tabella
 * chiave-valore Supabase `app_settings` (gia' esistente: NESSUNA migrazione),
 * con fallback sul file locale data/customer-copy.json.
 */

const FILE = appDataPath("customer-copy.json");
const KEY = "customer_copy_settings";

export type CustomerCopySettings = {
  /** Interruttore dell'amministratore: abilita l'invio copia al cliente. */
  enabled: boolean;
  /** Messaggio facoltativo aggiunto in coda all'email al cliente. */
  message: string;
  updatedAt: string | null;
};

export const DEFAULT_CUSTOMER_COPY_SETTINGS: CustomerCopySettings = {
  enabled: false,
  message: "",
  updatedAt: null,
};

function normalize(
  raw: Partial<CustomerCopySettings> | null | undefined
): CustomerCopySettings {
  return {
    enabled: raw?.enabled === true,
    message: typeof raw?.message === "string" ? raw.message.slice(0, 800) : "",
    updatedAt: typeof raw?.updatedAt === "string" ? raw.updatedAt : null,
  };
}

/** Impostazioni correnti: Supabase (online), poi file locale, poi default OFF. */
export async function getCustomerCopySettings(): Promise<CustomerCopySettings> {
  const remote = await getAppSetting<Partial<CustomerCopySettings>>(KEY);
  if (remote && typeof remote === "object") return normalize(remote);

  try {
    const raw = JSON.parse(
      await fs.readFile(FILE, "utf8")
    ) as Partial<CustomerCopySettings>;
    if (raw && typeof raw === "object") return normalize(raw);
  } catch {
    // file assente o non valido: si usa il default (funzione disattivata)
  }
  return { ...DEFAULT_CUSTOMER_COPY_SETTINGS };
}

export type SaveCustomerCopyResult = { ok: true } | { ok: false; error: string };

/** Salva l'interruttore (e il messaggio) senza rimuovere nulla di esistente. */
export async function saveCustomerCopySettings(input: {
  enabled: boolean;
  message: string;
}): Promise<SaveCustomerCopyResult> {
  const value: CustomerCopySettings = {
    enabled: input.enabled === true,
    message: (input.message ?? "").slice(0, 800),
    updatedAt: new Date().toISOString(),
  };

  if (await setAppSetting(KEY, value)) return { ok: true };

  try {
    await fs.mkdir(path.dirname(FILE), { recursive: true });
    await fs.writeFile(FILE, JSON.stringify(value, null, 2), "utf8");
    return { ok: true };
  } catch {
    return {
      ok: false,
      error:
        "Impossibile salvare l'impostazione (file system in sola lettura e Supabase non configurato).",
    };
  }
}

/** Controllo di sintassi dell'indirizzo email (difesa anche lato server). */
export function isValidEmailAddress(value: string | null | undefined): boolean {
  const v = (value ?? "").trim();
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v);
}

/** Dati necessari per comporre la copia (tutti gia' disponibili all'invio). */
export type CustomerCopyData = {
  numeroOrdine: string;
  dataOrdine: string;
  pagamento: string;
  cliente: {
    ragione_sociale: string;
    indirizzo: string;
    cap: string;
    citta: string;
    provincia: string;
    partita_iva: string;
    codice_fiscale: string;
    sdi: string;
    cellulare: string;
    email: string;
  };
  items: OrderItem[];
  totali: {
    imponibile: number;
    trasporto: number;
    iva: number;
    totale: number;
  };
  /** Paia di occhiali in omaggio (numeri salvati con lib/orders/omaggio.ts). */
  omaggioPaia?: number | null;
  /** Messaggio facoltativo configurato dall'amministratore. */
  message?: string;
  /** Nome mittente mostrato nell'email (es. "Ordini De Tomaso"). */
  displayName?: string;
};

function esc(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** "1 paio di occhiali omaggio" / "4 paia di occhiali omaggio". */
function giftLabel(paia: number): string {
  return paia === 1 ? "1 paio di occhiali" : `${paia} paia di occhiali`;
}

/**
 * Compone oggetto, versione testo e versione HTML della copia dell'ordine.
 * Contenuto = la stampa dell'ordine (dati cliente, articoli, totali) + la riga
 * dell'omaggio. NON contiene le note interne dell'agente e non ha allegati:
 * al cliente non viene mai inviato il file Excel.
 */
export function buildCustomerCopyEmail(data: CustomerCopyData): {
  subject: string;
  text: string;
  html: string;
} {
  const c = data.cliente;
  const mittente = (data.displayName || "Ordini De Tomaso").trim();
  const omaggio =
    data.omaggioPaia && data.omaggioPaia > 0 ? data.omaggioPaia : null;
  const righeArticolo = data.items.filter((it) => it.subtotale > 0);
  const consegna = [c.indirizzo, [c.cap, c.citta].filter(Boolean).join(" ")]
    .filter(Boolean)
    .join(", ");

  const subject = `Copia del suo ordine ${data.numeroOrdine} — ${mittente}`;

  const text = [
    `Gentile ${c.ragione_sociale},`,
    "",
    `le inviamo la copia del Suo ordine ${data.numeroOrdine} del ${formatDate(data.dataOrdine)}.`,
    "",
    "ARTICOLI",
    righeArticolo
      .map(
        (it) =>
          `- ${it.quantita} x ${it.descrizione}${it.diottria ? ` (${it.diottria})` : ""}: ${formatEur(it.subtotale)}`
      )
      .join("\n") || "- (nessun articolo)",
    omaggio ? `\nOmaggio: ${giftLabel(omaggio)}` : "",
    "",
    `Imponibile: ${formatEur(data.totali.imponibile)}`,
    `Trasporto: ${formatEur(data.totali.trasporto)}`,
    `IVA: ${formatEur(data.totali.iva)}`,
    `Totale: ${formatEur(data.totali.totale)}`,
    "",
    `Pagamento: ${data.pagamento}`,
    consegna
      ? `Consegna: ${consegna}${c.provincia ? ` (${c.provincia})` : ""}`
      : "",
    data.message ? `\n${data.message}` : "",
    "",
    "Cordiali saluti",
    mittente,
  ]
    .filter((line) => line !== "")
    .join("\n");

  return {
    subject,
    text,
    html: buildCustomerCopyHtml({
      data,
      mittente,
      omaggio,
      righe: righeArticolo,
    }),
  };
}

/** Parte HTML (stili inline: compatibile con i client di posta). */
function buildCustomerCopyHtml(args: {
  data: CustomerCopyData;
  mittente: string;
  omaggio: number | null;
  righe: OrderItem[];
}): string {
  const { data, mittente, omaggio, righe } = args;
  const c = data.cliente;
  const TD = "padding:6px 8px;border:1px solid #e2e8f0;";
  const righeHtml = righe
    .map(
      (it) =>
        `<tr><td style="${TD}">${esc(it.descrizione)}</td><td align="center" style="${TD}">${esc(it.diottria ?? "—")}</td><td align="center" style="${TD}">${it.quantita}</td><td align="right" style="${TD}">${formatEur(it.subtotale)}</td></tr>`
    )
    .join("");
  const det = (label: string, value: string) =>
    `<tr><td style="padding:2px 0;width:140px;color:#64748b;">${label}</td><td style="padding:2px 0;">${value}</td></tr>`;
  const capCitta = `${c.cap || "—"} ${c.citta || ""}`.trim();

  return `<!doctype html>
<html lang="it"><head><meta charset="utf-8" /></head>
<body style="margin:0;padding:0;background:#f1f5f9;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f1f5f9;padding:18px 12px;">
<tr><td align="center">
<table role="presentation" width="640" cellpadding="0" cellspacing="0" style="max-width:640px;background:#ffffff;border:1px solid #e2e8f0;border-radius:10px;font-family:Arial,Helvetica,sans-serif;color:#0f172a;">
<tr><td style="padding:18px 20px;border-bottom:3px solid #2563eb;">
  <div style="font-size:18px;font-weight:bold;">${esc(mittente)}</div>
  <div style="font-size:13px;color:#64748b;margin-top:4px;">Copia dell'ordine ${esc(data.numeroOrdine)} — ${esc(formatDate(data.dataOrdine))}</div>
</td></tr>
<tr><td style="padding:16px 20px;">
  <p style="margin:0 0 12px;font-size:14px;">Gentile <strong>${esc(c.ragione_sociale)}</strong>,<br />le inviamo la copia del Suo ordine. Di seguito il riepilogo.</p>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="font-size:13px;color:#334155;">
    ${det("Ragione sociale", esc(c.ragione_sociale))}
    ${det("Indirizzo", esc(c.indirizzo || "—"))}
    ${det("CAP / Città", `${esc(capCitta)}${c.provincia ? ` (${esc(c.provincia)})` : ""}`)}
    ${det("P.IVA / C.F.", esc([c.partita_iva, c.codice_fiscale].filter(Boolean).join(" / ") || "—"))}
    ${det("SDI", esc(c.sdi || "—"))}
    ${det("Cellulare / Email", esc([c.cellulare, c.email].filter(Boolean).join(" / ") || "—"))}
    ${det("Pagamento", esc(data.pagamento || "—"))}
  </table>
</td></tr>
<tr><td style="padding:0 20px 8px;">
  <div style="font-size:13px;font-weight:bold;margin-bottom:6px;">Articoli</div>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="font-size:13px;border-collapse:collapse;">
    <tr style="background:#f8fafc;">
      <th align="left" style="${TD}">Descrizione</th><th align="center" style="${TD}">Diottria</th><th align="center" style="${TD}">Qtà</th><th align="right" style="${TD}">Subtotale</th>
    </tr>
    ${righeHtml}
  </table>
  ${omaggioHtml(omaggio)}
</td></tr>
${totaliHtml(data)}
${data.message ? `<tr><td style="padding:0 20px 16px;font-size:13px;color:#334155;white-space:pre-line;">${esc(data.message)}</td></tr>` : ""}
<tr><td style="padding:12px 20px;border-top:1px solid #e2e8f0;background:#f8fafc;font-size:12px;color:#64748b;">
  Email generata automaticamente: per informazioni risponda a questo messaggio.<br />${esc(mittente)}
</td></tr>
</table>
</td></tr>
</table>
</body></html>`;
}

/** Riga dell'omaggio (verde) nella copia: compare solo se ci sono paia. */
function omaggioHtml(omaggio: number | null): string {
  if (!omaggio) return "";
  return `<p style="margin:10px 0 0;padding:8px 10px;background:#ecfdf5;border:1px solid #a7f3d0;border-radius:6px;font-size:13px;color:#065f46;"><strong>Omaggio:</strong> ${esc(giftLabel(omaggio))}</p>`;
}

/** Blocco totali (imponibile, trasporto, IVA, totale). */
function totaliHtml(data: CustomerCopyData): string {
  const r = (label: string, value: string, grand = false) =>
    `<tr><td style="${grand ? "padding:8px 0 2px;font-weight:bold;border-top:2px solid #0f172a;" : "padding:2px 0;"}">${label}</td><td align="right" style="${grand ? "padding:8px 0 2px;font-weight:bold;border-top:2px solid #0f172a;" : "padding:2px 0;"}">${value}</td></tr>`;
  return `<tr><td style="padding:10px 20px 18px;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="font-size:13px;color:#334155;">
    ${r("Imponibile", formatEur(data.totali.imponibile))}
    ${r("Trasporto", formatEur(data.totali.trasporto))}
    ${r("IVA", formatEur(data.totali.iva))}
    ${r("Totale", formatEur(data.totali.totale), true)}
  </table>
</td></tr>`;
}
