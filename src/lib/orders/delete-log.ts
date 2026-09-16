import { promises as fs } from "node:fs";
import path from "node:path";
import { appDataPath } from "@/lib/data-dir";
import { getAppSetting, setAppSetting } from "@/lib/supabase/app-settings";

/**
 * REGISTRO DELLE ELIMINAZIONI DEGLI ORDINI (tracciamento).
 *
 * Perche' esiste: l'eliminazione di un ordine e' definitiva (sparisce la riga
 * e anche il file Excel) e prima non restava alcuna traccia di chi l'avesse
 * fatta e quando. Qui si annota ogni eliminazione, cosi' l'ufficio puo' sempre
 * ricostruire cosa e' successo.
 *
 * Dove: chiave `order_delete_log` nella tabella chiave-valore `app_settings`
 * (gia' esistente: NESSUNA migrazione del database), con fallback sul file
 * locale data/orders-eliminati.json.
 *
 * Nota: le voci sono al massimo 200 (le piu' recenti restano).
 */

const FILE = appDataPath("orders-eliminati.json");
const KEY = "order_delete_log";
const MAX_ENTRIES = 200;

export type OrderDeletionEntry = {
  /** Data/ora ISO dell'eliminazione. */
  at: string;
  /** Chi ha eliminato (email dell'amministratore). */
  by: string;
  numero_ordine: string;
  cliente: string;
  totale: number;
};

/** Registro completo (dal piu' recente). */
export async function getOrderDeletions(): Promise<OrderDeletionEntry[]> {
  const remote = await getAppSetting<OrderDeletionEntry[]>(KEY, { fresh: true });
  if (Array.isArray(remote)) return remote;
  try {
    const raw = JSON.parse(await fs.readFile(FILE, "utf8")) as unknown;
    if (Array.isArray(raw)) return raw as OrderDeletionEntry[];
  } catch {
    // nessun registro locale
  }
  return [];
}

/** Aggiunge una voce al registro (senza toccare le precedenti). */
export async function logOrderDeletion(
  entry: OrderDeletionEntry
): Promise<void> {
  const list = await getOrderDeletions();
  const next = [entry, ...list].slice(0, MAX_ENTRIES);

  if (await setAppSetting(KEY, next)) return;
  try {
    await fs.mkdir(path.dirname(FILE), { recursive: true });
    await fs.writeFile(FILE, JSON.stringify(next, null, 2), "utf8");
  } catch {
    // filesystem in sola lettura: il registro resta comunque online
  }
}
