import { promises as fs } from "node:fs";
import { existsSync } from "node:fs";
import path from "node:path";
import XLSXPopulate, { type Workbook } from "xlsx-populate";
import { appDataPath, appRootPath } from "@/lib/data-dir";
import { getAppSetting, setAppSetting } from "@/lib/supabase/app-settings";
import {
  downloadWorkingTemplate,
  uploadWorkingTemplate,
} from "@/lib/orders/storage";
import { memoized, invalidateMemo } from "@/lib/server-cache";

/**
 * Gestione del catalogo contenuto in ordine_template.xlsx.
 * - Lettura articoli con sconto corrente (sconto come frazione: 0.6 = 60%).
 * - Modifica sconti (singoli o massivi) salvando su data/ordine_template.xlsx
 *   (il file originale nella root resta intatto).
 * Colonne (1-based): SCONTO=13, NETTO IVA ESCL=14, NETTO IVA INCL=15.
 *
 * CACHE (per il carico simultaneo): prima di questo modulo OGNI richiesta
 * scaricava e riparsava l'intero file Excel (decine di migliaia di celle) e
 * rileggeva gli override step4. Con TTL + single-flight 100 agenti nello
 * stesso istante eseguono il parsing UNA volta sola; ogni salvataggio
 * dell'amministratore (sconti/prezzi/step4) invalida subito la cache.
 */

const CATALOG_ITEMS_CACHE_KEY = "catalog-items";
const CATALOG_STEP4_CACHE_KEY = "catalog-step4";
const CATALOG_CACHE_TTL_MS = 20_000;

/** Invalida la cache degli articoli catalogo e degli override step4. */
export function invalidateCatalogCache(): void {
  invalidateMemo(CATALOG_ITEMS_CACHE_KEY);
  invalidateMemo(CATALOG_STEP4_CACHE_KEY);
}

export type CatalogItem = {
  row: number; // riga 1-based nel foglio Excel
  brand: string;
  tipologia: string;
  modello: string;
  codice: string;
  descrizione: string;
  diottria: string;
  pezzi: number; // PEZZI CONTENUTI
  prezzo: number;
  iva: number; // percentuale (es. 4)
  sconto: number; // frazione (0.6 = 60% di sconto)
  nettoEscl: number;
  step4: boolean; // quantita' a multipli di 4 (decisione dell'amministratore)
};

const WORKING_FILE = appDataPath("ordine_template.xlsx");
const ROOT_TEMPLATE = appRootPath("ordine_template.xlsx");

/**
 * Override dell'amministratore sul "multiplo di 4", AGGANCIATI AL CODICE
 * ARTICOLO (non più alla riga): inserire/eliminare/spostare righe nel template
 * non li sfalsa più. I vecchi override salvati per riga vengono convertiti
 * automaticamente UNA volta al primo avvio (vedi ensureStep4Codes).
 */
const STEP4_CODES_FILE = appDataPath("catalog-step4-codes.json");
const STEP4_CODES_SETTING_KEY = "catalog_step4_codes";
// Chiave/file LEGACY (per riga): servono solo alla migrazione una-tantum.
const STEP4_LEGACY_FILE = appDataPath("catalog-step4.json");
const STEP4_LEGACY_SETTING_KEY = "catalog_step4";

/** Override "multiplo di 4": codice articolo -> enabled. */
type Step4Overrides = Record<string, boolean>;

/** Legge gli override LEGACY (chiave = numero di riga). Solo per la migrazione. */
async function loadLegacyRowOverrides(): Promise<Record<number, boolean>> {
  const remote = await getAppSetting<Record<number, boolean>>(
    STEP4_LEGACY_SETTING_KEY,
    { fresh: true }
  );
  if (remote && typeof remote === "object") return { ...remote };
  try {
    return JSON.parse(
      await fs.readFile(STEP4_LEGACY_FILE, "utf8")
    ) as Record<number, boolean>;
  } catch {
    return {};
  }
}

/**
 * Legge gli override per CODICE: Supabase (online), altrimenti file locale.
 * Ritorna null se non esistono ancora (primo avvio dopo l'aggiornamento).
 */
