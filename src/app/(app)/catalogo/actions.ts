"use server";

import { revalidatePath } from "next/cache";
import { getCurrentAdmin } from "@/lib/supabase/session";
import { saveDiscounts, savePrices, saveStep4 } from "@/lib/catalog/template";

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
