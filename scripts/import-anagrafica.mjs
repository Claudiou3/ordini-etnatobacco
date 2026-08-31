#!/usr/bin/env node
/**
 * Importazione iniziale di anagrafica_clienti.xlsx nel database Supabase.
 *
 * Usa la connessione PostgreSQL da data/db.txt (o db.txt nella root):
 *   postgresql://... (una o più stringhe di connessione)
 *   password database
 *   <password>
 *
 * Di default legge data/anagrafica_clienti.xlsx.
 * MAI stampa la password in output.
 *
 * Uso:
 *   node --env-file-if-exists=.env.local scripts/import-anagrafica.mjs [--file=<path>] [--dry-run]
 */

import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import pg from "pg";
import XLSXPopulate from "xlsx-populate";

const { Client } = pg;

const DEFAULT_FILE = path.join(process.cwd(), "data", "anagrafica_clienti.xlsx");
const DB_FILE_CANDIDATES = [
  path.join(process.cwd(), "data", "db.txt"),
  path.join(process.cwd(), "db.txt"),
];

const args = { file: null, dryRun: false };
for (const arg of process.argv.slice(2)) {
  if (arg === "--help") {
    console.log(
      "Uso: node --env-file-if-exists=.env.local scripts/import-anagrafica.mjs [--file=<path>] [--dry-run]"
    );
    process.exit(0);
  }
  if (arg.startsWith("--file=")) args.file = arg.slice("--file=".length);
  if (arg === "--dry-run") args.dryRun = true;
}
if (!args.file) args.file = existsSync(DEFAULT_FILE) ? DEFAULT_FILE : null;

const BATCH = 200;

function normalize(value) {
  if (value === null || value === undefined) return "";
  return String(value).replace(/\u00a0/g, " ").trim();
}

function cleanKey(value) {
  return normalize(value).toUpperCase().replace(/[^A-Z0-9]/g, "");
}

/** Legge la password dalle righe del file db.txt. */
function readPassword(lines) {
  for (let i = 0; i < lines.length; i++) {
    if (/password/i.test(lines[i])) {
      for (let j = i + 1; j < lines.length; j++) {
        if (lines[j]) return lines[j];
      }
    }
  }
  return null;
}

