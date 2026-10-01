import { promises as fs } from "node:fs";
import path from "node:path";
import { appDataPath } from "@/lib/data-dir";
import { getAppSetting, setAppSetting } from "@/lib/supabase/app-settings";

/**
 * ANAGRAFICA dell'ORDINE (correzioni dell'amministratore).
 *
 * Perche' esiste: gli ordini arrivano dagli agenti con l'anagrafica del cliente
 * (ragione sociale, indirizzo, CAP, citta', P.IVA/CF, SDI, cellulare, email).
 * Se l'agente sbaglia a digitare, l'amministratore deve poter correggere
 * l'errore SENZA toccare l'ordine originale, l'anagrafica condivisa dei clienti
 * ne' gli altri ordini dello stesso cliente.
 *
 * Come: si salva una COPIA CORRETTA dei soli campi anagrafici, legata al singolo
 * ordine, in una tabella chiave-valore (Supabase `app_settings`, gia' esistente:
 * NESSUNA migrazione del database) con fallback sul file locale
 * data/orders-anagrafica.json quando Supabase non e' configurato.
 *
 * GARANZIE:
 * - non si modifica e non si elimina NESSUN dato esistente (ordine, file Excel,
 *   anagrafica cliente): si aggiunge soltanto una voce nuova;
 * - la correzione viene applicata SOLO in lettura (dettaglio/stampa dell'ordine);
 * - la scrittura e' riservata all'amministratore principale (vedi actions.ts).
 */

const FILE = appDataPath("orders-anagrafica.json");
const KEY_PREFIX = "order_anagrafica:";

/** Campi anagrafici correggibili dall'amministratore. */
export type OrderAnagrafica = {
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

type StoredAnagrafica = OrderAnagrafica & {
  updatedAt: string;
  updatedBy?: string | null;
};

export const ORDER_ANAGRAFICA_FIELDS: (keyof OrderAnagrafica)[] = [
  "ragione_sociale",
  "indirizzo",
  "cap",
  "citta",
  "provincia",
  "partita_iva",
  "codice_fiscale",
  "sdi",
  "cellulare",
  "email",
];

function keyFor(orderId: string): string {
  return `${KEY_PREFIX}${orderId}`;
}

/** Ripulisce/sposta i valori in stringhe (mai undefined). */
export function normalizeOrderAnagrafica(
  value: Partial<OrderAnagrafica> | null | undefined
): OrderAnagrafica {
  const out = {} as OrderAnagrafica;
  for (const field of ORDER_ANAGRAFICA_FIELDS) {
    out[field] = String(value?.[field] ?? "").trim();
  }
  return out;
}

async function readLocal(): Promise<Record<string, StoredAnagrafica>> {
  try {
    const raw = JSON.parse(await fs.readFile(FILE, "utf8")) as unknown;
    if (raw && typeof raw === "object") {
      return raw as Record<string, StoredAnagrafica>;
    }
  } catch {
    // file assente o non valido: mappa vuota
  }
  return {};
}

async function writeLocal(map: Record<string, StoredAnagrafica>): Promise<void> {
  await fs.mkdir(path.dirname(FILE), { recursive: true });
  await fs.writeFile(FILE, JSON.stringify(map, null, 2), "utf8");
}

/**
 * Salva la correzione anagrafica di un ordine.
 * Ritorna true se il salvataggio e' riuscito (Supabase o file locale).
 * NON elimina nulla: aggiorna solo la voce di questo ordine.
 */
export async function saveOrderAnagrafica(
  orderId: string,
  data: OrderAnagrafica,
  updatedBy?: string | null
): Promise<boolean> {
  if (!orderId) return false;
  const clean = normalizeOrderAnagrafica(data);
  const value: StoredAnagrafica = {
    ...clean,
    updatedAt: new Date().toISOString(),
    updatedBy: updatedBy ?? null,
  };

  // 1) Online (Supabase app_settings): nessuna migrazione necessaria.
  if (await setAppSetting(keyFor(orderId), value)) return true;

  // 2) Locale: mappa ordine -> anagrafica corretta.
  try {
    const map = await readLocal();
    map[orderId] = value;
    await writeLocal(map);
    return true;
  } catch {
    // filesystem in sola lettura e Supabase non disponibile.
    return false;
  }
}

/**
 * Anagrafica corretta salvata per l'ordine, oppure null se l'amministratore non
 * ha mai effettuato correzioni.
 */
export async function getOrderAnagrafica(
  orderId: string
): Promise<OrderAnagrafica | null> {
  if (!orderId) return null;

  const remote = await getAppSetting<StoredAnagrafica>(keyFor(orderId));
  if (remote && typeof remote === "object") {
    return normalizeOrderAnagrafica(remote);
  }

  try {
    const map = await readLocal();
    const local = map[orderId];
    if (local) return normalizeOrderAnagrafica(local);
  } catch {
    // ignora: si usa l'anagrafica originale
  }
  return null;
}

/** Valori di partenza (anagrafica dell'ordine/cliente) usati per la modifica. */
export type OrderAnagraficaBase = Partial<OrderAnagrafica> | null | undefined;

/**
 * Anagrafica EFFETTIVA da mostrare/stampare: se l'amministratore ha corretto
 * l'ordine vale la correzione (anche per i campi lasciati vuoti = "cancella"),
 * altrimenti i valori originali dell'ordine/cliente.
 */
export function effectiveOrderAnagrafica(
  base: OrderAnagraficaBase,
  override: OrderAnagrafica | null | undefined
): OrderAnagrafica {
  const out = {} as OrderAnagrafica;
  for (const field of ORDER_ANAGRAFICA_FIELDS) {
    out[field] = override
      ? String(override[field] ?? "")
      : String(base?.[field] ?? "");
  }
  return out;
}
