import { promises as fs } from "node:fs";
import { existsSync } from "node:fs";
import path from "node:path";
import XLSXPopulate from "xlsx-populate";
import type { Workbook } from "xlsx-populate";
import { appDataDir, appDataPath, appRootPath } from "@/lib/data-dir";
import { getAppSetting, setAppSetting } from "@/lib/supabase/app-settings";
import {
  downloadWorkingTemplate,
  uploadWorkingTemplate,
} from "@/lib/orders/storage";
import {
  DEFAULT_SHIPPING_SETTINGS,
  round2,
  type ShippingSettings,
} from "./shipping";
import { memoized, invalidateMemo } from "@/lib/server-cache";

/**
 * Impostazioni "Spese di spedizione" gestite dall'amministratore.
 *
 * Due sezioni:
 *  - METODO PERCENTUALE (attuale): valori estrapolati dal file Excel
 *    ordine_template.xlsx (cella N291 = 2,9%, N293 = 22% e i limiti minimo/
 *    massimo contenuti nella formula O291 = MIN(MAX(Q288*N291,9.5),99)).
 *    Quando l'amministratore li modifica vengono riscritti anche nel file
 *    Excel di lavoro (data/ordine_template.xlsx) così "i valori che usa
 *    Excel" restano allineati a quelli impostati.
 *  - METODO IMPORTO FISSO: l'amministratore inserisce il costo della
 *    spedizione; l'IVA viene calcolata dal sistema sulla stessa aliquota
 *    del trasporto (formula attuale).
 *
 * Le impostazioni salvate vivono in data/shipping-settings.json.
 */

const DATA_DIR = appDataDir();
const SETTINGS_FILE = appDataPath("shipping-settings.json");
const SETTINGS_SETTING_KEY = "shipping_settings";
const WORKING_TEMPLATE = appDataPath("ordine_template.xlsx");
const ROOT_TEMPLATE = appRootPath("ordine_template.xlsx");

// Cache letta a ogni apertura/conferma di un ordine: TTL breve + invalidation.
const SHIPPING_CACHE_KEY = "shipping-settings";
const SHIPPING_CACHE_TTL_MS = 15_000;

// Celle del template Excel usate per la spedizione (riferimenti 1-based):
//   N291 (riga 291, colonna 14) = 0.029 → percentuale trasporto
//   N293 (riga 293, colonna 14) = 0.22  → IVA sul trasporto
//   O291 (riga 291, colonna 15) = formula MIN(MAX(Q288*N291,min),max)
const ROW_TRASPORTO = 291;
const ROW_IVA_TRASPORTO = 293;
const COL_N = 14;
const COL_O = 15;

type StoredShipping = {
  version: 1;
  method: "percentuale" | "fisso";
  percentuale: { percent: number; min: number; max: number };
  fisso: { amount: number };
  iva: number;
  updatedAt: string;
};

export type SaveShippingSettingsResult =
  | { ok: true; excelWarning?: string }
  | { ok: false; error: string };

function templateFile(): string {
  return existsSync(WORKING_TEMPLATE) ? WORKING_TEMPLATE : ROOT_TEMPLATE;
}

function toNumber(value: unknown, fallback: number): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  const n = Number(String(value ?? "").replace(",", ".").trim());
  return Number.isFinite(n) ? n : fallback;
}

/** Estrae min/max dalla formula O291 (MIN(MAX(Q288*N291,9.5),99)). */
function parseMinMaxFromFormula(
  formula: string | undefined
): { min: number; max: number } {
  if (formula) {
    const m = formula.match(
      /MIN\(\s*MAX\([^,]+,([\d.]+)\s*\),\s*([\d.]+)\s*\)/i
    );
    if (m) {
      const min = parseFloat(m[1]);
      const max = parseFloat(m[2]);
      if (Number.isFinite(min) && Number.isFinite(max)) {
        return { min, max };
      }
    }
  }
  return {
    min: DEFAULT_SHIPPING_SETTINGS.percentuale.min,
    max: DEFAULT_SHIPPING_SETTINGS.percentuale.max,
  };
}

/**
 * Legge i valori correnti di spedizione dal template Excel (quelli che
 * "usa Excel"): percentuale da N291, IVA da N293, min/max dalla formula O291.
 * Se <source> è indicato legge da quel file (es. il template originale in
 * root, mai toccato dalle modifiche).
 */