/** Costruisce le configurazioni di connessione dalle stringhe postgresql://. */
function buildConfigs(lines, password) {
  const configs = [];
  for (const uriLine of lines.filter((l) => /^postgresql:\/\//i.test(l))) {
    try {
      const u = new URL(uriLine);
      const uriPass = u.password ? decodeURIComponent(u.password) : "";
      const isPlaceholder =
        /\[.*PASSWORD.*\]/i.test(u.password) || /^\[.*\]$/.test(u.password);
      configs.push({
        host: u.hostname,
        port: Number(u.port || 5432),
        user: decodeURIComponent(u.username || "postgres"),
        database: (u.pathname || "/postgres").replace(/^\//, ""),
        password: password || (isPlaceholder ? "" : uriPass),
        label: uriLine.includes("pooler")
          ? "session/transaction pooler"
          : "stringa di connessione",
      });
    } catch {
      // stringa non valida: ignora
    }
  }
  return configs;
}

async function connect(lines, password) {
  const configs = buildConfigs(lines, password);
  for (const cfg of configs) {
    const client = new Client({
      host: cfg.host,
      port: cfg.port,
      user: cfg.user,
      database: cfg.database || "postgres",
      password: cfg.password,
      ssl: { rejectUnauthorized: false },
      connectionTimeoutMillis: 20000,
    });
    try {
      await client.connect();
      console.log(`Connesso al database via ${cfg.label}.`);
      return client;
    } catch (err) {
      console.error(
        `Connessione ${cfg.label} fallita (${cfg.user}@${cfg.host}:${cfg.port}):`,
        err.message
      );
      try {
        await client.end();
      } catch {
        // ignora
      }
    }
  }
  return null;
}

async function main() {
  if (!args.file) {
    console.error(
      'ERRORE: file Excel non trovato. Specifica il percorso con --file="<percorso>/anagrafica_clienti.xlsx"'
    );
    process.exit(1);
  }
  if (!existsSync(args.file)) {
    console.error(`ERRORE: file non trovato: ${args.file}`);
    process.exit(1);
  }

  const dbFile = DB_FILE_CANDIDATES.find((f) => existsSync(f));
  if (!dbFile) {
    console.error(
      "ERRORE: db.txt non trovato (cerca data/db.txt o db.txt) con la stringa di connessione."
    );
    process.exit(1);
  }
  const lines = readFileSync(dbFile, "utf8").split(/\r?\n/).map((l) => l.trim());
  const password = readPassword(lines);
  const client = await connect(lines, password);
  if (!client) {
    console.error("Impossibile connettersi al database.");
    process.exit(1);
  }

  const workbook = await XLSXPopulate.fromFileAsync(args.file);
  const sheet = workbook.sheet(0);
  const rows = sheet.usedRange().value();

  if (!rows || rows.length < 2) {
    console.error("ERRORE: il foglio non contiene dati.");
    await client.end();
    process.exit(1);
  }

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

  const records = rows
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

  console.log(`Righe valide lette: ${records.length}`);

  // Carica i clienti gia' presenti (per decidere insert/update).
  const existingByP = new Map();
  const existingByF = new Map();
  {
    const { rows: existingRows } = await client.query(
      "SELECT id, partita_iva, codice_fiscale FROM public.customers"
    );
    for (const c of existingRows) {
      const p = cleanKey(c.partita_iva);
      const f = cleanKey(c.codice_fiscale);
      if (p) existingByP.set(p, c);
      if (f) existingByF.set(f, c);
    }
  }
  console.log(`Clienti gia' presenti nel database: ${existingByP.size}`);

  // Separa insert da update, ignorando duplicati interni all'Excel
  // e conflitti incrociati (stesso codice fiscale su aziende diverse).
  const seenP = new Set();
  const seenF = new Set();
  const toInsert = [];
  const toUpdate = [];
  let skippedDup = 0;
  let skippedCross = 0;
  for (const rec of records) {
    const p = cleanKey(rec.partita_iva);
    const f = cleanKey(rec.codice_fiscale);
    if (!p && !f) continue;
    if ((p && seenP.has(p)) || (f && seenF.has(f))) {
      skippedDup++;
      continue;
    }
    if (p) seenP.add(p);
    if (f) seenF.add(f);

    const matchP = p ? existingByP.get(p) : null;
    const matchF = f ? existingByF.get(f) : null;
    if (matchP && matchF && matchP.id !== matchF.id) {
      skippedCross++;
      continue;
    }
    const existingRow = matchP || matchF;
    if (existingRow) toUpdate.push({ id: existingRow.id, ...rec });
    else toInsert.push(rec);
  }

  console.log(`Da inserire: ${toInsert.length}`);
  console.log(`Da aggiornare: ${toUpdate.length}`);
  console.log(`Scartati (duplicati/conflitti anagrafica): ${skippedDup + skippedCross}`);

  if (args.dryRun) {
    console.log("DRY RUN: nessuna scrittura eseguita.");
    await client.end();
    process.exit(0);
  }

  const COLUMNS = [
    "ragione_sociale",
    "indirizzo",
    "cap",
    "citta",
    "provincia",
    "partita_iva",
    "codice_fiscale",
    "sdi",
    "cellulare",
    "email",
  ];

  async function insertOne(rec) {
    const values = COLUMNS.map((c) => rec[c] || null);
    const placeholders = COLUMNS.map((_, c) => `$${c + 1}`).join(", ");
    await client.query(
      `INSERT INTO public.customers (${COLUMNS.join(", ")}) VALUES (${placeholders})`,
      values
    );
  }

  async function insertBatch(chunk) {
    const placeholders = chunk
      .map((_, r) => `(${COLUMNS.map((_, c) => `$${r * COLUMNS.length + c + 1}`).join(", ")})`)
      .join(", ");
    const values = chunk.flatMap((r) => COLUMNS.map((c) => r[c] || null));
    await client.query(
      `INSERT INTO public.customers (${COLUMNS.join(", ")}) VALUES ${placeholders}`,
      values
    );
  }

  async function updateOne(rec) {
    const values = COLUMNS.map((c) => rec[c] || null);
    await client.query(
      `UPDATE public.customers SET ${COLUMNS.map((c, cIdx) => `${c} = $${cIdx + 1}`).join(", ")}
       WHERE id = $${COLUMNS.length + 1}`,
      [...values, rec.id]
    );
  }

  let inserted = 0;
  for (let i = 0; i < toInsert.length; i += BATCH) {
    const chunk = toInsert.slice(i, i + BATCH);
    try {
      await insertBatch(chunk);
      inserted += chunk.length;
    } catch (err) {
      if (err.code !== "23505") throw err;
      for (const rec of chunk) {
        try {
          await insertOne(rec);
          inserted++;
        } catch (err2) {
          if (err2.code === "23505") {
            console.log(`Saltato cliente duplicato: ${rec.ragione_sociale}`);
          } else {
            throw err2;
          }
        }
      }
    }
  }
  console.log(`Inseriti: ${inserted}`);

  let updated = 0;
  for (let i = 0; i < toUpdate.length; i += BATCH) {
    const chunk = toUpdate.slice(i, i + BATCH);
    const values = [];
    const rowsSql = chunk
      .map((rec, r) => {
        const base = r * (COLUMNS.length + 1);
        values.push(rec.id);
        COLUMNS.forEach((c) => values.push(rec[c] || null));
        const colIdx = COLUMNS.map((_, cIdx) => `$${base + 2 + cIdx}`).join(", ");
        return `($${base + 1}::uuid, ${colIdx})`;
      })
      .join(", ");
    try {
      await client.query(
        `UPDATE public.customers AS c SET ${COLUMNS.map((c) => `${c} = v.${c}`).join(", ")}
         FROM (VALUES ${rowsSql}) AS v(id, ${COLUMNS.join(", ")})
         WHERE c.id = v.id`,
        values
      );
      updated += chunk.length;
    } catch (err) {
      if (err.code !== "23505") throw err;
      for (const rec of chunk) {
        try {
          await updateOne(rec);
          updated++;
        } catch (err2) {
          if (err2.code === "23505") {
            console.log(`Saltato aggiornamento in conflitto: ${rec.ragione_sociale}`);
          } else {
            throw err2;
          }
        }
      }
    }
  }
  console.log(`Aggiornati: ${updated}`);

  await client.end();
  console.log("Importazione completata.");
}

main().catch((err) => {
  console.error("Errore imprevisto:", err);
  process.exit(1);
});


