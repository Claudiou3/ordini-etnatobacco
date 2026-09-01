"use server";

import { revalidatePath } from "next/cache";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getCurrentAdmin, getCurrentAgent, getSessionUser } from "@/lib/supabase/session";
import { searchCustomers } from "@/lib/customers";
import {
  getOrderCatalog,
  getGiftArticles,
  type OrderGroup,
  type OrderVariant,
} from "@/lib/catalog/order-catalog";
import {
  GIFT_MAX_QTY,
  isValidGiftQty,
  isValidGiftTotal,
} from "@/lib/catalog/gift-rules";
import { calcTrasporto, calcIvaTrasporto, round2 } from "@/lib/shipping";
import { getShippingSettings } from "@/lib/shipping-settings";
import {
  findAnagraficaByKey,
  upsertAnagraficaExcel,
} from "@/lib/anagrafica/file";
import {
  demoUpsertCustomer,
  demoCreateOrder,
} from "@/lib/demo/store";
import {
  fileNextOrderNumber,
  fileCountOrdersByPrefix,
} from "@/lib/orders/store";
import {
  generateOrderWorkbook,
  saveOrderWorkbook,
} from "@/lib/orders/excel";
import { sendOrderEmail } from "@/lib/email/send";
import { isSupabaseConfigured } from "@/lib/settings/runtime";
import { getDataClient } from "@/lib/supabase/data";
import type { OrderDetail } from "@/lib/types";

export type CustomerSearchResult = {
  id: string;
  ragione_sociale: string;
  citta: string | null;
  provincia: string | null;
  partita_iva: string | null;
  codice_fiscale: string | null;
  indirizzo: string | null;
  cap: string | null;
  sdi: string | null;
  cellulare: string | null;
  email: string | null;
};

/**
 * Ricerca cliente per P.IVA, codice fiscale o ragione sociale.
 * Ritorna pochi risultati con la citta' per aiutare a distinguere
 * clienti con nomi simili.
 */
export async function searchCustomersAction(
  query: string
): Promise<CustomerSearchResult[]> {
  // Basta una sessione valida: la ricerca dell'anagrafica e' condivisa e deve
  // funzionare per qualsiasi utente autenticato (admin o agente).
  const user = await getSessionUser();
  if (!user) return [];

  const q = query.trim();
  if (q.length < 2) return [];

  const results = await searchCustomers(q, 20);
  return results.map((c) => ({
    id: c.id,
    ragione_sociale: c.ragione_sociale,
    citta: c.citta,
    provincia: c.provincia,
    partita_iva: c.partita_iva,
    codice_fiscale: c.codice_fiscale,
    indirizzo: c.indirizzo,
    cap: c.cap,
    sdi: c.sdi,
    cellulare: c.cellulare,
    email: c.email,
  }));
}

export type SubmitOrderPayload = {
  cliente: {
    ragione_sociale: string;
    indirizzo: string;
    cap: string;
    citta: string;
    provincia: string;
    partita_iva: string;
    codice_fiscale: string;
    sdi: string;
    cellulare: string;
    email: string;
  };
  data_ordine: string;
  pagamento: string;
  note: string;
  items: { row: number; qty: number }[];
  /** Righe omaggio: totale complessivo massimo GIFT_MAX_QTY pezzi. */
  gift: { row: number; qty: number }[];
};

export type SubmitOrderResult = {
  success?: boolean;
  error?: string;
  numero_ordine?: string;
  fileUrl?: string;
  emailSent?: boolean;
  emailError?: string;
  totale?: number;
};

function flattenCatalog(groups: OrderGroup[]): Map<number, OrderVariant> {
  const map = new Map<number, OrderVariant>();
  for (const group of groups) {
    for (const v of group.variants) map.set(v.row, v);
  }
  return map;
}

