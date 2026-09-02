#!/usr/bin/env node
/**
 * Import dell'anagrafica clienti DIRETTAMENTE su Supabase, senza i limiti
 * di tempo delle funzioni Vercel.
 *
 * Uso:
 *   npm run import:anagrafica:online [-- --file=<percorso.xlsx>] [-- --dry-run]
 *
 * Richiede in .env.local (o nelle variabili d'ambiente):
 *   NEXT_PUBLIC_SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 *
 * Il file letto di default e' data/anagrafica_clienti.xlsx (se assente,
 * anagrafica_clienti.xlsx nella root del progetto).
 *
 * Regole (identiche all'import dall'app):
 *  - cliente gia' presente (stessa P.IVA OPPURE stesso codice fiscale) ->
 *    AGGIORNATO senza cambiare id (gli ordini restano collegati);
 *  - cliente nuovo -> INSERITO;
 *  - nessun cliente viene mai eliminato.
 * L'operazione e' idempotente: puoi rilanciarla quante volte vuoi.
 */

import { existsSync } from "node:fs";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";
import XLSXPopulate from "xlsx-populate";

const CWD = process.cwd();
const DEFAULT_FILE = path.join(CWD, "data", "anagrafica_clienti.xlsx");
const ROOT_FILE = path.join(CWD, "anagrafica_clienti.xlsx");
const BATCH = 500;
const CONCURRENCY = 8;

const args = { file: null, dryRun: false };
for (const arg of process.argv.slice(2)) {
  if (arg === "--help" || arg === "-h") {
    console.log(
      "Uso: npm run import:anagrafica:online [-- --file=<percorso.xlsx>] [-- --dry-run]"
    );
    process.exit(0);
  }
  if (arg.startsWith("--file=")) args.file = arg.slice("--file=".length);
  if (arg === "--dry-run") args.dryRun = true;
}

function normalize(value) {
  if (value === null || value === undefined) return "";
  return String(value).replace(/\u00a0/g, " ").trim();
}

function cleanKey(value) {
  return normalize(value).toUpperCase().replace(/[^A-Z0-9]/g, "");
}

function pickFile() {
  if (args.file) return args.file;
  if (existsSync(DEFAULT_FILE)) return DEFAULT_FILE;
  if (existsSync(ROOT_FILE)) return ROOT_FILE;
  return null;
}

function parseRecords(wb) {
  const sheet = wb.sheet(0);
  const rows = sheet.usedRange().value();
  if (!rows || rows.length < 2) return [];
  const header = rows[0].map((h) => normalize(h).toUpperCase());
  const idx = (name) => header.indexOf(name);
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
  const get = (r, c) => (c === -1 ? "" : normalize(r[c]));
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

function toDbRow(rec) {
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

async function runPool(items, worker) {
  if (items.length === 0) return;
  let next = 0;
  let firstError = null;
  async function loop() {
    while (next < items.length) {
      const i = next++;
      try {
        await worker(items[i], i);
      } catch (err) {
        if (!firstError) firstError = err;
      }
    }
  }
  await Promise.all(
    Array.from({ length: Math.min(CONCURRENCY, items.length) }, () => loop())
  );
  if (firstError) throw firstError;
}

async function loadExisting(client) {
  const byP = new Map();
  const byF = new Map();
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
      if (p) byP.set(p, c);
      if (f) byF.set(f, c);
    }
    from += data.length;
    if (data.length < 1000) break;
  }
  return { byP, byF };
}

function plan(records, byP, byF) {
  const seenP = new Set();
  const seenF = new Set();
  const toInsert = [];
  const toUpdate = [];
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

    const matchP = p ? byP.get(p) : null;
    const matchF = f ? byF.get(f) : null;
    if (matchP && matchF && matchP.id !== matchF.id) {
      skipped++;
      continue;
    }
    const existing = matchP || matchF;
    if (existing) toUpdate.push({ id: existing.id, data: toDbRow(rec) });
    else toInsert.push(toDbRow(rec));
  }
  return { toInsert, toUpdate, skipped };
}

