"use server";

import { revalidatePath } from "next/cache";
import { getCurrentAdmin } from "@/lib/supabase/session";
import {
  saveIncentiveGara,
  deleteIncentiveGara,
} from "@/lib/incentives";

export type GaraActionState = {
  error?: string;
  success?: boolean;
};

/** Crea/aggiorna una gara del mese (solo amministratore principale). */
export async function addGaraAction(
  _prev: GaraActionState,
  formData: FormData
): Promise<GaraActionState> {
  const admin = await getCurrentAdmin();
  if (!admin || admin.subAdmin) {
    return { error: "Operazione riservata all'amministratore." };
  }

  const kindRaw = String(formData.get("kind") ?? "obiettivo");
  const kind = kindRaw === "vendite" ? "vendite" : "obiettivo";
  const monthNum = Number(formData.get("mese") ?? 0);
  const year = Number(formData.get("anno") ?? 0);

  if (!Number.isInteger(monthNum) || monthNum < 1 || monthNum > 12) {
    return { error: "Seleziona un mese valido." };
  }
  if (!Number.isInteger(year) || year < 2020 || year > 2100) {
    return { error: "Seleziona un anno valido." };
  }
  const month = `${year}-${String(monthNum).padStart(2, "0")}`;
  const prize = Number(
    String(formData.get("prize") ?? "").replace(",", ".")
  );
  const target =
    kind === "obiettivo"
      ? Number(String(formData.get("target") ?? "").replace(",", "."))
      : undefined;
  const note =
    kind === "vendite"
      ? String(formData.get("note") ?? "").trim() || undefined
      : undefined;

  const result = await saveIncentiveGara({ kind, month, prize, target, note });
  if (!result.ok) {
    return { error: result.error ?? "Errore durante il salvataggio." };
  }

  revalidatePath("/obiettivi");
  revalidatePath("/dashboard");
  return { success: true };
}

/** Elimina una gara per id (solo amministratore principale). */
export async function deleteGaraAction(
  _prev: GaraActionState,
  formData: FormData
): Promise<GaraActionState> {
  const admin = await getCurrentAdmin();
  if (!admin || admin.subAdmin) {
    return { error: "Operazione riservata all'amministratore." };
  }
  const id = String(formData.get("id") ?? "").trim();
  if (!id) return { error: "Gara non valida." };

  const ok = await deleteIncentiveGara(id);
  if (!ok) {
    return { error: "Impossibile eliminare la gara (riprova)." };
  }
  revalidatePath("/obiettivi");
  revalidatePath("/dashboard");
  return { success: true };
}
