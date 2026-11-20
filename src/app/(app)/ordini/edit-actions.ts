"use server";

import { revalidatePath } from "next/cache";
import { getCurrentAdmin } from "@/lib/supabase/session";
import { getOrderDetail } from "@/lib/orders";
import {
  getOrderCatalog,
  getGiftArticles,
  type OrderVariant,
} from "@/lib/catalog/order-catalog";
import { getShippingSettings } from "@/lib/shipping-settings";
import type { ShippingSettings } from "@/lib/shipping";
import { round2 } from "@/lib/shipping";
import {
  generateOrderWorkbook,
  saveOrderWorkbook,
  sanitizeFileBase,
} from "@/lib/orders/excel";
import { fileUpdateOrderDetail } from "@/lib/orders/store";
import {
  getOrderAnagrafica,
  effectiveOrderAnagrafica,
  normalizeOrderAnagrafica,
  saveOrderAnagrafica,
  type OrderAnagrafica,
} from "@/lib/orders/order-anagrafica";
import { getOrderContactWithRecovery } from "@/lib/orders/order-contact";
import {
  appendOrderEditLog,
  applyOrderEditToDb,
  computeOrderEdit,
  getOrderExtra,
  isGiftLine,
  overwriteOrderWorkbook,
  readExcelAgentAndNote,
  readOrderExcelBuffer,
  saveOrderExtra,
  storedDiscountPct,
} from "@/lib/orders/order-edit";
import { sendOrderEmail } from "@/lib/email/send";
import { orderEditSchema } from "@/lib/validation";

/**
 * MODIFICA ORDINE (solo AMMINISTRATORE PRINCIPALE).
 * Tutto il codice di questo file e' nuovo e isolato: non cambia il
 * comportamento di invio ordine, annullamento, anagrafica o provvigioni.
 */

function flatten(groups: Awaited<ReturnType<typeof getOrderCatalog>>) {
  const map = new Map<number, OrderVariant>();
  for (const g of groups) for (const v of g.variants) map.set(v.row, v);
  return map;
}

export type EditCatalogItem = {
  row: number;
  descrizione: string;
  diottria: string;
  prezzo: number;
  iva: number;
  pct: number;
  step4: boolean;
};

export type OrderEditData = {
  numero_ordine: string;
  cliente: string;
  hasFile: boolean;
  anagrafica: OrderAnagrafica;
  pec: string;
  cmnr: string;
  note: string;
  items: {
    id: string;
    row: number;
    descrizione: string;
    diottria: string;
    prezzo: number;
    iva: number;
    qty: number;
    pct: number;
    catPct: number | null;
    subtotale: number;
    step4: boolean;
  }[];
  gifts: { id: string; row: number; descrizione: string; qty: number }[];
  catalog: EditCatalogItem[];
  giftCatalog: EditCatalogItem[];
  shipping: ShippingSettings;
};

function toCatalogItem(v: OrderVariant): EditCatalogItem {
  return {
    row: v.row,
    descrizione: v.descrizione,
    diottria: v.diottria,
    prezzo: v.prezzo,
    iva: v.iva,
    pct: round2(v.sconto * 100),
    step4: v.step4,
  };
}

/** Dati per precompilare la finestra "Modifica ordine". */
export async function getOrderEditDataAction(
  orderId: string
): Promise<{ error: string } | { data: OrderEditData }> {
  const admin = await getCurrentAdmin();
  if (!admin || admin.subAdmin) {
    return { error: "Operazione riservata all'amministratore." };
  }
  const detail = await getOrderDetail(orderId, "admin-agent");
  if (!detail) return { error: "Ordine non trovato." };
  const { order, items } = detail;
  if (order.stato === "annullato") {
    return {
      error:
        "Ordine annullato: per modificarlo ripristinalo prima con «Ripristina ordine».",
    };
  }

  const [groups, giftArticles, shipping, override, contatto, extra] =
    await Promise.all([
      getOrderCatalog(),
      getGiftArticles(),
      getShippingSettings(),
      getOrderAnagrafica(order.id),
      getOrderContactWithRecovery(order.id, order.file_url),
      getOrderExtra(order.id),
    ]);
  const byRow = flatten(groups);

  const anagrafica = effectiveOrderAnagrafica(
    {
      ragione_sociale: order.customers?.ragione_sociale ?? "",
      indirizzo: order.customers?.indirizzo ?? "",
      cap: order.customers?.cap ?? "",
      citta: order.customers?.citta ?? "",
      provincia: order.customers?.provincia ?? "",
      partita_iva: order.partita_iva ?? order.customers?.partita_iva ?? "",
      codice_fiscale:
        order.codice_fiscale ?? order.customers?.codice_fiscale ?? "",
      sdi: order.customers?.sdi ?? "",
      cellulare: contatto?.cellulare || order.customers?.cellulare || "",
      email: contatto?.email || order.customers?.email || "",
    },
    override
  );

  // Note: quelle salvate dall'amministratore, altrimenti quelle scritte
  // dall'agente nel modulo Excel (campo note, senza il blocco OMAGGI).
  let note = extra?.note ?? "";
  if (!extra) {
    const fromExcel = await readExcelAgentAndNote(order.file_url);
    note = fromExcel?.note ?? "";
  }

  return {
    data: {
      numero_ordine: order.numero_ordine,
      cliente: anagrafica.ragione_sociale,
      hasFile: Boolean(order.file_url),
      anagrafica,
      pec: extra?.pec ?? "",
      cmnr: extra?.cmnr ?? "",
      note,
      items: items
        .filter((i) => !isGiftLine(i))
        .map((i) => {
          const cat = i.product_row != null ? byRow.get(i.product_row) : undefined;
          return {
            id: i.id,
            row: i.product_row ?? 0,
            descrizione: i.descrizione,
            diottria: i.diottria ?? "",
            prezzo: i.prezzo,
            iva: i.iva,
            qty: i.quantita,
            pct: storedDiscountPct(i),
            catPct: cat ? round2(cat.sconto * 100) : null,
            subtotale: i.subtotale,
            step4: Boolean(cat?.step4),
          };
        }),
      gifts: items
        .filter((i) => isGiftLine(i))
        .map((i) => ({
          id: i.id,
          row: i.product_row ?? 0,
          descrizione: i.descrizione.replace(/ — OMAGGIO\s*$/, ""),
          qty: i.quantita,
        })),
      catalog: Array.from(byRow.values()).map(toCatalogItem),
      giftCatalog: giftArticles.map(toCatalogItem),
      shipping,
    },
  };
}

