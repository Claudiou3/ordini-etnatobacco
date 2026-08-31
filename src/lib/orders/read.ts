import { promises as fs } from "node:fs";
import path from "node:path";

/**
 * Stato "letto/non letto" degli ordini per l'amministratore.
 * Salvato in data/orders-read.json (ordine_id -> timestamp), così funziona sia
 * per gli ordini nel database sia per quelli salvati su file.
 */

const READ_FILE = path.join(process.cwd(), "data", "orders-read.json");

type ReadMap = { version: 1; orders: Record<string, string> };

let cache: Record<string, string> | null = null;

async function load(): Promise<Record<string, string>> {
  if (cache) return cache;
  try {
    const raw = JSON.parse(await fs.readFile(READ_FILE, "utf8")) as ReadMap;
    cache = raw.orders ?? {};
  } catch {
    cache = {};
  }
  return cache;
}

/** Id degli ordini già letti dall'amministratore. */
export async function getReadOrderIds(): Promise<Set<string>> {
  const map = await load();
  return new Set(Object.keys(map));
}

/** Marca un ordine come letto (timestamp ora). */
export async function markOrderRead(id: string): Promise<void> {
  const map = await load();
  if (map[id]) return;
  map[id] = new Date().toISOString();
  await fs.mkdir(path.dirname(READ_FILE), { recursive: true });
  await fs.writeFile(
    READ_FILE,
    JSON.stringify({ version: 1, orders: map }, null, 2)
  );
}
