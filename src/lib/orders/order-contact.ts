import { promises as fs } from "node:fs";
import path from "node:path";
import XLSXPopulate from "xlsx-populate";
import { appDataPath } from "@/lib/data-dir";
import { getAppSetting, setAppSetting } from "@/lib/supabase/app-settings";
import { downloadOrderExcel } from "@/lib/orders/storage";

/**
 * CONTATTI USATI NELL'ORDINE (email e cellulare del Passo 2).
 *
 * Perche' esiste: la tabella `orders` non conserva l'email e il cellulare usati
 * per l'ordine (finiscono SOLO nel modulo Excel). Il documento di stampa legge
 * l'anagrafica: se l'agente cambia l'email di un cliente prima di trasmettere,
 * nel documento restava quella vecchia dell'anagrafica (mentre l'Excel e
 * l'email di copia al cliente avevano quella nuova).
 *
 * Qui salviamo i valori effettivi dell'ordine nella tabella chiave-valore
 * `app_settings` (gia' esistente: NESSUNA migrazione del database), con
 * fallback sul file locale data/orders-contatti.json.
 *
 * Per gli ordini creati prima di questa funzione i valori vengono letti in
 * SOLA LETTURA dal modulo Excel dell'ordine e salvati una volta sola: cosi'
 * anche i documenti gia' trasmessi mostrano l'email giusta.
 *
 * Nessun file, ordine o dato esistente viene modificato o eliminato.
 */

const FILE = appDataPath("orders-contatti.json");
const KEY_PREFIX = "order_contact:";
// Celle del modulo Excel (vedi lib/orders/excel.ts):
//   D11 = cellulare, D12 = email del cliente
const ROW_CELLULARE = 11;
const ROW_EMAIL = 12;
const COL_D = 4;

export type OrderContact = { email: string; cellulare: string };

type StoredContact = OrderContact & { updatedAt: string };

function keyFor(orderId: string): string {
  return `${KEY_PREFIX}${orderId}`;
}

/** Sintassi email valida (stessa regola usata per la copia al cliente). */
export function isValidContactEmail(value: string | null | undefined): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test((value ?? "").trim());
}

function normalize(value: Partial<OrderContact> | null | undefined): OrderContact {
  return {
    email: String(value?.email ?? "").trim(),
    cellulare: String(value?.cellulare ?? "").trim(),
  };
}

async function readLocal(): Promise<Record<string, StoredContact>> {
  try {
    const raw = JSON.parse(await fs.readFile(FILE, "utf8")) as unknown;
    if (raw && typeof raw === "object") {
      return raw as Record<string, StoredContact>;
    }
  } catch {
    // file assente o non valido: mappa vuota
  }
  return {};
}

async function writeLocal(map: Record<string, StoredContact>): Promise<void> {
  await fs.mkdir(path.dirname(FILE), { recursive: true });
  await fs.writeFile(FILE, JSON.stringify(map, null, 2), "utf8");
}

async function put(orderId: string, contact: OrderContact): Promise<void> {
  if (!orderId) return;
  const value: StoredContact = { ...contact, updatedAt: new Date().toISOString() };
  if (await setAppSetting(keyFor(orderId), value)) return;
  try {
    const map = await readLocal();
    map[orderId] = value;
    await writeLocal(map);
  } catch {
    // filesystem in sola lettura: l'ordine resta valido, si riprovera' dopo
  }
}

/** Salva email e cellulare effettivamente usati nell'ordine. */
export async function saveOrderContact(
  orderId: string,
  contact: OrderContact
): Promise<void> {
  const clean = normalize(contact);
  if (!clean.email && !clean.cellulare) return;
  await put(orderId, clean);
}

/** Marca l'ordine come "controllato" anche se non c'e' nulla da salvare. */
export async function markOrderContactChecked(orderId: string): Promise<void> {
  await put(orderId, { email: "", cellulare: "" });
}

/** Contatti salvati per l'ordine, oppure null se non presenti. */
export async function getOrderContact(
  orderId: string
): Promise<OrderContact | null> {
  if (!orderId) return null;

  const remote = await getAppSetting<StoredContact>(keyFor(orderId));
  if (remote && typeof remote === "object") {
    const clean = normalize(remote);
    return clean.email || clean.cellulare ? clean : null;
  }

  try {
    const map = await readLocal();
    const local = map[orderId];
    if (local) {
      const clean = normalize(local);
      return clean.email || clean.cellulare ? clean : null;
    }
  } catch {
    // ignora: si usa l'anagrafica
  }
  return null;
}

/** True se per l'ordine esiste gia' un esito salvato (anche "nessun contatto"). */
export async function isOrderContactChecked(orderId: string): Promise<boolean> {
  if (!orderId) return false;
  const remote = await getAppSetting<StoredContact>(keyFor(orderId));
  if (remote && typeof remote === "object") return true;
  try {
    const map = await readLocal();
    return Boolean(map[orderId]);
  } catch {
    return false;
  }
}

/**
 * Legge email e cellulare DENTRO il modulo Excel dell'ordine (D12 e D11):
 * serve per gli ordini creati prima che i contatti venissero salvati a parte.
 * SOLA LETTURA: il file Excel non viene mai modificato.
 */
export async function readContactFromOrderExcel(
  fileRef: string | null | undefined
): Promise<OrderContact | null> {
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
    const sheet = workbook.sheet(0);
    const readCell = (row: number): string => {
      const raw = sheet.cell(row, COL_D).value();
      return typeof raw === "string" ? raw.trim() : String(raw ?? "").trim();
    };
    const email = readCell(ROW_EMAIL);
    const cellulare = readCell(ROW_CELLULARE);
    const contact: OrderContact = {
      email: isValidContactEmail(email) ? email : "",
      cellulare,
    };
    return contact.email || contact.cellulare ? contact : null;
  } catch {
    return null;
  }
}

/**
 * Contatti da mostrare nel documento dell'ordine (stampa agente e
 * amministratore): quelli salvati con l'ordine; se mancano - ordini creati
 * prima della funzione - vengono recuperati UNA VOLTA dal modulo Excel e
 * salvati, cosi' le volte successive sono immediati. Non modifica documenti.
 */
export async function getOrderContactWithRecovery(
  orderId: string,
  fileRef?: string | null
): Promise<OrderContact | null> {
  const salvato = await getOrderContact(orderId);
  if (salvato) return salvato;
  if (await isOrderContactChecked(orderId)) return null;

  const recuperato = await readContactFromOrderExcel(fileRef);
  if (recuperato) {
    await saveOrderContact(orderId, recuperato);
    return recuperato;
  }
  await markOrderContactChecked(orderId);
  return null;
}
