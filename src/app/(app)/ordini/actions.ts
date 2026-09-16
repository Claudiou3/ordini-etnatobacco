"use server";

import { revalidatePath } from "next/cache";
import {
  getCurrentAdmin,
  getCurrentAgent,
} from "@/lib/supabase/session";
import { getDataClient } from "@/lib/supabase/data";
import { isSupabaseConfigured } from "@/lib/settings/runtime";
import { getOrderDetail } from "@/lib/orders";
import { markOrderRead } from "@/lib/orders/read";
import {
  fileDeleteOrder,
  fileCancelOrder,
  fileRestoreOrder,
  deleteOrderExcelFile,
} from "@/lib/orders/store";
import { logOrderDeletion } from "@/lib/orders/delete-log";
import { demoCancelOrder, demoRestoreOrder } from "@/lib/demo/store";

/**
 * Elimina un ordine: operazione DEFINITIVA, riservata all'AMMINISTRATORE
 * PRINCIPALE (in interfaccia il pulsante non compare a nessun altro).
 *
 * Guardia: prima anche l'agente poteva eliminare i propri ordini; ora non piu'
 * (i sub-amministratori erano gia' esclusi). Per correggere un ordine sbagliato
 * si usa "Annulla ordine", che resta visibile, tracciato e non perde nulla.
 *
 * Ogni eliminazione viene annotata nel registro (lib/orders/delete-log.ts) con
 * data/ora, chi l'ha fatta, numero ordine, cliente e totale: l'ordine e il suo
 * file Excel spariscono, ma la traccia resta.
 */
export async function deleteOrderAction(
  orderId: string
): Promise<{ error?: string; success?: boolean }> {
  const agent = await getCurrentAgent();
  if (!agent) return { error: "Sessione scaduta. Accedi di nuovo." };
  const admin = await getCurrentAdmin();
  if (!admin || admin.subAdmin) {
    return { error: "Eliminazione riservata all'amministratore." };
  }

  const detail = await getOrderDetail(orderId, agent.id);
  if (!detail) return { error: "Ordine non trovato." };

  const numero = detail.order.numero_ordine;
  // Il file Excel ora si chiama "agente - cliente": per eliminarlo si usa
  // l'URL salvato sull'ordine (fallback: vecchio nome con il numero ordine).
  const fileRef = detail.order.file_url || numero;

  // Registro delle eliminazioni: si salva PRIMA di rimuovere, cosi' la traccia
  // resta anche se l'ordine (e il suo file) vengono cancellati.
  await logOrderDeletion({
    at: new Date().toISOString(),
    by: admin.email || "amministratore",
    numero_ordine: numero,
    cliente: detail.order.customers?.ragione_sociale ?? "",
    totale: Number(detail.order.totale ?? 0),
  });

  // Database (Supabase): l'amministratore elimina qualsiasi ordine.
  if (await isSupabaseConfigured()) {
    const supabase = await getDataClient();
    if (supabase) {
      const { data, error } = await supabase
        .from("orders")
        .delete()
        .eq("id", orderId)
        .select("id");
      // Eliminato davvero dal database: rimuovi anche il file Excel e via.
      if (!error && data && data.length > 0) {
        await deleteOrderExcelFile(fileRef);
        revalidatePath("/ordini");
        return { success: true };
      }
      // Se il database non conteneva l'ordine (es. ordini dell'amministratore
      // salvati sul file locale), si procede con il file.
    }
  }

  // Ordini salvati localmente (modalita' demo / ordini dell'amministratore).
  await fileDeleteOrder(orderId);
  await deleteOrderExcelFile(fileRef);

  revalidatePath("/ordini");
  return { success: true };
}

export type CancelOrderState = {
  error?: string;
  success?: boolean;
  orderId?: string;
};

const MAX_MOTIVO = 500;

/**
 * ANNULLA un ordine (solo amministratore principale): l'ordine resta
 * visibile ma viene marcato come "annullato" con la motivazione inserita.
 * - Per l'agente compare in grigio scuro con la motivazione;
 * - NON vengono calcolate provvigioni per l'ordine annullato.
 * L'annullamento viene salvato sia nel database (se presente) sia sul file
 * locale, così resta coerente anche per gli ordini salvati solo su file.
 */
