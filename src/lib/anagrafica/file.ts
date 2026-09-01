import { promises as fs } from "node:fs";
import path from "node:path";
import { existsSync } from "node:fs";
import XLSXPopulate from "xlsx-populate";
import type { AnagraficaRecord } from "./import";
import { appDataDir, appRootPath } from "@/lib/data-dir";

/**
 * Anagrafica clienti su file Excel (data/anagrafica_clienti.xlsx).
 *
 * Il file `anagrafica_clienti.xlsx` presente nel progetto e' la fonte dati
 * usata dalla ricerca clienti del modulo ordine. Viene mantenuta una COPIA
 * DI LAVORO in `data/` (il file originale in root resta intatto): le
 * modifiche fatte dagli agenti (dati mancanti compilati a mano, nuovi
 * clienti) vengono salvate in questa copia, in modo da restare sul server.
 */

const DATA_DIR = appDataDir();
const WORKING_FILE = path.join(DATA_DIR, "anagrafica_clienti.xlsx");
const ROOT_FILE = appRootPath("anagrafica_clienti.xlsx");

export type AnagraficaMatch = AnagraficaRecord & {
  /** id stabile: anag-<PIVA o CF normalizzata> */
  id: string;
  /** riga 1-based della copia di lavoro */
  row: number;
};

function normalize(value: unknown): string {
  if (value === null || value === undefined) return "";
  return String(value).replace(/\u00a0/g, " ").trim();
}

export function cleanKey(value: unknown): string {
  return normalize(value).toUpperCase().replace(/[^A-Z0-9]/g, "");
}

async function ensureFile(): Promise<string | null> {
  if (existsSync(WORKING_FILE)) return WORKING_FILE;
  if (existsSync(ROOT_FILE)) {
    await fs.mkdir(DATA_DIR, { recursive: true });
    await fs.copyFile(ROOT_FILE, WORKING_FILE);
    return WORKING_FILE;
  }
  // Nessun file Excel (es. in produzione su Vercel): la ricerca clienti
  // userà SOLO Supabase, dove l'anagrafica è già importata.
  return null;
}

type Parsed = { startRow: number; headers: string[]; rows: unknown[][] };

async function parse(): Promise<Parsed> {
  const file = await ensureFile();
  if (!file) throw new Error("File anagrafica_clienti.xlsx non trovato.");
  const wb = await XLSXPopulate.fromFileAsync(file);
  const sheet = wb.sheet(0);
  const range = sheet.usedRange();
  const rows = range.value() as unknown[][];
  const headers = (rows[0] ?? []).map((h) => normalize(h).toUpperCase());
  return { startRow: range.startCell().rowNumber(), headers, rows };
}

function colIdx(headers: string[], name: string): number {
  return headers.indexOf(name);
}

function recordFromRow(row: unknown[], headers: string[], rowNumber: number): AnagraficaMatch {
  const C = {
    ragione_sociale: colIdx(headers, "RAGIONE SOCIALE"),
    indirizzo: colIdx(headers, "INDIRIZZO"),
    cap: colIdx(headers, "CAP"),
    citta: colIdx(headers, "CITTÀ"),
    provincia: colIdx(headers, "PROVINCIA"),
    partita_iva: colIdx(headers, "P.IVA"),
    codice_fiscale: colIdx(headers, "CODICE FISCALE"),
    sdi: colIdx(headers, "SDI"),
    cellulare: colIdx(headers, "CELLULARE"),
    email: colIdx(headers, "EMAIL"),
  };
  const get = (i: number) => (i === -1 ? "" : normalize(row[i]));
  const piva = get(C.partita_iva);
  const cf = get(C.codice_fiscale);
  const key = cleanKey(piva) || cleanKey(cf) || `r${rowNumber}`;
  return {
    id: `anag-${key}`,
    row: rowNumber,
    ragione_sociale: get(C.ragione_sociale),
    indirizzo: get(C.indirizzo),
    cap: get(C.cap),
    citta: get(C.citta),
    provincia: get(C.provincia),
    partita_iva: piva,
    codice_fiscale: cf,
    sdi: get(C.sdi),
    cellulare: get(C.cellulare),
    email: get(C.email),
  };
}

