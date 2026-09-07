import { promises as fs } from "node:fs";
import path from "node:path";
import { appDataPath } from "@/lib/data-dir";
import { getAppSetting, setAppSetting } from "@/lib/supabase/app-settings";

/**
 * Stato "confermato/non letto" degli ordini per l'amministratore.
 * Salvato su Supabase (app_settings) quando disponibile, altrimenti in
 * data/orders-read.json (ordine_id -> timestamp). Funziona sia per gli
 * ordini nel database sia per quelli salvati su file.
 *
 * PERCHÉ LA CONFERMA "RICOMPARE": lo stato è una MAPPA condivisa scritta da
 * tutte le istanze Vercel. Prima questo modulo teneva in memoria la mappa
 * letta una sola volta, per sempre: un'istanza "calda" che l'aveva letta
 * prima della conferma continuava a mostrare l'ordine in rosso, e una
 * scrittura basata su quella copia vecchia poteva cancellare conferme appena
 * fatte da altre istanze.
 *
 * Soluzione:
 * - cache SOLO in lettura con TTL breve (10 s), per non rileggere a ogni
 *   richiesta;
 * - PRIMA di salvare una conferma si rilegge SEMPRE la mappa fresca dal
 *   server, così non si sovrascrivono conferme fatte altrove;
 * - markOrderRead ritorna true/false: se il salvataggio fallisce davvero
 *   l'interfaccia mostra l'errore invece di dire "confermato".
 */

const READ_FILE = appDataPath("orders-read.json");
const READ_SETTING_KEY = "orders_read";
const READ_CACHE_TTL_MS = 10_000;

type ReadMap = { version: 1; orders: Record<string, string> };

let cache: Record<string, string> | null = null;
let cacheAt = 0;

/** Legge la mappa più recente da Supabase (sempre senza cache remota). */
async function readRemote(): Promise<Record<string, string> | null> {
  const remote = await getAppSetting<Record<string, string>>(READ_SETTING_KEY, {
    fresh: true,
  });
  return remote;
}

/** Legge la mappa più recente: Supabase, altrimenti file locale. */
async function readLatest(): Promise<Record<string, string>> {
  const remote = await readRemote();
  if (remote) return remote;
  try {
    const raw = JSON.parse(await fs.readFile(READ_FILE, "utf8")) as ReadMap;
    return raw.orders ?? {};
  } catch {
    return {};
  }
}

async function load(): Promise<Record<string, string>> {
  const now = Date.now();
  if (cache && now - cacheAt < READ_CACHE_TTL_MS) return cache;
  const map = await readLatest();
  cache = map;
  cacheAt = now;
  return map;
}

/** Id degli ordini già confermati/letti dall'amministratore. */
export async function getReadOrderIds(): Promise<Set<string>> {
  const map = await load();
  return new Set(Object.keys(map));
}

/**
 * Marca un ordine come confermato/letto (timestamp ora).
 * Ritorna true se il salvataggio è riuscito (Supabase o file locale).
 */
export async function markOrderRead(id: string): Promise<boolean> {
  // Rileggi SEMPRE la versione fresca prima di salvare: evita di
  // sovrascrivere conferme appena fatte da un'altra istanza/scheda.
  const latest = await readLatest();
  if (latest[id]) {
    cache = latest;
    cacheAt = Date.now();
    return true;
  }
  latest[id] = new Date().toISOString();

  const saved = await setAppSetting(READ_SETTING_KEY, latest);
  if (saved) {
    cache = latest;
    cacheAt = Date.now();
    return true;
  }

  // Fallback su file locale (es. modalità demo/LAN senza Supabase).
  try {
    await fs.mkdir(path.dirname(READ_FILE), { recursive: true });
    await fs.writeFile(
      READ_FILE,
      JSON.stringify({ version: 1, orders: latest }, null, 2)
    );
    cache = latest;
    cacheAt = Date.now();
    return true;
  } catch {
    // Impossibile salvare né su Supabase né su file: la conferma NON è
    // andata a buon fine, il chiamante deve mostrare un errore.
    return false;
  }
}
