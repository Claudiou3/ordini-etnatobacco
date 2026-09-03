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
import { demoCancelOrder, demoRestoreOrder } from "@/lib/demo/store";

/**
 * Elimina un ordine.
 * - L'amministratore puo' eliminare QUALSIASI ordine della piattaforma.
 * - L'agente puo' eliminare SOLO i propri ordini.
 * L'ordine viene rimosso dal database (o dal file locale) e, se presente,
 * anche il file Excel corrispondente in data/orders/.
 */
export async function deleteOrderAction(
  orderId: string
): Promise<{ error?: string; success?: boolean }> {
  const agent = await getCurrentAgent();
  if (!agent) return { error: "Sessione scaduta. Accedi di nuovo." };
  const admin = await getCurrentAdmin();
  const isAdmin = Boolean(admin);
  // I sub-amministratori sono in sola lettura: non eliminano ordini.
  if (admin?.subAdmin) {
    return { error: "Operazione riservata all'amministratore." };
  }

  const detail = await getOrderDetail(orderId, agent.id);
  if (!detail) return { error: "Ordine non trovato." };
  if (!isAdmin && detail.order.agent_id !== agent.id) {
    return { error: "Non puoi eliminare l'ordine di un altro agente." };
  }

  const numero = detail.order.numero_ordine;
  // Il file Excel ora si chiama "agente - cliente": per eliminarlo si usa
  // l'URL salvato sull'ordine (fallback: vecchio nome con il numero ordine).
  const fileRef = detail.order.file_url || numero;

  // Database (Supabase): l'agente elimina solo i propri (RLS), l'admin tutti.
  if (await isSupabaseConfigured()) {
    const supabase = await getDataClient();
    if (supabase) {
      let query = supabase.from("orders").delete().eq("id", orderId);
      if (!isAdmin) query = query.eq("agent_id", agent.id);
      const { data, error } = await query.select("id");
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

  await markOrderRead(orderId);

  revalidatePath("/ordini");
  revalidatePath("/console");
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