// Cache: evita di rileggere 12k righe a ogni digitazione.
let cache: { mtimeMs: number; records: AnagraficaMatch[] } | null = null;

async function readRecords(): Promise<AnagraficaMatch[]> {
  const file = await ensureFile();
  if (!file) return []; // nessun file Excel: l'anagrafica si legge da Supabase
  const stat = await fs.stat(file);
  if (cache && cache.mtimeMs === stat.mtimeMs) return cache.records;

  const { startRow, headers, rows } = await parse();
  const records: AnagraficaMatch[] = [];
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i] ?? [];
    const rec = recordFromRow(row, headers, startRow + i);
    if (rec.ragione_sociale && (rec.partita_iva || rec.codice_fiscale)) {
      records.push(rec);
    }
  }
  cache = { mtimeMs: stat.mtimeMs, records };
  return records;
}

function invalidateCache(): void {
  cache = null;
}

/** Tutta l'anagrafica (primi `limit` ordinati per ragione sociale). */
export async function listAnagraficaExcel(limit = 50): Promise<AnagraficaMatch[]> {
  const all = await readRecords();
  return [...all]
    .sort((a, b) => a.ragione_sociale.localeCompare(b.ragione_sociale))
    .slice(0, limit);
}

/** Conteggio righe anagrafica. */
export async function countAnagraficaExcel(): Promise<number> {
  return (await readRecords()).length;
}

/**
 * Ricerca per codice fiscale, partita IVA o ragione sociale.
 * I risultati con P.IVA/CF esatta vengono prima degli altri.
 */
export async function searchAnagraficaExcel(
  query: string,
  limit = 50
): Promise<AnagraficaMatch[]> {
  const q = query.trim();
  if (!q) return listAnagraficaExcel(limit);

  const qKey = cleanKey(q);
  const qLower = q.toLowerCase();
  const all = await readRecords();

  const scored = all
    .map((rec) => {
      const pKey = cleanKey(rec.partita_iva);
      const fKey = cleanKey(rec.codice_fiscale);
      let score = -1;
      if (qKey) {
        if (pKey === qKey || fKey === qKey) score = 0;
        else if (pKey.includes(qKey) || fKey.includes(qKey)) score = 1;
      }
      if (score === -1 && rec.ragione_sociale.toLowerCase().includes(qLower)) {
        score = 2;
      }
      if (score === -1 && rec.citta.toLowerCase().includes(qLower)) {
        score = 3;
      }
      return { rec, score };
    })
    .filter((x) => x.score >= 0)
    .sort((a, b) =>
      a.score !== b.score
        ? a.score - b.score
        : a.rec.ragione_sociale.localeCompare(b.rec.ragione_sociale)
    );

  return scored.slice(0, limit).map((x) => x.rec);
}

/** Match esatto per P.IVA oppure codice fiscale. */
export async function findAnagraficaByKey(
  partitaIva?: string,
  codiceFiscale?: string
): Promise<AnagraficaMatch | null> {
  const pKey = cleanKey(partitaIva);
  const fKey = cleanKey(codiceFiscale);
  if (!pKey && !fKey) return null;
  const all = await readRecords();
  return (
    all.find((rec) => {
      const p = cleanKey(rec.partita_iva);
      const f = cleanKey(rec.codice_fiscale);
      return (pKey && p === pKey) || (fKey && f === fKey);
    }) ?? null
  );
}

export type UpsertResult = { error?: string; id?: string; created?: boolean };

/**
 * Aggiorna (se esiste per P.IVA/CF) o aggiunge (se nuovo) una riga
 * anagrafica nella copia di lavoro data/anagrafica_clienti.xlsx.
 * I campi vuoti NON sovrascrivono i valori gia' presenti.
 */
