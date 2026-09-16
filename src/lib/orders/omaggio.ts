import { promises as fs } from "node:fs";
import path from "node:path";
import XLSXPopulate from "xlsx-populate";
import { appDataPath } from "@/lib/data-dir";
import { getAppSetting, setAppSetting } from "@/lib/supabase/app-settings";
import { downloadOrderExcel } from "@/lib/orders/storage";
import { GIFT_MAX_QTY } from "@/lib/catalog/gift-rules";

/**
 * Numero di paia di occhiali in OMAGGIO, per singolo ordine.
 *
 * Perche' esiste: con il nuovo sistema l'omaggio ("jolly" da 1 a 10 paia, senza
 * scelta degli articoli) viene annotato SOLO nel campo note del modulo Excel:
 * fuori dal file Excel l'informazione non esiste (la tabella `orders` non ha
 * una colonna note e il record su file non la conserva).
 *
 * Per poterlo mostrare nella stampa dell'ordine - e quindi anche nella copia
 * inviata al cliente - lo salviamo qui.
 *
 * Dove: nelle impostazioni chiave-valore su Supabase (tabella `app_settings`,
 * gia' esistente: NESSUNA modifica allo schema del database) con fallback sul
 * file locale data/orders-omaggio.json quando Supabase non e' configurato.
 *
 * Nessun dato esistente viene toccato: si aggiungono solo nuove voci.
 */

const FILE = appDataPath("orders-omaggio.json");
const KEY_PREFIX = "order_omaggio:";

type StoredOmaggio = { paia: number; updatedAt: string };

function keyFor(orderId: string): string {
  return `${KEY_PREFIX}${orderId}`;
}

/** Numero di paia valido (1..GIFT_MAX_QTY). */
export function isValidOmaggioPaia(value: unknown): value is number {
  return (
    typeof value === "number" &&
    Number.isInteger(value) &&
    value >= 1 &&
    value <= GIFT_MAX_QTY
  );
}

async function readLocal(): Promise<Record<string, StoredOmaggio>> {
  try {
    const raw = JSON.parse(await fs.readFile(FILE, "utf8")) as unknown;
    if (raw && typeof raw === "object") {
      return raw as Record<string, StoredOmaggio>;
    }
  } catch {
    // file assente o non valido: si riparte da una mappa vuota
  }
  return {};
}

async function writeLocal(map: Record<string, StoredOmaggio>): Promise<void> {
  await fs.mkdir(path.dirname(FILE), { recursive: true });
  await fs.writeFile(FILE, JSON.stringify(map, null, 2), "utf8");
}

/** Salva il numero di paia omaggio di un ordine (non elimina nulla). */
export async function saveOrderOmaggio(
  orderId: string,
  paia: number
): Promise<void> {
  if (!orderId || !isValidOmaggioPaia(paia)) return;
  const value: StoredOmaggio = { paia, updatedAt: new Date().toISOString() };

  // 1) Online (Supabase app_settings): nessuna migrazione necessaria.
  if (await setAppSetting(keyFor(orderId), value)) return;

  // 2) Locale: mappa ordine -> paia.
  try {
    const map = await readLocal();
    map[orderId] = value;
    await writeLocal(map);
  } catch {
    // In produzione il filesystem puo' essere in sola lettura: non e' un
    // errore bloccante per l'ordine (l'omaggio resta comunque nel file Excel).
  }
}

/** Paia omaggio salvate per un ordine, oppure null se non presenti. */
export async function getOrderOmaggio(orderId: string): Promise<number | null> {
  if (!orderId) return null;

  const remote = await getAppSetting<StoredOmaggio>(keyFor(orderId));
  if (remote && typeof remote.paia === "number") {
    // paia = 0 e' il marcatore "nessun omaggio trovato": vale come null.
    return remote.paia >= 1 ? remote.paia : null;
  }

  try {
    const map = await readLocal();
    const local = map[orderId];
    return local && typeof local.paia === "number" && local.paia >= 1
      ? local.paia
      : null;
  } catch {
    return null;
  }
}

/**
 * Marca l'ordine come "controllato" senza omaggio: evita di rileggere il file
 * Excel a ogni apertura del documento.
 */
export async function markOrderOmaggioChecked(orderId: string): Promise<void> {
  if (!orderId) return;
  const value: StoredOmaggio = { paia: 0, updatedAt: new Date().toISOString() };
  if (await setAppSetting(keyFor(orderId), value)) return;
  try {
    const map = await readLocal();
    map[orderId] = value;
    await writeLocal(map);
  } catch {
    // filesystem in sola lettura: nessun problema, si riprovera' piu' avanti
  }
}

/** True se per l'ordine esiste gia' un esito salvato (paia oppure "nessuno"). */
export async function isOrderOmaggioChecked(orderId: string): Promise<boolean> {
  if (!orderId) return false;
  const remote = await getAppSetting<StoredOmaggio>(keyFor(orderId));
  if (remote && typeof remote.paia === "number") return true;
  try {
    const map = await readLocal();
    return Boolean(map[orderId]);
  } catch {
    return false;
  }
}

// Cella del campo NOTE nel modulo Excel (riga 8, colonna I): vedi
// lib/orders/excel.ts, dove la nota (con l'omaggio) viene scritta.
const NOTE_ROW = 8;
const NOTE_COL = 9;

/**
 * Legge l'omaggio DENTRO il modulo Excel dell'ordine (campo note):
 * serve per gli ordini creati prima che l'omaggio venisse salvato a parte.
 * SOLA LETTURA: il file Excel non viene mai modificato.
 */
export async function readOmaggioFromOrderExcel(
  fileRef: string | null | undefined
): Promise<number | null> {
  const fileName = String(fileRef ?? "").split("/").filter(Boolean).pop() ?? "";
  if (!fileName || !/\.xlsx$/i.test(fileName)) return null;

  let buffer: Buffer | null = null;
  try {
    buffer = await downloadOrderExcel(fileName); // Storage (online)
  } catch {
    buffer = null;
  }
  if (!buffer) {
    try {
      buffer = await fs.readFile(appDataPath("orders", fileName)); // locale
    } catch {
      buffer = null;
    }
  }
  if (!buffer) return null;

  try {
    const workbook = await XLSXPopulate.fromDataAsync(buffer);
    const raw = workbook.sheet(0).cell(NOTE_ROW, NOTE_COL).value();
    const text = typeof raw === "string" ? raw : String(raw ?? "");
    const m = text.match(/(\d+)\s+paia?\s+di\s+occhiali\s+omaggio/i);
    const n = m ? Number(m[1]) : NaN;
    return isValidOmaggioPaia(n) ? n : null;
  } catch {
    return null;
  }
}

/**
 * Omaggio da mostrare nel documento dell'ordine (stampa agente e
 * amministratore): quello salvato; se manca - ordini creati prima della
 * funzione - lo recupera UNA VOLTA dal file Excel e lo salva, cosi' le volte
 * successive e' immediato. Non cancella e non modifica nessun documento.
 */
export async function getOrderOmaggioWithRecovery(
  orderId: string,
  fileRef?: string | null
): Promise<number | null> {
  const salvato = await getOrderOmaggio(orderId);
  if (salvato) return salvato;
  if (await isOrderOmaggioChecked(orderId)) return null;

  const recuperato = await readOmaggioFromOrderExcel(fileRef);
  if (recuperato) {
    await saveOrderOmaggio(orderId, recuperato);
    return recuperato;
  }
  await markOrderOmaggioChecked(orderId);
  return null;
}
