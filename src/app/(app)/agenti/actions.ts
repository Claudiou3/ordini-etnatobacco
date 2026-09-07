"use server";

import { revalidatePath } from "next/cache";
import { getCurrentAdmin } from "@/lib/supabase/session";
import { createAdminClient } from "@/lib/supabase/admin";
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

export type DeleteAgentResult = {
  error?: string;
  success?: boolean;
  /** Numero di ordini dell'agente rimossi in cascata. */
  deletedOrders?: number;
};

/**
 * Elimina DEFINITIVAMENTE un agente registrato (solo amministratore
 * principale): account di autenticazione, riga in "agents" e, in cascata,
 * tutti i suoi ordini (FK "on delete cascade"). I file Excel degli ordini
 * vengono rimossi dallo Storage come operazione di pulizia "best effort".
 *
 * Attenzione: operazione irreversibile; il client mostra una conferma con il
 * numero di ordini che verranno eliminati.
 */
export async function deleteAgentAction(
  formData: FormData
): Promise<DeleteAgentResult> {
  const admin = await getCurrentAdmin();
  if (!admin || admin.subAdmin) {
    return { error: "Operazione riservata all'amministratore." };
  }

  const agentId = String(formData.get("agentId") ?? "").trim();
  if (!agentId) {
    return { error: "Identificativo agente mancante." };
  }

  const supabase = await createAdminClient();
  if (!supabase) {
    return {
      error: "Eliminazione disponibile solo con Supabase configurato (produzione).",
    };
  }

  // L'agente deve esistere e avere ruolo "agente" (mai admin/sub-admin).
  const { data: agent, error: loadError } = await supabase
    .from("agents")
    .select("id, email, nome, ruolo")
    .eq("id", agentId)
    .maybeSingle();
  if (loadError || !agent) {
    return { error: "Agente non trovato." };
  }
  if (agent.ruolo !== "agente") {
    return {
      error: "Puoi eliminare solo account con ruolo agente (non admin/sub-admin).",
    };
  }

  // Ordini dell'agente (verranno eliminati in cascata) + nomi dei file Excel.
  const { data: orderRows } = await supabase
    .from("orders")
    .select("file_url")
    .eq("agent_id", agentId);
  const deletedOrders = orderRows?.length ?? 0;

  // 1) Rimuove l'account di autenticazione (non potrà più accedere).
  const { error: authError } = await supabase.auth.admin.deleteUser(agentId);
  if (authError) {
    return {
      error: "Impossibile eliminare l'account: " + authError.message,
    };
  }

  // 2) Pulizia "best effort" dei file Excel su Storage.
  const fileNames = (orderRows ?? [])
    .map((o) => o.file_url)
    .filter((f): f is string => typeof f === "string" && f.includes("/"))
    .map((f) => {
      let raw = f.slice(f.lastIndexOf("/") + 1);
      const q = raw.indexOf("?");
      if (q >= 0) raw = raw.slice(0, q);
      try {
        raw = decodeURIComponent(raw);
      } catch {
        // nome già leggibile
      }
      return raw.endsWith(".xlsx") ? raw : `${raw}.xlsx`;
    });
  if (fileNames.length > 0) {
    try {
      await supabase.storage.from("ordini").remove(fileNames);
    } catch {
      // se la rimozione fallisce l'eliminazione dell'agente prosegue comunque
    }
  }

  // 3) Elimina la riga "agents": gli ordini vengono rimossi in cascata dal DB.
  const { error: delError } = await supabase
    .from("agents")
    .delete()
    .eq("id", agentId);
  if (delError) {
    return {
      error:
        "Account eliminato ma riga agente non rimossa: " + delError.message,
    };
  }

  revalidatePath("/agenti");
  revalidatePath("/console");
  revalidatePath("/dashboard");
  return { success: true, deletedOrders };
}
