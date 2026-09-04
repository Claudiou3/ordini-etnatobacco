/**
 * Cache server leggera in memoria (per istanza) con TTL e "single-flight".
 *
 * Perché serve: con molti agenti collegati nello stesso istante le letture
 * "di configurazione" (catalogo Excel, loghi, spedizioni, provvigioni,
 * app_settings Supabase) venivano ripetute a ogni richiesta: parsing Excel,
 * download da Storage e query al database identici per tutti.
 *
 * Questa cache:
 * - tiene il risultato per TTL millisecondi;
 * - se più richieste arrivano insieme mentre il valore non è in cache,
 *   SOLO la prima esegue il lavoro pesante e le altre attendono lo stesso
 *   risultato (single-flight): con 100 agenti nello stesso istante il
 *   lavoro viene fatto una volta sola, non 100.
 *
 * Nota: vale per singola istanza (Node / Lambda Vercel). Su Vercel ogni
 * istanza "calda" ha la sua copia: il vantaggio principale è non ripetere
 * il lavoro all'interno dell'istanza e assorbire i picchi di richieste
 * simultanee sulla stessa istanza. Le scritture dell'amministratore
 * invalidano subito la voce locale.
 */

type TimedEntry<T> = { value: T; expiresAt: number };

const entries = new Map<string, TimedEntry<unknown>>();
const inflight = new Map<string, Promise<unknown>>();

/**
 * Ritorna il valore in cache se fresco; altrimenti chiama `loader` una
 * sola volta (anche per chiamate concorrenti con la stessa chiave) e
 * memorizza il risultato per `ttlMs`.
 */
export async function memoized<T>(
  key: string,
  ttlMs: number,
  loader: () => Promise<T>
): Promise<T> {
  const now = Date.now();
  const hit = entries.get(key);
  if (hit && hit.expiresAt > now) return hit.value as T;

  const running = inflight.get(key);
  if (running) return running as Promise<T>;

  const task = (async () => {
    try {
      const value = await loader();
      entries.set(key, { value, expiresAt: Date.now() + ttlMs });
      return value;
    } finally {
      inflight.delete(key);
    }
  })();
  inflight.set(key, task);
  return task;
}

/** Elimina subito una voce di cache (da chiamare dopo una scrittura admin). */
export function invalidateMemo(key: string): void {
  entries.delete(key);
}

/** Elimina tutte le voci con la chiave che inizia per `prefix`. */
export function invalidateMemoPrefix(prefix: string): void {
  if (entries.size === 0) return;
  for (const key of [...entries.keys()]) {
    if (key.startsWith(prefix)) entries.delete(key);
  }
}