export async function upsertAnagraficaExcel(
  record: AnagraficaRecord
): Promise<UpsertResult> {
  const file = await ensureFile();
  if (!file) {
    // Nessun file Excel (produzione su Vercel): i clienti vivono in Supabase,
    // non c'è un file locale da aggiornare.
    return { created: false };
  }
  const wb = await XLSXPopulate.fromFileAsync(file);
  const sheet = wb.sheet(0);
  const range = sheet.usedRange();
  const rows = range.value() as unknown[][];
  const headers = (rows[0] ?? []).map((h) => normalize(h).toUpperCase());
  const startRow = range.startCell().rowNumber();

  const C = {
    ragione_sociale: colIdx(headers, "RAGIONE SOCIALE"),
    indirizzo: colIdx(headers, "INDIRIZZO"),
    cap: colIdx(headers, "CAP"),
    citta: colIdx(headers, "CITTÀ"),
    provincia: colIdx(headers, "PROVINCIA"),
    partita_iva: colIdx(headers, "P.IVA"),
    codice_fiscale: colIdx(headers, "CODICE FISCALE"),
    sdi: colIdx(headers, "SDI"),
    cellulare: colIdx(headers, "CELLULARE"),
    email: colIdx(headers, "EMAIL"),
  };

  const pKey = cleanKey(record.partita_iva);
  const fKey = cleanKey(record.codice_fiscale);

  let targetRow = 0;
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i] ?? [];
    const p = C.partita_iva >= 0 ? cleanKey(row[C.partita_iva]) : "";
    const f = C.codice_fiscale >= 0 ? cleanKey(row[C.codice_fiscale]) : "";
    if ((pKey && p === pKey) || (fKey && f === fKey)) {
      targetRow = startRow + i;
      break;
    }
  }

  const created = targetRow === 0;
  if (created) {
    targetRow = range.endCell().rowNumber() + 1;
  }

  const writes: Record<string, string> = {
    ragione_sociale: record.ragione_sociale,
    indirizzo: record.indirizzo,
    cap: record.cap,
    citta: record.citta,
    provincia: record.provincia,
    partita_iva: record.partita_iva,
    codice_fiscale: record.codice_fiscale,
    sdi: record.sdi,
    cellulare: record.cellulare,
    email: record.email,
  };

  for (const [field, value] of Object.entries(writes)) {
    const ci = C[field as keyof typeof C];
    if (ci === -1) continue;
    if (created || value) {
      sheet.cell(targetRow, ci + 1).value(value);
    }
  }

  try {
    await wb.toFileAsync(file);
  } catch {
    return {
      error:
        "Impossibile aggiornare il file anagrafica (file system non scrivibile).",
    };
  }

  invalidateCache();

  const key = cleanKey(record.partita_iva) || cleanKey(record.codice_fiscale);
  return {
    id: `anag-${key || `r${targetRow}`}`,
    created,
  };
}


export type MergeAnagraficaResult = {
  inserted: number;
  updated: number;
  skipped: number;
  error?: string;
};

/**
 * Merge BATCH (import da file Excel caricato) sulla copia di lavoro
 * data/anagrafica_clienti.xlsx. Regole:
 *  - cliente gia' presente (stessa P.IVA OPPURE stesso codice fiscale) ->
 *    AGGIORNATO riscrivendo i dati del file, inclusi CF/P.IVA aggiornati
 *    (es. cambio di gestione padre->figlio: basta che uno dei due codici
 *    coincida per riconoscerlo). Gli ordini gia' emessi conservano lo
 *    snapshot di CF/P.IVA al momento dell'ordine;
 *  - cliente nuovo -> INSERITO (append in fondo al foglio);
 *  - NESSUN cliente viene mai eliminato.
 */