export type SaveOrderEditState = {
  error?: string;
  success?: boolean;
  warning?: string;
};

/** Salva la modifica completa di un ordine e rigenera il modulo Excel. */
export async function saveOrderEditAction(
  payload: unknown
): Promise<SaveOrderEditState> {
  const admin = await getCurrentAdmin();
  if (!admin || admin.subAdmin) {
    return { error: "Operazione riservata all'amministratore." };
  }

  const parsed = orderEditSchema.safeParse(payload);
  if (!parsed.success) {
    return {
      error:
        "Controlla i dati inseriti: la ragione sociale è obbligatoria, l'email deve essere valida e le quantità/sconti numerici.",
    };
  }
  const input = parsed.data;
  const orderId = input.order_id;

  const detail = await getOrderDetail(orderId, "admin-agent");
  if (!detail) return { error: "Ordine non trovato." };
  const { order, items: storedItems } = detail;
  if (order.stato === "annullato") {
    return {
      error:
        "Ordine annullato: modifica bloccata. Ripristina prima l'ordine.",
    };
  }

  const [groups, giftArticles, shipping] = await Promise.all([
    getOrderCatalog(),
    getGiftArticles(),
    getShippingSettings(),
  ]);
  const comp = computeOrderEdit({
    input,
    stored: storedItems,
    catalog: flatten(groups),
    giftCatalog: new Map(giftArticles.map((g) => [g.row, g])),
    shipping,
  });
  if ("error" in comp) return { error: comp.error };

  const anag = input.anagrafica;
  const cliente = normalizeOrderAnagrafica({
    ragione_sociale: anag.ragione_sociale,
    indirizzo: anag.indirizzo ?? "",
    cap: anag.cap ?? "",
    citta: anag.citta ?? "",
    provincia: anag.provincia ?? "",
    partita_iva: anag.partita_iva ?? "",
    codice_fiscale: anag.codice_fiscale ?? "",
    sdi: anag.sdi ?? "",
    cellulare: anag.cellulare ?? "",
    email: anag.email ?? "",
  });

  // 1) Rigenera il modulo Excel IN MEMORIA: se fallisce non si tocca nulla.
  const previousExcel = await readExcelAgentAndNote(order.file_url);
  const noteText = [
    input.note,
    input.pec ? `PEC: ${input.pec}` : "",
    input.cmnr ? `CMNR: ${input.cmnr}` : "",
  ]
    .filter(Boolean)
    .join("\n");
  let buffer: Buffer;
  try {
    buffer = await generateOrderWorkbook({
      numero_ordine: order.numero_ordine,
      data_ordine: String(order.data_ordine).slice(0, 10),
      agente: previousExcel?.agente ?? "",
      pagamento: order.pagamento ?? "",
      note: noteText,
      cliente,
      items: comp.excelItems,
      omaggi: comp.omaggi,
      totali: {
        imponibile: comp.imponibile,
        iva: comp.iva,
        trasporto: comp.trasporto,
        ivaTrasporto: comp.ivaTrasporto,
        totale: comp.totale,
      },
    });
  } catch (err) {
    return {
      error:
        "Errore generazione file Excel (ordine non modificato): " +
        (err as Error).message,
    };
  }

  // 2) Fotografia dell'ordine PRIMA della modifica (per poter tornare indietro).
  const logged = await appendOrderEditLog(orderId, {
    at: new Date().toISOString(),
    by: admin.email || null,
    before: {
      imponibile: order.imponibile,
      trasporto: order.trasporto,
      iva: order.iva,
      totale: order.totale,
      file_url: order.file_url,
      items: storedItems.map((i) => ({
        id: i.id,
        product_row: i.product_row,
        descrizione: i.descrizione,
        diottria: i.diottria,
        prezzo: i.prezzo,
        sconto: i.sconto,
        iva: i.iva,
        quantita: i.quantita,
        subtotale: i.subtotale,
      })),
    },
  });
  if (!logged) {
    return {
      error:
        "Registro modifiche non salvato (Supabase non raggiungibile): ordine non modificato. Riprova.",
    };
  }

  // 3) Se l'ordine non ha ancora un file, se ne crea uno nuovo.
  let fileUrl = order.file_url;
  let createdFile = false;
  if (!fileUrl) {
    try {
      fileUrl = await saveOrderWorkbook(
        sanitizeFileBase(`Ordine ${order.numero_ordine} - ${cliente.ragione_sociale}`),
        buffer
      );
      createdFile = true;
    } catch {
      fileUrl = null;
    }
  }

  // 4) Scrittura righe e totali: Supabase, altrimenti file locale.
  const header = {
    imponibile: comp.imponibile,
    trasporto: comp.trasporto,
    iva: comp.iva,
    totale: comp.totale,
  };
  const previousHeader = {
    imponibile: order.imponibile,
    trasporto: order.trasporto,
    iva: order.iva,
    totale: order.totale,
  };
  const db = await applyOrderEditToDb(
    orderId,
    { ...header, file_url: createdFile ? fileUrl : null },
    previousHeader,
    comp.lines,
    storedItems.map((i) => i.id)
  );
  if (typeof db === "object") return { error: db.error };
  if (db === "absent") {
    const ok = await fileUpdateOrderDetail(orderId, {
      order: { ...header, ...(createdFile ? { file_url: fileUrl } : {}) },
      items: comp.lines.map((l, idx) => ({
        ...l,
        id: `${orderId}-e${idx + 1}`,
        order_id: orderId,
      })),
    });
    if (!ok) {
      return {
        error:
          "Questo ordine (esempio) non è salvato né su database né su file: non modificabile.",
      };
    }
  }

  // 5) Anagrafica dell'ordine + PEC/CMNR/note (copie legate all'ordine).
  const savedAnag = await saveOrderAnagrafica(orderId, cliente, admin.email || null);
  const savedExtra = await saveOrderExtra(
    orderId,
    { pec: input.pec, cmnr: input.cmnr, note: input.note },
    admin.email || null
  );

  // 6) Sovrascrive il modulo Excel (stesso nome file).
  let warning: string | undefined;
  if (!createdFile) {
    if (fileUrl) {
      try {
        await overwriteOrderWorkbook(fileUrl, buffer);
      } catch (err) {
        warning =
          "Ordine aggiornato, ma il file Excel NON è stato rigenerato: " +
          (err as Error).message;
      }
    } else {
      warning = "Ordine aggiornato, ma non è stato possibile creare il file Excel.";
    }
  }
  if (!savedAnag || !savedExtra) {
    warning =
      (warning ? warning + " " : "") +
      "Anagrafica/note dell'ordine non salvate (Supabase non raggiungibile): ripeti il salvataggio.";
  }

  revalidatePath(`/ordini/${orderId}`);
  revalidatePath("/ordini");
  revalidatePath("/console");
  revalidatePath("/dashboard");
  revalidatePath("/agenti");
  return { success: true, warning };
}