async function readFromExcel(source?: string): Promise<ShippingSettings> {
  const d = DEFAULT_SHIPPING_SETTINGS;
  const fallback: ShippingSettings = {
    method: "percentuale",
    percentuale: { ...d.percentuale },
    fisso: { amount: 0 },
    iva: d.iva,
  };
  try {
    let workbook: Workbook | null = null;
    if (!source) {
      const remote = await downloadWorkingTemplate();
      if (remote) {
        workbook = await XLSXPopulate.fromDataAsync(remote);
      }
    }
    if (!workbook) {
      const src = source ?? templateFile();
      if (!existsSync(src)) return fallback;
      workbook = await XLSXPopulate.fromFileAsync(src);
    }
    const sheet = workbook.sheet(0);

    const percentRaw = toNumber(
      sheet.cell(ROW_TRASPORTO, COL_N).value(),
      0
    );
    const ivaRaw = toNumber(sheet.cell(ROW_IVA_TRASPORTO, COL_N).value(), 0);
    const { min, max } = parseMinMaxFromFormula(
      sheet.cell(ROW_TRASPORTO, COL_O).formula() ?? undefined
    );

    return {
      method: "percentuale",
      percentuale: {
        percent:
          percentRaw > 0 ? round2(percentRaw * 100) : d.percentuale.percent,
        min: min > 0 ? min : d.percentuale.min,
        max: max > 0 ? max : d.percentuale.max,
      },
      fisso: { amount: 0 },
      iva: ivaRaw > 0 ? round2(ivaRaw * 100) : d.iva,
    };
  } catch {
    return fallback;
  }
}

/** Rende robusti i valori letti dal file impostazioni. */
function normalize(stored: Partial<StoredShipping>): ShippingSettings {
  const d = DEFAULT_SHIPPING_SETTINGS;
  const perc: { percent?: number; min?: number; max?: number } =
    stored.percentuale ?? {};
  const fisso: { amount?: number } = stored.fisso ?? {};
  return {
    method: stored.method === "fisso" ? "fisso" : "percentuale",
    percentuale: {
      percent: toNumber(perc.percent, d.percentuale.percent),
      min: toNumber(perc.min, d.percentuale.min),
      max: toNumber(perc.max, d.percentuale.max),
    },
    fisso: {
      amount: Math.max(0, toNumber(fisso.amount, 0)),
    },
    iva: toNumber(stored.iva, d.iva),
  };
}

/** Impostazioni correnti: Supabase (online), poi file, poi valori da Excel. */
export async function getShippingSettings(): Promise<ShippingSettings> {
  return memoized<ShippingSettings>(
    SHIPPING_CACHE_KEY,
    SHIPPING_CACHE_TTL_MS,
    async () => {
      const remote = await getAppSetting<Partial<StoredShipping>>(
        SETTINGS_SETTING_KEY
      );
      if (remote && remote.version === 1 && remote.percentuale) {
        return normalize(remote);
      }
      try {
        const raw = JSON.parse(
          await fs.readFile(SETTINGS_FILE, "utf8")
        ) as Partial<StoredShipping>;
        if (raw && raw.version === 1 && raw.percentuale) {
          return normalize(raw);
        }
      } catch {
        // file assente o non valido: si leggono i valori direttamente da Excel
      }
      return readFromExcel();
    }
  );
}

/** Sincronizza la Sezione 1 con il template Excel di lavoro (Storage o file locale). */
async function syncExcelTemplate(s: StoredShipping): Promise<void> {
  let workbook: Workbook | null = null;
  const remote = await downloadWorkingTemplate();
  if (remote) {
    workbook = await XLSXPopulate.fromDataAsync(remote);
  } else {
    const src = templateFile();
    if (!existsSync(src)) return;
    workbook = await XLSXPopulate.fromFileAsync(src);
  }
  const sheet = workbook.sheet(0);
  // Percentuale trasporto e IVA trasporto (come Excel: frazione).
  sheet.cell(ROW_TRASPORTO, COL_N).value(round2(s.percentuale.percent) / 100);
  sheet.cell(ROW_IVA_TRASPORTO, COL_N).value(round2(s.iva) / 100);
  // Formula trasporto con i limiti min/max aggiornati (stessa struttura).
  sheet
    .cell(ROW_TRASPORTO, COL_O)
    .formula(
      `MIN(MAX(Q288*N${ROW_TRASPORTO},${s.percentuale.min}),${s.percentuale.max})`
    );
  // Salva: prima su Storage (online), poi su file locale.
  const buffer = (await workbook.outputAsync()) as Buffer;
  const uploaded = await uploadWorkingTemplate(buffer);
  if (!uploaded) {
    await workbook.toFileAsync(WORKING_TEMPLATE);
  }
}