async function loadStep4Codes(): Promise<Step4Overrides | null> {
  const remote = await getAppSetting<Step4Overrides>(
    STEP4_CODES_SETTING_KEY,
    { fresh: true }
  );
  if (remote && typeof remote === "object") return { ...remote };
  try {
    const raw = JSON.parse(
      await fs.readFile(STEP4_CODES_FILE, "utf8")
    ) as Step4Overrides;
    if (raw && typeof raw === "object") return raw;
  } catch {
    // file non ancora presente
  }
  return null;
}

/**
 * Legge gli override "multiplo di 4" per CODICE.
 * Ritorna SEMPRE una copia; con { fresh: true } salta la cache.
 */
async function readStep4Codes(opts?: {
  fresh?: boolean;
}): Promise<Step4Overrides | null> {
  if (opts?.fresh) return loadStep4Codes();
  return memoized<Step4Overrides | null>(
    CATALOG_STEP4_CACHE_KEY,
    CATALOG_CACHE_TTL_MS,
    loadStep4Codes
  );
}

/** Salva gli override "multiplo di 4" (Supabase oppure file locale). */
async function persistStep4Codes(codes: Step4Overrides): Promise<void> {
  const saved = await setAppSetting(STEP4_CODES_SETTING_KEY, codes);
  if (!saved) {
    await fs.mkdir(path.dirname(STEP4_CODES_FILE), { recursive: true });
    await fs.writeFile(STEP4_CODES_FILE, JSON.stringify(codes, null, 2));
  }
  invalidateMemo(CATALOG_STEP4_CACHE_KEY);
}

/** Mappa riga->codice letta dal template corrente (per la migrazione legacy). */
async function rowToCodiceMapFromSheet(): Promise<Map<number, string>> {
  const map = new Map<number, string>();
  const workbook = await openWorkbook().catch(() => null);
  if (!workbook) return map;
  const { startRow, rows } = readSheet(workbook);
  const headerIdx = findHeaderIndex(rows);
  if (headerIdx === -1) return map;
  for (let i = headerIdx + 1; i < rows.length; i++) {
    const row = rows[i] ?? [];
    const codice = String(row[3] ?? "").trim();
    const descrizione = String(row[4] ?? "").trim();
    if (!codice && !descrizione) break;
    if (codice) map.set(startRow + i, codice);
  }
  return map;
}

/**
 * Ritorna gli override per CODICE. Se non esistono ancora, converte UNA volta
 * i vecchi override per riga (legacy) in override per codice, usando il
 * template corrente, poi li salva con la nuova chiave.
 */
async function ensureStep4Codes(opts: {
  fresh: boolean;
  rowMap?: Map<number, string>;
}): Promise<Step4Overrides> {
  const existing = await readStep4Codes({ fresh: opts.fresh });
  if (existing !== null) return existing;

  const rowMap = opts.rowMap ?? (await rowToCodiceMapFromSheet());
  const legacy = await loadLegacyRowOverrides();
  const codes: Step4Overrides = {};
  for (const [rowKey, value] of Object.entries(legacy)) {
    const codice = rowMap.get(Number(rowKey));
    if (codice) codes[codice] = value === true;
  }
  await persistStep4Codes(codes);
  return codes;
}

/**
 * I salvataggi del vincolo "multiplo di 4" vengono messi in coda: cliccando in
 * fretta le caselle di più articoli partono più richieste in parallelo e, senza
 * accodamento, il classico "leggi -> modifica -> scrivi" faceva perdere le
 * modifiche precedenti (le spunte tornavano indietro).
 */
let step4WriteQueue: Promise<void> = Promise.resolve();

/**
 * Imposta (o revoca) il vincolo "quantita' a multipli di 4" per gli articoli
 * indicati (PER CODICE). La decisione dell'amministratore ha la precedenza
 * sulla regola automatica per descrizione.
 */
export async function saveStep4(
  updates: { codice: string; enabled: boolean }[]
): Promise<void> {
  const valid = updates.filter(
    (u) => typeof u.codice === "string" && u.codice.trim().length > 0
  );
  if (valid.length === 0) return;

  const run = step4WriteQueue.catch(() => {}).then(async () => {
    // Lettura FRESH: si parte dall'ultimo stato salvato, così le modifiche
    // fatte poco prima su altri articoli non vengono sovrascritte.
    const overrides = await ensureStep4Codes({ fresh: true });
    for (const u of valid) {
      overrides[u.codice.trim()] = u.enabled;
    }
    await persistStep4Codes(overrides);
    // Gli override sono cambiati: il catalogo (che li applica) va ricalcolato.
    invalidateCatalogCache();
  });

  step4WriteQueue = run.catch(() => {});
  return run;
}

