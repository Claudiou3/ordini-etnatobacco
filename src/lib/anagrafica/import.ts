import type { SupabaseClient } from "@supabase/supabase-js";
import type { Workbook } from "xlsx-populate";

/**
 * Importazione INCREMENTALE dell'anagrafica clienti:
 * - cliente con stessa P.IVA o stesso codice fiscale gia' presente -> AGGIORNATO
 *   (l'id NON cambia, quindi gli ordini gia' emessi restano collegati);
 * - cliente nuovo -> INSERITO;
 * - nessuna cancellazione.
 */

export type AnagraficaRecord = {
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

function normalize(value: unknown): string {
  if (value === null || value === undefined) return "";
  return String(value).replace(/\u00a0/g, " ").trim();
}

function cleanKey(value: unknown): string {
  return normalize(value).toUpperCase().replace(/[^A-Z0-9]/g, "");
}

/** Legge le righe anagrafica dal foglio Excel (primo foglio, header in riga 1). */
export function parseAnagraficaFromWorkbook(workbook: Workbook): AnagraficaRecord[] {
  const sheet = workbook.sheet(0);
  const rows = sheet.usedRange().value();
  if (!rows || rows.length < 2) return [];

  const header = rows[0].map((h) => normalize(h).toUpperCase());
  const idx = (name: string) => header.indexOf(name);
  const col = {
    ragione_sociale: idx("RAGIONE SOCIALE"),
    indirizzo: idx("INDIRIZZO"),
    cap: idx("CAP"),
    citta: idx("CITTÀ"),
    provincia: idx("PROVINCIA"),
    partita_iva: idx("P.IVA"),
    codice_fiscale: idx("CODICE FISCALE"),
    sdi: idx("SDI"),
    cellulare: idx("CELLULARE"),
    email: idx("EMAIL"),
  };

  const get = (r: unknown[], c: number) => (c === -1 ? "" : normalize(r[c]));

  return rows
    .slice(1)
    .map((r) => ({
      ragione_sociale: get(r, col.ragione_sociale),
      indirizzo: get(r, col.indirizzo),
      cap: get(r, col.cap),
      citta: get(r, col.citta),
      provincia: get(r, col.provincia),
      partita_iva: get(r, col.partita_iva),
      codice_fiscale: get(r, col.codice_fiscale),
      sdi: get(r, col.sdi),
      cellulare: get(r, col.cellulare),
      email: get(r, col.email),
    }))
    .filter((r) => r.ragione_sociale && (r.partita_iva || r.codice_fiscale));
}

function toDbRow(rec: AnagraficaRecord) {
  return {
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
  };
}

const BATCH = 200;

export type ImportResult = { inserted: number; updated: number; skipped: number };

export async function importAnagrafica(
  client: SupabaseClient,
  records: AnagraficaRecord[]
): Promise<ImportResult> {
  // Carica i clienti gia' presenti.
  const existingByP = new Map<string, { id: string }>();
  const existingByF = new Map<string, { id: string }>();
  {
    let from = 0;
    for (;;) {
      const { data, error } = await client
        .from("customers")
        .select("id, partita_iva, codice_fiscale")
        .range(from, from + 999);
      if (error) throw new Error("Lettura clienti esistenti: " + error.message);
      if (!data || data.length === 0) break;
      for (const c of data) {
        const p = cleanKey(c.partita_iva);
        const f = cleanKey(c.codice_fiscale);
        if (p) existingByP.set(p, c);
        if (f) existingByF.set(f, c);
      }
      from += data.length;
      if (data.length < 1000) break;
    }
  }

  // Separa insert da update, scartando duplicati/conflitti incrociati.
  const seenP = new Set<string>();
  const seenF = new Set<string>();
  const toInsert: ReturnType<typeof toDbRow>[] = [];
  const toUpdate: { id: string; data: ReturnType<typeof toDbRow> }[] = [];
  let skipped = 0;

  for (const rec of records) {
    const p = cleanKey(rec.partita_iva);
    const f = cleanKey(rec.codice_fiscale);
    if (!p && !f) {
      skipped++;
      continue;
    }
    if ((p && seenP.has(p)) || (f && seenF.has(f))) {
      skipped++;
      continue;
    }
    if (p) seenP.add(p);
    if (f) seenF.add(f);

    const matchP = p ? existingByP.get(p) : null;
    const matchF = f ? existingByF.get(f) : null;
    if (matchP && matchF && matchP.id !== matchF.id) {
      skipped++;
      continue;
    }
    const row = toDbRow(rec);
    const existingRow = matchP || matchF;
    if (existingRow) toUpdate.push({ id: existingRow.id, data: row });
    else toInsert.push(row);
  }

  let inserted = 0;
  for (let i = 0; i < toInsert.length; i += BATCH) {
    const chunk = toInsert.slice(i, i + BATCH);
    const { error } = await client.from("customers").insert(chunk);
    if (!error) {
      inserted += chunk.length;
      continue;
    }
    if (error.code !== "23505") throw new Error("Inserimento: " + error.message);
    for (const rec of chunk) {
      const { error: e2 } = await client.from("customers").insert(rec);
      if (!e2) inserted++;
      else if (e2.code !== "23505") throw new Error("Inserimento: " + e2.message);
    }
  }

  let updated = 0;
  for (let i = 0; i < toUpdate.length; i += BATCH) {
    const chunk = toUpdate.slice(i, i + BATCH);
    const { error } = await client
      .from("customers")
      .upsert(chunk.map((u) => ({ id: u.id, ...u.data })), { onConflict: "id" });
    if (!error) {
      updated += chunk.length;
      continue;
    }
    if (error.code !== "23505") throw new Error("Aggiornamento: " + error.message);
    for (const u of chunk) {
      const { error: e2 } = await client
        .from("customers")
        .upsert({ id: u.id, ...u.data }, { onConflict: "id" });
      if (!e2) updated++;
      else if (e2.code !== "23505") throw new Error("Aggiornamento: " + e2.message);
    }
  }

  return { inserted, updated, skipped };
}
