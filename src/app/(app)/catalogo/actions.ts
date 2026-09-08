"use server";

import { promises as fs } from "node:fs";
import path from "node:path";
import { revalidatePath } from "next/cache";
import XLSXPopulate from "xlsx-populate";
import { getCurrentAdmin } from "@/lib/supabase/session";
import { saveCatalogPrices, saveDiscounts, savePrices, saveStep4, invalidateCatalogCache } from "@/lib/catalog/template";
import { uploadWorkingTemplate } from "@/lib/orders/storage";
import { appDataPath } from "@/lib/data-dir";

export type CatalogActionState = { error?: string; success?: boolean; applied?: number };

function validPct(value: number): boolean {
  return Number.isFinite(value) && value >= 0 && value <= 100;
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

export async function saveDiscountAction(
  row: number,
  scontoPct: number
): Promise<CatalogActionState> {
  const admin = await getCurrentAdmin();
  if (!admin || admin.subAdmin)
    return { error: "Operazione riservata all'amministratore." };
  if (!Number.isInteger(row) || row <= 0) return { error: "Articolo non valido." };
  if (!validPct(scontoPct)) return { error: "La percentuale deve essere tra 0 e 100." };

  try {
    await saveDiscounts([{ row, sconto: scontoPct / 100 }]);
  } catch (err) {
    return { error: "Errore salvataggio: " + (err as Error).message };
  }
  revalidatePath("/catalogo");
  return { success: true };
}

/** Imposta il prezzo di vendita (netto IVA escl.) scelto a propria discrezione. */
export async function saveProductPriceAction(
  row: number,
  nettoEscl: number
): Promise<CatalogActionState> {
  const admin = await getCurrentAdmin();
  if (!admin || admin.subAdmin)
    return { error: "Operazione riservata all'amministratore." };
  if (!Number.isInteger(row) || row <= 0) return { error: "Articolo non valido." };
  if (!Number.isFinite(nettoEscl) || nettoEscl < 0 || nettoEscl > 100000) {
    return { error: "Prezzo di vendita non valido." };
  }

  try {
    await savePrices([{ row, nettoEscl: round2(nettoEscl) }]);
  } catch (err) {
    return { error: "Errore salvataggio: " + (err as Error).message };
  }
  revalidatePath("/catalogo");
  return { success: true };
}

/**
 * Salva PREZZO iniziale + SCONTO % di un articolo e genera automaticamente il
 * PREZZO DI VENDITA (netto = prezzo * (1 - sconto/100)).
 */
export async function saveCatalogPricesAction(
  row: number,
  prezzoBase: number,
  scontoPct: number
): Promise<CatalogActionState> {
  const admin = await getCurrentAdmin();
  if (!admin || admin.subAdmin)
    return { error: "Operazione riservata all'amministratore." };
  if (!Number.isInteger(row) || row <= 0) return { error: "Articolo non valido." };
  if (!Number.isFinite(prezzoBase) || prezzoBase <= 0 || prezzoBase > 100000) {
    return { error: "Prezzo non valido (deve essere maggiore di zero)." };
  }
  if (!validPct(scontoPct)) return { error: "La percentuale deve essere tra 0 e 100." };

  try {
    await saveCatalogPrices([
      { row, prezzo: round2(prezzoBase), sconto: scontoPct / 100 },
    ]);
  } catch (err) {
    return { error: "Errore salvataggio: " + (err as Error).message };
  }
  revalidatePath("/catalogo");
  return { success: true };
}

export async function applyBulkDiscountAction(
  rows: number[],
  scontoPct: number
): Promise<CatalogActionState> {
  const admin = await getCurrentAdmin();
  if (!admin || admin.subAdmin)
    return { error: "Operazione riservata all'amministratore." };
  const validRows = rows.filter((r) => Number.isInteger(r) && r > 0);
  if (validRows.length === 0) return { error: "Seleziona almeno un articolo." };
  if (!validPct(scontoPct)) return { error: "La percentuale deve essere tra 0 e 100." };

  try {
    await saveDiscounts(validRows.map((row) => ({ row, sconto: scontoPct / 100 })));
  } catch (err) {
    return { error: "Errore salvataggio: " + (err as Error).message };
  }
  revalidatePath("/catalogo");
  return { success: true, applied: validRows.length };
}

/** Imposta/revoca il vincolo "multiplo di 4" su un singolo articolo. */
export async function saveStep4Action(
  row: number,
  enabled: boolean
): Promise<CatalogActionState> {
  const admin = await getCurrentAdmin();
  if (!admin || admin.subAdmin)
    return { error: "Operazione riservata all'amministratore." };
  if (!Number.isInteger(row) || row <= 0) return { error: "Articolo non valido." };

  try {
    await saveStep4([{ row, enabled }]);
  } catch (err) {
    return { error: "Errore salvataggio: " + (err as Error).message };
  }
  revalidatePath("/catalogo");
  return { success: true };
}

/** Applica il vincolo "multiplo di 4" alla selezione di articoli. */
export async function applyBulkStep4Action(
  rows: number[],
  enabled: boolean
): Promise<CatalogActionState> {
  const admin = await getCurrentAdmin();
  if (!admin || admin.subAdmin)
    return { error: "Operazione riservata all'amministratore." };
  const validRows = rows.filter((r) => Number.isInteger(r) && r > 0);
  if (validRows.length === 0) return { error: "Seleziona almeno un articolo." };

  try {
    await saveStep4(validRows.map((row) => ({ row, enabled })));
  } catch (err) {
    return { error: "Errore salvataggio: " + (err as Error).message };
  }
  revalidatePath("/catalogo");
  return { success: true, applied: validRows.length };
}

export type TemplateUploadState = {
  error?: string;
  success?: boolean;
};

/**
 * Sostituisce il file di lavoro del catalogo (ordine_template.xlsx).
 * Online (Vercel) viene caricato su Supabase Storage; in locale viene salvato
 * in data/ordine_template.xlsx. Il file originale nella root resta intatto.
 */
export async function uploadTemplateAction(
  _prev: TemplateUploadState,
  formData: FormData
): Promise<TemplateUploadState> {
  const admin = await getCurrentAdmin();
  if (!admin || admin.subAdmin) {
    return { error: "Operazione riservata all'amministratore." };
  }

  const file = formData.get("file");
  if (!(file instanceof File)) {
    return { error: "Seleziona un file Excel (.xlsx)." };
  }
  if (!file.name.toLowerCase().endsWith(".xlsx")) {
    return { error: "Il file deve avere estensione .xlsx." };
  }
  const buffer = Buffer.from(await file.arrayBuffer());
  if (buffer.length === 0 || buffer.length > 30 * 1024 * 1024) {
    return { error: "File vuoto o troppo grande (max 30 MB)." };
  }

  // Validazione: deve essere un Excel apribile.
  try {
    await XLSXPopulate.fromDataAsync(buffer as unknown as ArrayBuffer);
  } catch {
    return { error: "Il file non è un file Excel valido (.xlsx)." };
  }

  const uploaded = await uploadWorkingTemplate(buffer);
  if (!uploaded) {
    // Modalità locale / senza Supabase: aggiorna il file di lavoro.
    try {
      await fs.mkdir(path.dirname(appDataPath("ordine_template.xlsx")), {
        recursive: true,
      });
      await fs.writeFile(appDataPath("ordine_template.xlsx"), buffer);
    } catch {
      return { error: "Impossibile salvare il file (cartella non scrivibile)." };
    }
  }

  invalidateCatalogCache();
  revalidatePath("/catalogo");
  revalidatePath("/");
  return { success: true };
}