function templateFile(): string {
  return existsSync(WORKING_FILE) ? WORKING_FILE : ROOT_TEMPLATE;
}

/**
 * Apre il template di lavoro (quello con sconti/prezzi gestiti dal Catalogo):
 * 1) versione salvata su Supabase Storage (online/Vercel);
 * 2) file locale data/ordine_template.xlsx;
 * 3) template originale in root (committato nel repo).
 */
async function openWorkbook(): Promise<Workbook> {
  const remote = await downloadWorkingTemplate();
  if (remote) return XLSXPopulate.fromDataAsync(remote);
  const source = templateFile();
  if (!existsSync(source)) {
    throw new Error("File ordine_template.xlsx non trovato.");
  }
  return XLSXPopulate.fromFileAsync(source);
}

/** Salva il template di lavoro: su Storage (online) e, se non possibile, in locale. */
async function persistWorkbook(workbook: Workbook): Promise<void> {
  const buffer = (await workbook.outputAsync()) as Buffer;
  const uploaded = await uploadWorkingTemplate(buffer);
  if (!uploaded) {
    await fs.mkdir(path.dirname(WORKING_FILE), { recursive: true });
    await workbook.toFileAsync(WORKING_FILE);
  }
  // Il file è cambiato: gli articoli in cache non sono più validi.
  invalidateCatalogCache();
}

function toNumber(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  const n = Number(String(value ?? "").replace(",", ".").trim());
  return Number.isFinite(n) ? n : 0;
}

function parseIvaPerc(value: unknown): number {
  const s = String(value ?? "").trim();
  if (s.includes("%")) return parseFloat(s) || 0;
  const n = toNumber(value);
  if (n > 0 && n < 1) return n * 100;
  return n;
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

/** Ritorna { startRow, rows } del foglio (usando la riga reale del range). */
function readSheet(workbook: Workbook) {
  const sheet = workbook.sheet(0);
  const range = sheet.usedRange();
  const startRow = range.startCell().rowNumber();
  return { startRow, rows: range.value() as unknown[][] };
}

function findHeaderIndex(rows: unknown[][]): number {
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i] ?? [];
    if (
      String(row[0] ?? "").trim().toUpperCase() === "BRAND" &&
      String(row[3] ?? "").trim().toUpperCase() === "CODICE"
    ) {
      return i;
    }
  }
  return -1;
}

/**
 * Legge il catalogo applicando gli override "multiplo di 4".
 * `step4Fresh`: TRUE forza la rilettura degli override (usato per la pagina
 * Catalogo dell'amministratore, così lo stato mostrato è sempre aggiornato).
 */
async function buildCatalog(step4Fresh: boolean): Promise<CatalogItem[]> {
  const workbook = await openWorkbook().catch(() => null);
  if (!workbook) return [];
  const { startRow, rows } = readSheet(workbook);
  const headerIdx = findHeaderIndex(rows);
  if (headerIdx === -1) return [];

  // Pre-pass: mappa riga -> codice. Serve sia per agganciare gli override al
  // CODICE, sia per convertire una volta i vecchi override salvati per riga.
  const rowToCodice = new Map<number, string>();
  for (let i = headerIdx + 1; i < rows.length; i++) {
    const row = rows[i] ?? [];
    const codice = String(row[3] ?? "").trim();
    const descrizione = String(row[4] ?? "").trim();
    if (!codice && !descrizione) break;
    if (codice) rowToCodice.set(startRow + i, codice);
  }
  const step4Overrides = await ensureStep4Codes({
    fresh: step4Fresh,
    rowMap: rowToCodice,
  });

  const items: CatalogItem[] = [];
  for (let i = headerIdx + 1; i < rows.length; i++) {
    const row = rows[i] ?? [];
    const codice = String(row[3] ?? "").trim();
    const descrizione = String(row[4] ?? "").trim();
    if (!codice && !descrizione) break;
    const prezzo = toNumber(row[8]);
    const sconto = toNumber(row[12]);
    const itemRow = startRow + i;
    items.push({
      row: itemRow,
      brand: String(row[0] ?? "").trim(),
      tipologia: String(row[1] ?? "").trim(),
      modello: String(row[2] ?? "").trim(),
      codice,
      descrizione,
      diottria: String(row[5] ?? "").trim(),
      pezzi: toNumber(row[6]),
      prezzo,
      iva: parseIvaPerc(row[9]),
      sconto,
      // NETTO IVA ESCL. come da formula del template (N = I*(1-M)):
      // NON si legge dal file perche' per molti articoli la cella e' vuota.
      nettoEscl: round2(prezzo * (1 - sconto)),
      // Multiplo di 4: decide l'amministratore (override PER CODICE);
      // altrimenti regola automatica per descrizione (tutto tranne
      // expo/kit/astucci). Se l'articolo non ha codice si usa la regola.
      step4:
        codice && step4Overrides[codice] !== undefined
          ? step4Overrides[codice]
          : !/(expo|kit|astuccio)/i.test(descrizione),
    });
  }
  return items;
}