export async function mergeAnagraficaExcel(
  records: AnagraficaRecord[]
): Promise<MergeAnagraficaResult> {
  if (records.length === 0) return { inserted: 0, updated: 0, skipped: 0 };

  const file = await ensureFile();
  if (!file) {
    // Nessun file Excel (produzione su Vercel): l'anagrafica viene importata
    // direttamente in Supabase dal chiamante; qui non c'e' nulla da fare.
    return { inserted: 0, updated: 0, skipped: 0 };
  }
  const wb = await XLSXPopulate.fromFileAsync(file);
  const sheet = wb.sheet(0);
  const range = sheet.usedRange();
  const rows = range.value() as unknown[][];
  const headers = (rows[0] ?? []).map((h) => normalize(h).toUpperCase());
  const startRow = range.startCell().rowNumber();
  const endRow = range.endCell().rowNumber();

  const C = {
    ragione_sociale: colIdx(headers, "RAGIONE SOCIALE"),
    indirizzo: colIdx(headers, "INDIRIZZO"),
    cap: colIdx(headers, "CAP"),
    citta: colIdx(headers, "CITTÀ"),
    provincia: colIdx(headers, "PROVINCIA"),
    partita_iva: colIdx(headers, "P.IVA"),
    codice_fiscale: colIdx(headers, "CODICE FISCALE"),
    sdi: colIdx(headers, "SDI"),
    cellulare: colIdx(headers, "CELLULARE"),
    email: colIdx(headers, "EMAIL"),
  };

  // Indici riga per P.IVA e CF (per riconoscere le anagrafiche gia' presenti)
  const byP = new Map<string, number>();
  const byF = new Map<string, number>();
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i] ?? [];
    const p = C.partita_iva >= 0 ? cleanKey(row[C.partita_iva]) : "";
    const f = C.codice_fiscale >= 0 ? cleanKey(row[C.codice_fiscale]) : "";
    if (p && !byP.has(p)) byP.set(p, startRow + i);
    if (f && !byF.has(f)) byF.set(f, startRow + i);
  }

  let nextRow = endRow + 1;

  const writeRecord = (targetRow: number, rec: AnagraficaRecord, isNew: boolean) => {
    const writes: Record<string, string> = {
      ragione_sociale: rec.ragione_sociale,
      indirizzo: rec.indirizzo,
      cap: rec.cap,
      citta: rec.citta,
      provincia: rec.provincia,
      partita_iva: rec.partita_iva,
      codice_fiscale: rec.codice_fiscale,
      sdi: rec.sdi,
      cellulare: rec.cellulare,
      email: rec.email,
    };
    for (const [field, value] of Object.entries(writes)) {
      const ci = C[field as keyof typeof C];
      if (ci === -1) continue;
      // Sui clienti gia' esistenti non si cancellano i campi lasciati vuoti
      // nel file: si scrivono solo i valori forniti.
      if (isNew || value) sheet.cell(targetRow, ci + 1).value(value);
    }
  };

  let inserted = 0;
  let updated = 0;
  let skipped = 0;

  for (const rec of records) {
    const p = cleanKey(rec.partita_iva);
    const f = cleanKey(rec.codice_fiscale);
    if (!p && !f) {
      skipped++;
      continue;
    }

    const rowP = p ? byP.get(p) : undefined;
    const rowF = f ? byF.get(f) : undefined;

    // Stesso record che punta a DUE anagrafiche diverse: conflitto, si scarta
    // (evita di corrompere l'anagrafica).
    if (rowP && rowF && rowP !== rowF) {
      skipped++;
      continue;
    }

    const targetRow = rowP || rowF;
    if (targetRow) {
      writeRecord(targetRow, rec, false);
      if (p) byP.set(p, targetRow);
      if (f) byF.set(f, targetRow);
      updated++;
    } else {
      writeRecord(nextRow, rec, true);
      if (p) byP.set(p, nextRow);
      if (f) byF.set(f, nextRow);
      nextRow++;
      inserted++;
    }
  }

  try {
    await wb.toFileAsync(file);
  } catch {
    return {
      inserted: 0,
      updated: 0,
      skipped: records.length,
      error:
        "Impossibile aggiornare il file anagrafica (file system non scrivibile).",
    };
  }

  invalidateCache();
  return { inserted, updated, skipped };
}