/** Rispedisce all'ufficio l'email con il modulo Excel AGGIORNATO (manuale). */
export async function resendOrderEmailAction(
  orderId: string
): Promise<{ error?: string; success?: boolean; recipient?: string }> {
  const admin = await getCurrentAdmin();
  if (!admin || admin.subAdmin) {
    return { error: "Operazione riservata all'amministratore." };
  }
  const detail = await getOrderDetail(orderId, "admin-agent");
  if (!detail) return { error: "Ordine non trovato." };
  const { order } = detail;

  const file = await readOrderExcelBuffer(order.file_url);
  if (!file) return { error: "File Excel dell'ordine non trovato." };

  const override = await getOrderAnagrafica(order.id);
  const cliente =
    override?.ragione_sociale || order.customers?.ragione_sociale || "Cliente";

  const result = await sendOrderEmail({
    subject: `Ordine AGGIORNATO ${order.numero_ordine} — ${cliente}`,
    text:
      `Ordine ${order.numero_ordine} per ${cliente} modificato dall'amministratore.\n` +
      `Totale: € ${Number(order.totale).toFixed(2)}.\n` +
      `In allegato il modulo Excel aggiornato.`,
    attachment: { filename: file.fileName, content: file.buffer },
  });
  if (!result.sent) {
    return { error: result.error ?? "Email non inviata." };
  }
  return { success: true, recipient: result.recipient };
}