const url = (process.env.NEXT_PUBLIC_SUPABASE_URL || "").trim();
const key = (process.env.SUPABASE_SERVICE_ROLE_KEY || "").trim();
if (!url || !key) {
  console.error(
    "Mancano le variabili d'ambiente. Aggiungile a .env.local (o esportale):\n" +
      "  NEXT_PUBLIC_SUPABASE_URL=https://xxxx.supabase.co\n" +
      "  SUPABASE_SERVICE_ROLE_KEY=eyJ... (service_role, NON anon)\n" +
      "Poi riavvia: npm run import:anagrafica:online"
  );
  process.exit(1);
}

const file = pickFile();
if (!file) {
  console.error(
    "File anagrafica_clienti.xlsx non trovato. Metti il file in data/ (o nella root) oppure usa:\n" +
      "  npm run import:anagrafica:online -- --file=<percorso.xlsx>"
  );
  process.exit(1);
}

console.log("Lettura file Excel:", file);
const wb = await XLSXPopulate.fromFileAsync(file);
const records = parseRecords(wb);
console.log(`Righe valide lette: ${records.length}`);

const client = createClient(url, key, { auth: { persistSession: false } });

console.log("Lettura clienti gia' presenti su Supabase…");
const { byP, byF } = await loadExisting(client);
const { toInsert, toUpdate, skipped } = plan(records, byP, byF);
console.log(
  `Piano: ${toInsert.length} nuovi, ${toUpdate.length} da aggiornare, ${skipped} scartati.`
);

if (args.dryRun) {
  console.log("DRY RUN: nessuna scrittura eseguita.");
  process.exit(0);
}

let inserted = 0;
const insertChunks = [];
for (let i = 0; i < toInsert.length; i += BATCH) {
  insertChunks.push(toInsert.slice(i, i + BATCH));
}
await runPool(insertChunks, async (chunk) => {
  const { error } = await client.from("customers").insert(chunk);
  if (!error) {
    inserted += chunk.length;
    console.log(`Inseriti ${inserted}/${toInsert.length}`);
    return;
  }
  if (error.code !== "23505") throw new Error("Inserimento: " + error.message);
  for (const rec of chunk) {
    const { error: e2 } = await client.from("customers").insert(rec);
    if (!e2) {
      inserted++;
    } else if (e2.code !== "23505") {
      throw new Error("Inserimento: " + e2.message);
    }
  }
  console.log(`Inseriti ${inserted}/${toInsert.length}`);
});

let updated = 0;
const updateChunks = [];
for (let i = 0; i < toUpdate.length; i += BATCH) {
  updateChunks.push(toUpdate.slice(i, i + BATCH));
}
await runPool(updateChunks, async (chunk) => {
  const { error } = await client
    .from("customers")
    .upsert(chunk.map((u) => ({ id: u.id, ...u.data })), { onConflict: "id" });
  if (!error) {
    updated += chunk.length;
    console.log(`Aggiornati ${updated}/${toUpdate.length}`);
    return;
  }
  if (error.code !== "23505") throw new Error("Aggiornamento: " + error.message);
  for (const u of chunk) {
    const { error: e2 } = await client
      .from("customers")
      .upsert({ id: u.id, ...u.data }, { onConflict: "id" });
    if (!e2) {
      updated++;
    } else if (e2.code !== "23505") {
      throw new Error("Aggiornamento: " + e2.message);
    }
  }
  console.log(`Aggiornati ${updated}/${toUpdate.length}`);
});

console.log(
  `\nImportazione completata: ${inserted} inseriti, ${updated} aggiornati, ${skipped} scartati.`
);
console.log("Ora gli agenti potranno cercare i clienti nella sezione Clienti.");