export async function cancelOrderAction(
  orderId: string,
  motivo: string
): Promise<CancelOrderState> {
  const admin = await getCurrentAdmin();
  if (!admin || admin.subAdmin) {
    return { error: "Operazione riservata all'amministratore." };
  }
  const motivoClean = motivo.trim();
  if (!motivoClean) {
    return { error: "Inserisci la motivazione dell'annullamento." };
  }
  if (motivoClean.length > MAX_MOTIVO) {
    return {
      error: `Motivazione troppo lunga (massimo ${MAX_MOTIVO} caratteri).`,
    };
  }

  const agent = await getCurrentAgent();
  if (!agent) return { error: "Sessione scaduta. Accedi di nuovo." };

  const detail = await getOrderDetail(orderId, agent.id);
  if (!detail) return { error: "Ordine non trovato." };
  if (detail.order.stato === "annullato") {
    return { error: "L'ordine è già stato annullato." };
  }

  const now = new Date().toISOString();

  // Database (Supabase): aggiorna stato e motivazione.
  if (await isSupabaseConfigured()) {
    const supabase = await getDataClient();
    if (supabase) {
      await supabase
        .from("orders")
        .update({
          stato: "annullato",
          annullamento_motivo: motivoClean,
          annullato_at: now,
        })
        .eq("id", orderId);
    }
  } else {
    demoCancelOrder(orderId, motivoClean);
  }

  // Copia su file: mantiene coerenti gli ordini salvati solo localmente
  // (modalità demo / ordini dell'amministratore).
  await fileCancelOrder(orderId, motivoClean);

  revalidatePath("/ordini");
  revalidatePath("/dashboard");
  revalidatePath("/console");
  revalidatePath("/agenti");
  return { success: true, orderId };
}

export type ConfirmOrderState = {
  error?: string;
  success?: boolean;
};

/**
 * Conferma un ordine appena arrivato (solo amministratore PRINCIPALE):
 * lo sposta da "Non Confermati" a "Confermati". L'apertura dell'ordine
 * da sola NON basta piu': serve questo passaggio esplicito.
 */
export async function confirmOrderAction(
  orderId: string
): Promise<ConfirmOrderState> {
  const admin = await getCurrentAdmin();
  if (!admin || admin.subAdmin) {
    return { error: "Operazione riservata all'amministratore." };
  }

  const saved = await markOrderRead(orderId);
  if (!saved) {
    return {
      error:
        "Conferma non salvata (Supabase non raggiungibile). Riprova tra qualche secondo.",
    };
  }

  revalidatePath("/ordini");
  revalidatePath("/console");
  revalidatePath("/dashboard");
  return { success: true };
}

/**
 * RIPRISTINA un ordine annullato (solo amministratore principale): torna
 * "attivo", la motivazione viene rimossa e le provvigioni tornano ad essere
 * conteggiate. Utile in caso di annullamento per errore.
 */
export async function restoreOrderAction(
  orderId: string
): Promise<CancelOrderState> {
  const admin = await getCurrentAdmin();
  if (!admin || admin.subAdmin) {
    return { error: "Operazione riservata all'amministratore." };
  }

  const agent = await getCurrentAgent();
  if (!agent) return { error: "Sessione scaduta. Accedi di nuovo." };

  const detail = await getOrderDetail(orderId, agent.id);
  if (!detail) return { error: "Ordine non trovato." };
  if (detail.order.stato !== "annullato") {
    return { error: "L'ordine non è annullato." };
  }

  if (await isSupabaseConfigured()) {
    const supabase = await getDataClient();
    if (supabase) {
      await supabase
        .from("orders")
        .update({
          stato: "attivo",
          annullamento_motivo: null,
          annullato_at: null,
        })
        .eq("id", orderId);
    }
  } else {
    demoRestoreOrder(orderId);
  }

  await fileRestoreOrder(orderId);

  revalidatePath("/ordini");
  revalidatePath("/dashboard");
  revalidatePath("/console");
  revalidatePath("/agenti");
  return { success: true, orderId };
}
