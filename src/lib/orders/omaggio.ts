import { promises as fs } from "node:fs";
import path from "node:path";
import { appDataPath } from "@/lib/data-dir";
import { getAppSetting, setAppSetting } from "@/lib/supabase/app-settings";
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
  if (remote && typeof remote.paia === "number") return remote.paia;

  try {
    const map = await readLocal();
    const local = map[orderId];
    return local && typeof local.paia === "number" ? local.paia : null;
  } catch {
    return null;
  }
}