/**
 * Salva le impostazioni di spedizione (data/shipping-settings.json).
 * La Sezione 1 viene riscritta anche nel file Excel di lavoro; se il file è
 * aperto in Excel la scrittura può fallire: in quel caso le impostazioni
 * restano comunque salvate e viene restituito un avviso.
 */
export async function saveShippingSettings(
  settings: ShippingSettings
): Promise<SaveShippingSettingsResult> {
  const stored: StoredShipping = {
    version: 1,
    method: settings.method,
    percentuale: {
      percent: settings.percentuale.percent,
      min: settings.percentuale.min,
      max: settings.percentuale.max,
    },
    fisso: {
      amount: Math.max(0, settings.fisso.amount),
    },
    iva: settings.iva,
    updatedAt: new Date().toISOString(),
  };

  const saved = await setAppSetting(SETTINGS_SETTING_KEY, stored);
  if (!saved) {
    try {
      await fs.mkdir(DATA_DIR, { recursive: true });
      await fs.writeFile(SETTINGS_FILE, JSON.stringify(stored, null, 2), {
        mode: 0o600,
      });
    } catch (err) {
      return {
        ok: false,
        error:
          "Impossibile salvare le impostazioni: " +
          (err as Error).message,
      };
    }
  }

  // Valore salvato: la voce in cache non è più valida.
  invalidateMemo(SHIPPING_CACHE_KEY);

  // Allinea il template Excel (Sezione 1) senza bloccare il salvataggio.
  let excelWarning: string | undefined;
  try {
    await syncExcelTemplate(stored);
  } catch (err) {
    excelWarning =
      "Impostazioni salvate, ma il file Excel non è stato aggiornato " +
      "(probabilmente è aperto in Excel): " +
      (err as Error).message;
  }

  return { ok: true, excelWarning };
}

export type ResetShippingSettingsResult =
  | { ok: true; settings: ShippingSettings; excelWarning?: string }
  | { ok: false; error: string };

/**
 * Ripristina le spese di spedizione ORIGINALI (quelle del template Excel in
 * root, mai modificato): percentuale 2,9% / min €9,50 / max €99,00 / IVA 22%,
 * metodo "percentuale", importo fisso azzerato. Il file Excel di lavoro viene
 * risincronizzato con questi valori.
 */
export async function resetShippingSettings(): Promise<ResetShippingSettingsResult> {
  const originals = await readFromExcel(ROOT_TEMPLATE);
  const stored: StoredShipping = {
    version: 1,
    method: "percentuale",
    percentuale: { ...originals.percentuale },
    fisso: { amount: 0 },
    iva: originals.iva,
    updatedAt: new Date().toISOString(),
  };

  const saved = await setAppSetting(SETTINGS_SETTING_KEY, stored);
  if (!saved) {
    try {
      await fs.mkdir(DATA_DIR, { recursive: true });
      await fs.writeFile(SETTINGS_FILE, JSON.stringify(stored, null, 2), {
        mode: 0o600,
      });
    } catch (err) {
      return {
        ok: false,
        error: "Impossibile ripristinare i valori originali: " + (err as Error).message,
      };
    }
  }

  // Valore ripristinato: la voce in cache non è più valida.
  invalidateMemo(SHIPPING_CACHE_KEY);

  let excelWarning: string | undefined;
  try {
    await syncExcelTemplate(stored);
  } catch (err) {
    excelWarning =
      "Valori ripristinati, ma il file Excel non è stato aggiornato " +
      "(probabilmente è aperto in Excel): " +
      (err as Error).message;
  }

  return { ok: true, settings: normalize(stored), excelWarning };
}
