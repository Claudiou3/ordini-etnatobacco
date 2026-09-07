import { getDataClient } from "@/lib/supabase/data";
import { isSupabaseConfigured } from "@/lib/settings/runtime";
import {
  searchAnagraficaExcel,
  listAnagraficaExcel,
  countAnagraficaExcel,
  type AnagraficaMatch,
} from "@/lib/anagrafica/file";
import {
  demoSearchCustomers,
  demoCountCustomers,
} from "@/lib/demo/store";
import type { Customer } from "@/lib/types";

/**
 * Ricerca clienti.
 * La fonte primaria e' il file anagrafica_clienti.xlsx del progetto
 * (come richiesto dal modulo ordine); i risultati vengono uniti con il
 * database Supabase (o con lo store demo) senza duplicati.
 */

function toCustomer(rec: AnagraficaMatch): Customer {
  const now = new Date().toISOString();
  return {
    id: rec.id,
    ragione_sociale: rec.ragione_sociale,
    indirizzo: rec.indirizzo || null,
    cap: rec.cap || null,
    citta: rec.citta || null,
    provincia: rec.provincia || null,
    partita_iva: rec.partita_iva || null,
    codice_fiscale: rec.codice_fiscale || null,
    sdi: rec.sdi || null,
    cellulare: rec.cellulare || null,
    email: rec.email || null,
    updated_at: now,
    updated_by: null,
    created_at: now,
  };
}

/** Rimuove i duplicati (per id o per P.IVA/CF normalizzata). */
function mergeByKey(customers: Customer[]): Customer[] {
  const seen = new Set<string>();
  const out: Customer[] = [];
  for (const c of customers) {
    const piva = (c.partita_iva ?? "").replace(/[^A-Z0-9]/gi, "").toUpperCase();
    const cf = (c.codice_fiscale ?? "").replace(/[^A-Z0-9]/gi, "").toUpperCase();
    const key = piva || cf || c.id;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(c);
  }
  return out;
}

async function searchSupabase(
  query: string,
  limit: number
): Promise<Customer[]> {
  const supabase = await getDataClient();
  if (!supabase) return [];

  const q = query.trim().replace(/[%,()]/g, " ");
  if (!q) {
    const { data, error } = await supabase
      .from("customers")
      .select("*")
      .order("ragione_sociale", { ascending: true })
      .limit(limit);
    return error ? [] : (data ?? []);
  }

  // Buffer più ampio del limite richiesto: servono candidati a sufficienza
  // per la deduplica finale senza perdere risultati utili.
  const buffer = Math.min(100, limit + 40);

  // 1) PRIMA i clienti il cui NOME/P.IVA/CF contiene la parola cercata
  //    (così "Messina" trova le aziende che hanno "Messina" nel nome).
  const { data: names, error: namesError } = await supabase
    .from("customers")
    .select("*")
    .or(
      `ragione_sociale.ilike.%${q}%,partita_iva.ilike.%${q}%,codice_fiscale.ilike.%${q}%`
    )
    .order("ragione_sociale", { ascending: true })
    .limit(buffer);

  const primary = namesError ? [] : (names ?? []);
  const primaryCount = primary.length;

  // 2) SOLO se servono ancora risultati, completa con i clienti la cui
  //    CITTÀ contiene la parola (non devono "rubare" i posti ai nomi).
  let cityFill: Customer[] = [];
  if (primaryCount < limit) {
    const { data: cities } = await supabase
      .from("customers")
      .select("*")
      .ilike("citta", `%${q}%`)
      .order("ragione_sociale", { ascending: true })
      .limit(limit - primaryCount);
    cityFill = cities ?? [];
  }

  return mergeByKey([...primary, ...cityFill]).slice(0, limit);
}

export async function listCustomers(limit = 50): Promise<Customer[]> {
  // In produzione (Supabase configurato) la fonte è il database: coerente e
  // veloce. Il file Excel viene usato solo in assenza di Supabase (demo/LAN).
  if (await isSupabaseConfigured()) {
    return searchSupabase("", limit);
  }
  const excel = (await listAnagraficaExcel(limit)).map(toCustomer);
  const extra = demoSearchCustomers("", limit);
  return mergeByKey([...excel, ...extra]).slice(0, limit);
}

/**
 * Ricerca condivisa per ragione sociale, P.IVA, codice fiscale o città.
 * Priorità: prima i risultati per nome/codici, poi a riempimento la città.
 * Il cliente si può trovare anche digitando solo una parte di P.IVA/CF.
 */
export async function searchCustomers(
  query: string,
  limit = 50
): Promise<Customer[]> {
  if (await isSupabaseConfigured()) {
    return searchSupabase(query, limit);
  }
  const excel = (await searchAnagraficaExcel(query, limit)).map(toCustomer);
  const extra = demoSearchCustomers(query, limit);
  return mergeByKey([...excel, ...extra]).slice(0, limit);
}

export async function countCustomers(): Promise<number> {
  if (await isSupabaseConfigured()) {
    const supabase = await getDataClient();
    if (supabase) {
      const { count, error } = await supabase
        .from("customers")
        .select("id", { count: "exact", head: true });
      if (!error && count !== null) return count;
    }
  }
  const excelCount = await countAnagraficaExcel().catch(() => 0);
  return Math.max(excelCount, demoCountCustomers());
}

