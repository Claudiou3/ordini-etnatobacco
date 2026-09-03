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

/**
 * Gestione del catalogo contenuto in ordine_template.xlsx.
 * - Lettura articoli con sconto corrente (sconto come frazione: 0.6 = 60%).
 * - Modifica sconti (singoli o massivi) salvando su data/ordine_template.xlsx
 *   (il file originale nella root resta intatto).
 * Colonne (1-based): SCONTO=13, NETTO IVA ESCL=14, NETTO IVA INCL=15.
 */

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
// Override dell'amministratore sul "multiplo di 4" per singolo articolo (riga).
const STEP4_FILE = appDataPath("catalog-step4.json");
const STEP4_SETTING_KEY = "catalog_step4";

async function readStep4Overrides(): Promise<Record<number, boolean>> {
  // 1) Supabase (online).
  const remote = await getAppSetting<Record<number, boolean>>(STEP4_SETTING_KEY);
  if (remote && typeof remote === "object") return remote;
  // 2) File locale.
  try {
    return JSON.parse(await fs.readFile(STEP4_FILE, "utf8")) as Record<
      number,
      boolean
    >;
  } catch {
    return {};
  }
}

/**
 * Imposta (o revoca) il vincolo "quantita' a multipli di 4" per gli articoli
 * indicati. La decisione dell'amministratore ha la precedenza sulla regola
 * automatica per descrizione.
 */
export async function saveStep4(
  updates: { row: number; enabled: boolean }[]
): Promise<void> {
  if (updates.length === 0) return;
  const overrides = await readStep4Overrides();
  for (const u of updates) {
    overrides[u.row] = u.enabled;
  }
  const saved = await setAppSetting(STEP4_SETTING_KEY, overrides);
  if (!saved) {
    await fs.mkdir(path.dirname(STEP4_FILE), { recursive: true });
    await fs.writeFile(STEP4_FILE, JSON.stringify(overrides, null, 2));
  }
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

export async function readCatalog(): Promise<CatalogItem[]> {
  const workbook = await openWorkbook().catch(() => null);
  if (!workbook) return [];
  const { startRow, rows } = readSheet(workbook);
  const headerIdx = findHeaderIndex(rows);
  if (headerIdx === -1) return [];

  const items: CatalogItem[] = [];
  const step4Overrides = await readStep4Overrides();
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
      // Multiplo di 4: decide l'amministratore (override); altrimenti regola
      // automatica per descrizione (tutto tranne expo/kit/astucci).
      step4:
        step4Overrides[itemRow] !== undefined
          ? step4Overrides[itemRow]
          : !/(expo|kit|astuccio)/i.test(descrizione),
    });
  }
  return items;
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
