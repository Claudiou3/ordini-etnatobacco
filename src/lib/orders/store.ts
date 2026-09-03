import { promises as fs } from "node:fs";
import path from "node:path";
import type { OrderDetail, OrderListItem } from "@/lib/types";
import { sortOrdersByArrival } from "./sort";
import { appDataDir } from "@/lib/data-dir";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Persistenza ORDINI in modalita' demo su file JSON (data/orders.json).
 * Gli ordini creati dal modulo "Nuovo ordine" vengono salvati qui, così
 * sopravvivono al riavvio del server anche senza Supabase.
 */

const ORDERS_FILE = path.join(appDataDir(), "orders.json");
const DATA_DIR = appDataDir();

type StoredFile = { version: 1; orders: OrderDetail[] };

let cache: OrderDetail[] | null = null;
let cacheMtime = 0;

async function load(): Promise<OrderDetail[]> {
  // Ricarica se il file è cambiato dall'ultima lettura (o è appena comparso).
  try {
    const stat = await fs.stat(ORDERS_FILE);
    if (cache && cacheMtime === stat.mtimeMs) return cache;
  } catch {
    // file non ancora presente
  }

  try {
    const raw = JSON.parse(await fs.readFile(ORDERS_FILE, "utf8")) as StoredFile;
    cache = raw.orders ?? [];
  } catch {
    cache = [];
  }
  try {
    cacheMtime = (await fs.stat(ORDERS_FILE)).mtimeMs;
  } catch {
    cacheMtime = 0;
  }
  return cache;
}

export async function fileListOrders(limit = 100): Promise<OrderListItem[]> {
  const all = await load();
  return sortOrdersByArrival(
    all.map((d) => ({
      id: d.order.id,
      agent_id: d.order.agent_id,
      numero_ordine: d.order.numero_ordine,
      data_ordine: d.order.data_ordine,
      created_at: d.order.created_at,
      totale: d.order.totale,
      pagamento: d.order.pagamento,
      file_url: d.order.file_url,
      customers: d.order.customers,
      partita_iva: d.order.partita_iva ?? null,
      codice_fiscale: d.order.codice_fiscale ?? null,
      stato: d.order.stato ?? null,
      annullamento_motivo: d.order.annullamento_motivo ?? null,
      annullato_at: d.order.annullato_at ?? null,
    }))
  ).slice(0, limit);
}

export async function fileCreateOrder(detail: OrderDetail): Promise<void> {
  const all = await load();
  all.push(detail);
  cache = all;
  await fs.mkdir(path.dirname(ORDERS_FILE), { recursive: true });
  await fs.writeFile(
    ORDERS_FILE,
    JSON.stringify({ version: 1, orders: all }, null, 2)
  );
  try {
    cacheMtime = (await fs.stat(ORDERS_FILE)).mtimeMs;
  } catch {
    cacheMtime = 0;
  }
}

export async function fileGetOrderDetail(id: string): Promise<OrderDetail | null> {
  const all = await load();
  return all.find((d) => d.order.id === id) ?? null;
}

export async function fileDeleteOrder(id: string): Promise<void> {
  const all = await load();
  const next = all.filter((d) => d.order.id !== id);
  cache = next;
  await fs.writeFile(
    ORDERS_FILE,
    JSON.stringify({ version: 1, orders: next }, null, 2)
  );
  try {
    cacheMtime = (await fs.stat(ORDERS_FILE)).mtimeMs;
  } catch {
    cacheMtime = 0;
  }
}

/** Persiste la lista aggiornata (aggiornando anche la cache e il mtime). */
async function writeAll(all: OrderDetail[]): Promise<void> {
  cache = all;
  await fs.mkdir(path.dirname(ORDERS_FILE), { recursive: true });
  await fs.writeFile(
    ORDERS_FILE,
    JSON.stringify({ version: 1, orders: all }, null, 2)
  );
  try {
    cacheMtime = (await fs.stat(ORDERS_FILE)).mtimeMs;
  } catch {
    cacheMtime = 0;
  }
}

/**
 * Marca un ordine come ANNULLATO con la motivazione inserita
 * dall'amministratore (es. cliente che rifiuta la merce).
 * Ritorna false se l'ordine non esiste sul file.
 */
export async function fileCancelOrder(
  orderId: string,
  motivo: string
): Promise<boolean> {
  const all = await load();
  const detail = all.find((d) => d.order.id === orderId);
  if (!detail) return false;
  detail.order.stato = "annullato";
  detail.order.annullamento_motivo = motivo;
  detail.order.annullato_at = new Date().toISOString();
  await writeAll(all);
  return true;
}

/**
 * Ripristina un ordine annullato: torna "attivo", motivazione rimossa
 * (e le provvigioni tornano ad essere conteggiate).
 */
export async function fileRestoreOrder(orderId: string): Promise<boolean> {
  const all = await load();
  const detail = all.find((d) => d.order.id === orderId);
  if (!detail) return false;
  detail.order.stato = "attivo";
  detail.order.annullamento_motivo = null;
  detail.order.annullato_at = null;
  await writeAll(all);
  return true;
}

/**
 * Elimina il file Excel dell'ordine (se presente) da Storage e/o da data/orders.
 * @param fileRef può essere il vecchio nome derivato dal numero ordine
 *   (es. "ORD-2026-0001") oppure l'URL completo del file salvato
 *   (es. "/ordini-files/Agente - Cliente.xlsx").
 */
export async function deleteOrderExcelFile(fileRef: string): Promise<void> {
  // Estrae il nome file dall'URL (se arriva "/ordini-files/...").
  let raw = fileRef.includes("/") ? fileRef.slice(fileRef.lastIndexOf("/") + 1) : fileRef;
  const queryIdx = raw.indexOf("?");
  if (queryIdx >= 0) raw = raw.slice(0, queryIdx);
  let decoded = raw;
  try {
    decoded = decodeURIComponent(raw);
  } catch {
    // nome già leggibile
  }
  const base = decoded.toLowerCase().endsWith(".xlsx")
    ? decoded.slice(0, -5)
    : decoded;
  const fileName = `${base}.xlsx`;

  // Supabase Storage.
  try {
    const supabase = await createAdminClient();
    if (supabase) {
      await supabase.storage.from("ordini").remove([fileName]);
    }
  } catch {
    // nessun problema: si tenta anche il file locale
  }
  // File locale.
  try {
    await fs.unlink(path.join(DATA_DIR, "orders", fileName));
  } catch {
    // file non presente: nessun problema
  }
}

export async function fileCountOrders(): Promise<number> {
  return (await load()).length;
}

/** Prossimo numero ordine progressivo per l'anno corrente. */
export async function fileNextOrderNumber(): Promise<string> {
  const year = new Date().getFullYear();
  const prefix = `ORD-${year}-`;
  const all = await load();
  const seq =
    all.filter((d) => d.order.numero_ordine.startsWith(prefix)).length + 1;
  return `${prefix}${String(seq).padStart(4, "0")}`;
}

/** Conta gli ordini del file con il prefisso indicato (per la numerazione). */
export async function fileCountOrdersByPrefix(prefix: string): Promise<number> {
  const all = await load();
  return all.filter((d) => d.order.numero_ordine.startsWith(prefix)).length;
}