/** Prossimo numero progressivo per l'anno corrente. */
async function nextOrderNumber(): Promise<string> {
  if (await isSupabaseConfigured()) {
    const supabase = await getDataClient();
    if (supabase) {
      const year = new Date().getFullYear();
      const prefix = `ORD-${year}-`;
      const { count, error } = await supabase
        .from("orders")
        .select("id", { count: "exact", head: true })
        .like("numero_ordine", `${prefix}%`);
      // Se gli insert precedenti sono finiti sul file (fallback), il conteggio
      // del DB e' piu' basso del reale: considera anche gli ordini su file
      // per evitare numeri duplicati.
      const dbCount = !error && count !== null ? count : 0;
      const fileCount = await fileCountOrdersByPrefix(prefix);
      return `${prefix}${String(Math.max(dbCount, fileCount) + 1).padStart(4, "0")}`;
    }
  }
  return fileNextOrderNumber();
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * L'id cliente puo' arrivare dall'anagrafica Excel ("anag-…") o dallo store
 * demo ("c…"): non e' un uuid. La tabella orders.customer_id e' una FK uuid,
 * quindi senza conversione l'insert su Supabase fallisce e l'ordine finirebbe
 * solo sul file (invisibile all'agente). Qui si cerca il cliente nel DB per
 * P.IVA/CF; se manca lo si crea; in ultima istanza si ritorna null.
 */
async function resolveCustomerUuid(
  supabase: SupabaseClient,
  order: OrderDetail["order"]
): Promise<string | null> {
  const id = order.customer_id ?? "";
  if (UUID_RE.test(id)) return id;

  const piva = (order.partita_iva ?? "").trim();
  const cf = (order.codice_fiscale ?? "").trim();

  const lookup = async (): Promise<string | null> => {
    if (piva) {
      const { data } = await supabase
        .from("customers")
        .select("id")
        .ilike("partita_iva", piva)
        .maybeSingle();
      if (data?.id) return data.id;
    }
    if (cf) {
      const { data } = await supabase
        .from("customers")
        .select("id")
        .ilike("codice_fiscale", cf)
        .maybeSingle();
      if (data?.id) return data.id;
    }
    return null;
  };

  const found = await lookup();
  if (found) return found;

  // Cliente assente in Supabase: crea la riga minima per agganciare l'ordine.
  const { data, error } = await supabase
    .from("customers")
    .insert({
      ragione_sociale: order.customers?.ragione_sociale ?? "Cliente",
      indirizzo: null,
      cap: null,
      citta: null,
      provincia: null,
      partita_iva: piva || null,
      codice_fiscale: cf || null,
      sdi: null,
      cellulare: null,
      email: null,
      // updated_by e' una FK uuid: l'admin locale (id "admin-agent") non lo e'.
      updated_by: UUID_RE.test(order.agent_id ?? "") ? order.agent_id : null,
    })
    .select("id")
    .maybeSingle();
  if (!error && data?.id) return data.id;

  // Possibile conflitto di univocita' (es. casing diverso): riprova la ricerca.
  return lookup();
}

/**
 * Salva ordine + articoli. Con Supabase attivo prova il database;
 * in caso di errore (o in modalita' demo) salva sul file locale.
 */
async function saveOrderDetail(detail: OrderDetail): Promise<void> {
  if (await isSupabaseConfigured()) {
    const supabase = await getDataClient();
    if (supabase) {
      const customer_id = await resolveCustomerUuid(supabase, detail.order);
      const orderRow = {
        agent_id: detail.order.agent_id,
        customer_id,
        numero_ordine: detail.order.numero_ordine,
        data_ordine: detail.order.data_ordine,
        pagamento: detail.order.pagamento,
        imponibile: detail.order.imponibile,
        trasporto: detail.order.trasporto,
        iva: detail.order.iva,
        totale: detail.order.totale,
        file_url: detail.order.file_url,
        partita_iva: detail.order.partita_iva ?? null,
        codice_fiscale: detail.order.codice_fiscale ?? null,
      };
      const { data, error } = await supabase
        .from("orders")
        .insert(orderRow)
        .select("id")
        .single();
      if (!error && data?.id) {
        for (const item of detail.items) {
          await supabase.from("order_items").insert({
            order_id: data.id,
            product_row: item.product_row,
            descrizione: item.descrizione,
            diottria: item.diottria,
            prezzo: item.prezzo,
            sconto: item.sconto,
            iva: item.iva,
            quantita: item.quantita,
            subtotale: item.subtotale,
          });
        }
        return;
      }
    }
  }
  await demoCreateOrder(detail);
}


/**
 * Invia l'ordine: salva cliente + ordine, genera il file Excel del modulo
 * d'ordine compilato e lo trasmette per email alla casella configurata.
 */
export async function submitOrder(
  payload: SubmitOrderPayload
): Promise<SubmitOrderResult> {
  const agent = await getCurrentAgent();
  if (!agent) return { error: "Sessione scaduta. Accedi di nuovo." };
  // I sub-amministratori sono in SOLA LETTURA: non creano ordini.
  const admin = await getCurrentAdmin();
  if (admin?.subAdmin) {
    return { error: "Operazione riservata all'amministratore." };
  }

  const c = payload.cliente;
  const ragioneSociale = c.ragione_sociale.trim();
  if (!ragioneSociale) {
    return { error: "Indica la ragione sociale del cliente." };
  }
  // Campi obbligatori dell'anagrafica: ragione sociale + almeno uno tra
  // P.IVA e codice fiscale (stessa regola dell'import anagrafica).
  if (!c.partita_iva.trim() && !c.codice_fiscale.trim()) {
    return {
      error:
        "Anagrafica cliente incompleta: inserisci la P.IVA o il codice fiscale.",
    };
  }
  if (!c.indirizzo.trim() || !c.cap.trim() || !c.citta.trim() || !c.provincia.trim()) {
    return {
      error:
        "Anagrafica cliente incompleta: inserisci indirizzo, CAP, città e provincia.",
    };
  }
  const dataOrdine = /^\d{4}-\d{2}-\d{2}$/.test(payload.data_ordine)
    ? payload.data_ordine
    : new Date().toISOString().slice(0, 10);

  // Catalogo autorevole (prezzi/sconti ricalcolati lato server)
  const [groups, giftArticles] = await Promise.all([
    getOrderCatalog(),
    getGiftArticles(),
  ]);
  const byRow = flattenCatalog(groups);

  const items: { v: OrderVariant; qty: number }[] = [];
  for (const it of payload.items) {
    const v = byRow.get(it.row);
    if (!v) continue;
    const qty = Math.max(1, Math.min(999, Math.floor(it.qty) || 0));
    if (qty <= 0) continue;
    // Articoli a multipli di 4: vincolo scelto dall'amministratore per articolo.
    if (v.step4 && qty % 4 !== 0) {
      return {
        error: `La quantità di "${v.descrizione}" deve essere un multiplo di 4.`,
      };
    }
    items.push({ v, qty });
  }

  // Righe omaggio: solo articoli ammessi, ogni riga 1..GIFT_MAX_QTY,
  // totale complessivo <= GIFT_MAX_QTY.
  const gifts: { v: OrderVariant; qty: number }[] = [];
  let giftTotal = 0;
  for (const g of payload.gift ?? []) {
    const v = giftArticles.find((x) => x.row === g.row);
    if (!v) continue;
    const qty = Math.floor(g.qty) || 0;
    if (!isValidGiftQty(qty)) continue;
    gifts.push({ v, qty });
    giftTotal += qty;
  }
  if (gifts.length > 0 && !isValidGiftTotal(giftTotal)) {
    return {
      error: `Totale omaggi non valido: massimo ${GIFT_MAX_QTY} pezzi.`,
    };
  }

  if (items.length === 0 && gifts.length === 0) {
    return { error: "Seleziona almeno un articolo dal catalogo." };
  }

  // Calcoli (stesse regole del client)
  const orderId = "ord-" + Date.now();
  let imponibile = 0;
  let iva = 0;
  const orderItems = items.map(({ v, qty }, index) => {
    const sub = round2(v.netto * qty);
    const iv = round2(sub * (v.iva / 100));
    imponibile += sub;
    iva += iv;
    return {
      id: orderId + "-i" + (index + 1),
      order_id: orderId,
      product_row: v.row,
      descrizione: v.descrizione,
      diottria: v.diottria || null,
      prezzo: round2(v.prezzo),
      sconto: round2((v.prezzo - v.netto) * qty),
      iva: v.iva,
      quantita: qty,
      subtotale: sub,
    };
  });

  // Le righe omaggio vengono salvate con importo 0 e marcate "(OMAGGIO)".
  for (const { v, qty } of gifts) {
    orderItems.push({
      id: orderId + "-g" + (orderItems.length + 1),
      order_id: orderId,
      product_row: v.row,
      descrizione: `${v.descrizione} — OMAGGIO`,
      diottria: v.diottria || null,
      prezzo: round2(v.prezzo),
      sconto: round2(v.prezzo),
      iva: v.iva,
      quantita: qty,
      subtotale: 0,
    });
  }

  const shipping = await getShippingSettings();
  const trasporto = calcTrasporto(imponibile, shipping);
  const ivaTrasporto = calcIvaTrasporto(imponibile, shipping);
  const totale = round2(imponibile + iva + trasporto + ivaTrasporto);

  // Upsert anagrafica (file Excel di lavoro + store demo)
  const partitaIva = c.partita_iva.trim();
  const codiceFiscale = c.codice_fiscale.trim();
  const existing = await findAnagraficaByKey(partitaIva, codiceFiscale);

  const anagraficaRecord = {
    ragione_sociale: ragioneSociale,
    indirizzo: c.indirizzo.trim(),
    cap: c.cap.trim(),
    // la citta' del form e' quella di consegna: per i clienti gia' presenti
    // non si sovrascrive la citta' anagrafica; per i nuovi la si salva.
    citta: existing ? "" : c.citta.trim(),
    provincia: c.provincia.trim(),
    partita_iva: partitaIva,
    codice_fiscale: codiceFiscale,
    sdi: c.sdi.trim(),
    cellulare: c.cellulare.trim(),
    email: c.email.trim(),
  };

  const upsert = await upsertAnagraficaExcel(anagraficaRecord);
  let customerId: string | null = existing?.id ?? upsert.id ?? null;

  // Lo store demo serve solo in assenza di Supabase: con il DB attivo non deve
  // sostituire l'id del cliente (quello "c…" non e' un uuid valido per la FK).
  if (!(await isSupabaseConfigured())) {
    const demoCustomer = demoUpsertCustomer({
      ragione_sociale: ragioneSociale,
      indirizzo: anagraficaRecord.indirizzo,
      cap: anagraficaRecord.cap,
      citta: anagraficaRecord.citta,
      provincia: anagraficaRecord.provincia,
      partita_iva: partitaIva,
      codice_fiscale: codiceFiscale,
      sdi: anagraficaRecord.sdi,
      cellulare: anagraficaRecord.cellulare,
      email: anagraficaRecord.email,
    });
    if (demoCustomer.id) customerId = demoCustomer.id;
  }


  // Numero ordine + generazione modulo Excel
  const numero = await nextOrderNumber();
  // Nel campo "AGENTE" del modulo Excel non si espone mai l'email admin.
  const agente =
    agent.id === "admin-agent"
      ? agent.nome
      : `${agent.nome}${agent.email ? ` (${agent.email})` : ""}`;

  let fileUrl: string | null = null;
  let excelBuffer: Buffer | null = null;
  let excelError: string | undefined;
  try {
    excelBuffer = await generateOrderWorkbook({
      numero_ordine: numero,
      data_ordine: dataOrdine,
      agente,
      pagamento: payload.pagamento,
      note: payload.note.trim(),
      cliente: {
        ragione_sociale: ragioneSociale,
        indirizzo: anagraficaRecord.indirizzo,
        cap: anagraficaRecord.cap,
        citta: c.citta.trim(),
        provincia: anagraficaRecord.provincia,
        partita_iva: partitaIva,
        codice_fiscale: codiceFiscale,
        sdi: anagraficaRecord.sdi,
        cellulare: anagraficaRecord.cellulare,
        email: anagraficaRecord.email,
      },
      items: items.map(({ v, qty }) => ({
        row: v.row,
        quantita: qty,
        totaleEscl: round2(v.netto * qty),
        totaleIncl: round2(v.netto * qty * (1 + v.iva / 100)),
      })),
      // Gli omaggi NON sono righe d'ordine: compaiono nel campo note del modulo.
      omaggi: gifts.map(({ v, qty }) => ({
        descrizione: v.descrizione,
        quantita: qty,
      })),
      totali: { imponibile, iva, trasporto, ivaTrasporto, totale },
    });
    fileUrl = await saveOrderWorkbook(numero, excelBuffer);
  } catch (err) {
    excelError = "Errore generazione file Excel: " + (err as Error).message;
  }

  // Salvataggio ordine
  const detail: OrderDetail = {
    order: {
      id: orderId,
      agent_id: agent.id,
      customer_id: customerId,
      numero_ordine: numero,
      data_ordine: dataOrdine,
      pagamento: payload.pagamento,
      imponibile: round2(imponibile),
      trasporto: round2(trasporto),
      iva: round2(iva),
      totale,
      file_url: fileUrl,
      created_at: new Date().toISOString(),
      customers: { ragione_sociale: ragioneSociale },
      // Snapshot: l'ordine conserva i CF/P.IVA del momento della creazione,
      // anche se l'anagrafica verrà in seguito riscritta con valori nuovi.
      partita_iva: partitaIva || null,
      codice_fiscale: codiceFiscale || null,
    },
    items: orderItems,
  };
  await saveOrderDetail(detail);

  revalidatePath("/ordini");
  revalidatePath("/dashboard");
  revalidatePath("/clienti");

  // Invio email con allegato
  let emailResult: Awaited<ReturnType<typeof sendOrderEmail>> | null = null;
  if (excelBuffer) {
    emailResult = await sendOrderEmail({
      subject: `Nuovo ordine ${numero} — ${ragioneSociale}`,
      text: `Ordine ${numero} del ${dataOrdine} per ${ragioneSociale}.\nTotale: € ${totale.toFixed(2)}.\nIn allegato il modulo Excel compilato.`,
      attachment: { filename: `${numero}.xlsx`, content: excelBuffer },
    });
  }

  return {
    success: true,
    numero_ordine: numero,
    fileUrl: fileUrl ?? undefined,
    totale,
    emailSent: emailResult?.sent ?? false,
    emailError: emailResult?.error ?? excelError,
  };
}