export async function readCatalog(opts?: {
  /** TRUE per ignorare la cache (usato dalla pagina Catalogo dell'admin). */
  fresh?: boolean;
}): Promise<CatalogItem[]> {
  // Lettura diretta: sempre aggiornata (dopo un salvataggio dell'admin).
  if (opts?.fresh) return buildCatalog(true);

  // Risultato condiviso tra richieste simultanee (stessa istanza) per TTL.
  // Attenzione: i chiamanti NON devono mutare gli oggetti dell'array.
  return memoized<CatalogItem[]>(
    CATALOG_ITEMS_CACHE_KEY,
    CATALOG_CACHE_TTL_MS,
    () => buildCatalog(false)
  );
}

/**
 * Riscrive le colonne M (SCONTO), N (NETTO IVA ESCL.) e O (NETTO IVA INCL.)
 * per TUTTE le righe del catalogo. Evita che il template di lavoro perda i
 * netti (righe vuote nell'ordine Excel) quando l'amministratore salva sconti
 * o prezzi solo su alcune righe.
 */
async function normalizeNettoColumns(
  workbook: Workbook,
  rows: unknown[][],
  startRow: number,
  headerIdx: number
): Promise<void> {
  const sheet = workbook.sheet(0);
  for (let i = headerIdx + 1; i < rows.length; i++) {
    const row = rows[i] ?? [];
    const codice = String(row[3] ?? "").trim();
    const descrizione = String(row[4] ?? "").trim();
    if (!codice && !descrizione) break;
    const prezzo = toNumber(row[8]);
    const sconto = toNumber(row[12]);
    const ivaPerc = parseIvaPerc(row[9]);
    const r = startRow + i;
    const netto = prezzo * (1 - sconto);
    const nettoIncl = netto * (1 + ivaPerc / 100);
    sheet.cell(r, 13).value(sconto);
    sheet.cell(r, 14).value(round2(netto));
    sheet.cell(r, 15).value(round2(nettoIncl));
  }
}

/** Applica gli sconti (frazione) alle righe indicate e ricalcola i netti. */
export async function saveDiscounts(
  updates: { row: number; sconto: number }[]
): Promise<void> {
  if (updates.length === 0) return;
  const workbook = await openWorkbook();
  const sheet = workbook.sheet(0);
  const { startRow, rows } = readSheet(workbook);
  const headerIdx = findHeaderIndex(rows);
  if (headerIdx === -1) throw new Error("Struttura template non riconosciuta.");

  for (const u of updates) {
    const rowValues = rows[u.row - startRow] ?? [];
    const prezzo = toNumber(rowValues[8]);
    const ivaPerc = parseIvaPerc(rowValues[9]);
    const netto = prezzo * (1 - u.sconto);
    const nettoIncl = netto * (1 + ivaPerc / 100);
    sheet.cell(u.row, 13).value(u.sconto);
    sheet.cell(u.row, 14).value(round2(netto));
    sheet.cell(u.row, 15).value(round2(nettoIncl));
  }

  // Completa N/O su tutte le righe catalogo (non solo quelle modificate).
  await normalizeNettoColumns(workbook, rows, startRow, headerIdx);

  await persistWorkbook(workbook);
}

/**
 * Imposta il PREZZO di listino (col I) e lo SCONTO (frazione, col M) per le
 * righe indicate e RICALCOLA automaticamente il PREZZO DI VENDITA:
 *   netto = prezzo * (1 - sconto)
 * (N = NETTO IVA ESCL., O = NETTO IVA INCL.). I netti vengono poi
 * normalizzati su tutte le righe leggendo il foglio DOPO le modifiche.
 */
