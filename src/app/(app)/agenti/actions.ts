"use server";

import { getCurrentAdmin } from "@/lib/supabase/session";
import {
  COMMISSION_GROUPS,
  saveCommissionRates,
  type CommissionRates,
} from "@/lib/commissions";

/** Salva le percentuali di provvigione per gruppo (solo amministratore). */
export async function saveCommissionRatesAction(
  rates: CommissionRates
): Promise<{ error?: string; success?: boolean }> {
  const admin = await getCurrentAdmin();
  if (!admin || admin.subAdmin) {
    return { error: "Operazione riservata all'amministratore." };
  }

  const clean = {} as CommissionRates;
  for (const group of COMMISSION_GROUPS) {
    const value = Number(rates[group.key]);
    if (!Number.isFinite(value) || value < 0 || value > 100) {
      return { error: `Valore non valido per ${group.label}.` };
    }
    clean[group.key] = Math.round(value * 10) / 10;
  }

  await saveCommissionRates(clean);
  return { success: true };
}