export async function saveCatalogPrices(
  updates: { row: number; prezzo: number; sconto: number }[]
): Promise<void> {
  if (updates.length === 0) return;
  const workbook = await openWorkbook();
  const sheet = workbook.sheet(0);
  const { startRow, rows } = readSheet(workbook);
  const headerIdx = findHeaderIndex(rows);
  if (headerIdx === -1) throw new Error("Struttura template non riconosciuta.");

  for (const u of updates) {
    if (!Number.isFinite(u.prezzo) || u.prezzo <= 0) {
      throw new Error(`Prezzo non valido per la riga ${u.row}.`);
    }
    const ivaPerc = parseIvaPerc(rows[u.row - startRow]?.[9]);
    const prezzo = round2(u.prezzo);
    const sconto = Math.min(1, Math.max(0, u.sconto));
    const netto = round2(prezzo * (1 - sconto));
    const nettoIncl = round2(netto * (1 + ivaPerc / 100));
    sheet.cell(u.row, 9).value(prezzo); // I = PREZZO (listino)
    sheet.cell(u.row, 13).value(sconto); // M = SCONTO
    sheet.cell(u.row, 14).value(netto); // N = NETTO IVA ESCL. (prezzo di vendita)
    sheet.cell(u.row, 15).value(nettoIncl); // O = NETTO IVA INCL.
  }

  // Normalizza N/O di TUTTE le righe leggendo il foglio appena aggiornato,
  // così prezzo di vendita e netto IVA incl. restano coerenti ovunque.
  const freshSheet = workbook.sheet(0);
  const freshRange = freshSheet.usedRange();
  const fresh = freshRange.value() as unknown[][];
  const freshStart = freshRange.startCell().rowNumber();
  const freshHeader = findHeaderIndex(fresh);
  if (freshHeader !== -1) {
    for (let i = freshHeader + 1; i < fresh.length; i++) {
      const row = fresh[i] ?? [];
      const codice = String(row[3] ?? "").trim();
      const descrizione = String(row[4] ?? "").trim();
      if (!codice && !descrizione) break;
      const prezzo = toNumber(row[8]);
      const sconto = toNumber(row[12]);
      const ivaPerc = parseIvaPerc(row[9]);
      const r = freshStart + i;
      const netto = prezzo * (1 - sconto);
      freshSheet.cell(r, 13).value(sconto);
      freshSheet.cell(r, 14).value(round2(netto));
      freshSheet.cell(r, 15).value(round2(netto * (1 + ivaPerc / 100)));
    }
  }

  await persistWorkbook(workbook);
}

/**
 * Imposta il PREZZO DI VENDITA (netto IVA escl.) scelto dall'amministratore
 * per le righe indicate. Lo sconto implicito (colonna SCONTO) viene ricalcolato
 * come 1 - (prezzo di vendita / prezzo di listino), coerente con il template.
 */
export async function savePrices(
  updates: { row: number; nettoEscl: number }[]
): Promise<void> {
  if (updates.length === 0) return;
  const workbook = await openWorkbook();
  const sheet = workbook.sheet(0);
  const { startRow, rows } = readSheet(workbook);
  const headerIdx = findHeaderIndex(rows);
  if (headerIdx === -1) throw new Error("Struttura template non riconosciuta.");

  for (const u of updates) {
    const rowValues = rows[u.row - startRow] ?? [];
    const prezzo = toNumber(rowValues[8]);
    if (prezzo <= 0) {
      throw new Error(`Prezzo di listino mancante per la riga ${u.row}.`);
    }
    const ivaPerc = parseIvaPerc(rowValues[9]);
    const netto = Math.max(0, u.nettoEscl);
    const sconto = Math.min(1, Math.max(0, 1 - netto / prezzo));
    const nettoIncl = netto * (1 + ivaPerc / 100);
    sheet.cell(u.row, 13).value(sconto);
    sheet.cell(u.row, 14).value(round2(netto));
    sheet.cell(u.row, 15).value(round2(nettoIncl));
  }

  // Completa N/O su tutte le righe catalogo (non solo quelle modificate).
  await normalizeNettoColumns(workbook, rows, startRow, headerIdx);

  await persistWorkbook(workbook);
}
