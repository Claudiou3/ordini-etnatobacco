import type { Customer, OrderDetail, OrderListItem } from "@/lib/types";
import type { OrderStats } from "@/lib/orders";
import type { CustomerInput } from "@/lib/validation";
import {
  fileListOrders,
  fileGetOrderDetail,
  fileCreateOrder,
} from "@/lib/orders/store";
import { sortOrdersByArrival } from "@/lib/orders/sort";

/**
 * Store in-memory per la MODALITA' DEMO.
 * Attivo SOLO quando Supabase non e' configurato: consente di provare
 * dashboard, clienti (CRUD) e ordini senza servizi esterni.
 * I dati sono volatili (si azzerano riavviando il server).
 */

const DEMO_AGENT_ID = "demo-agent";

let customers: Customer[] = [
  {
    id: "c1",
    ragione_sociale: "Ottica Verdi SRL",
    indirizzo: "Via Roma 12",
    cap: "20121",
    citta: "Milano",
    provincia: "MI",
    partita_iva: "09876543210",
    codice_fiscale: null,
    sdi: "M5UXCR1",
    cellulare: "333 1234567",
    email: "info@otticaverdi.it",
    updated_at: "2026-08-20T09:30:00.000Z",
    updated_by: DEMO_AGENT_ID,
    created_at: "2026-08-01T09:30:00.000Z",
  },
  {
    id: "c2",
    ragione_sociale: "Vision Center Snc",
    indirizzo: "Corso Vittorio Emanuele 88",
    cap: "00186",
    citta: "Roma",
    provincia: "RM",
    partita_iva: "01360841215",
    codice_fiscale: null,
    sdi: "0000000",
    cellulare: null,
    email: "visioncenter@pec.it",
    updated_at: "2026-08-19T11:10:00.000Z",
    updated_by: DEMO_AGENT_ID,
    created_at: "2026-08-01T11:10:00.000Z",
  },
  {
    id: "c3",
    ragione_sociale: "Lenti & Co. di Russo M.",
    indirizzo: "Via dei Mercanti 5",
    cap: "95100",
    citta: "Catania",
    provincia: "CT",
    partita_iva: "02091670873",
    codice_fiscale: "RSSMRA57T66H922S",
    sdi: "M5UXCR1",
    cellulare: "095 123456",
    email: "russo@lentieco.it",
    updated_at: "2026-08-18T15:45:00.000Z",
    updated_by: DEMO_AGENT_ID,
    created_at: "2026-08-02T15:45:00.000Z",
  },
  {
    id: "c4",
    ragione_sociale: "Sicula Petroli Srl",
    indirizzo: "V. Necropoli del Fusco sn",
    cap: "96100",
    citta: "Siracusa",
    provincia: "SR",
    partita_iva: "01667930893",
    codice_fiscale: null,
    sdi: "M5UXCR1",
    cellulare: null,
    email: "cardillo.r@etnatobacco.com",
    updated_at: "2026-08-15T08:00:00.000Z",
    updated_by: DEMO_AGENT_ID,
    created_at: "2026-08-03T08:00:00.000Z",
  },
  {
    id: "c5",
    ragione_sociale: "Ottica Centrale Sas",
    indirizzo: "Piazza Garibaldi 3",
    cap: "80142",
    citta: "Napoli",
    provincia: "NA",
    partita_iva: "04481270876",
    codice_fiscale: null,
    sdi: "0000000",
    cellulare: "081 555123",
    email: "centralenapoli@tiscali.it",
    updated_at: "2026-08-12T17:20:00.000Z",
    updated_by: DEMO_AGENT_ID,
    created_at: "2026-08-05T17:20:00.000Z",
  },
];

const orders: OrderDetail[] = [
  {
    order: {
      id: "o1",
      agent_id: DEMO_AGENT_ID,
      customer_id: "c1",
      numero_ordine: "ORD-2026-0012",
      data_ordine: "2026-08-24",
      pagamento: "Bonifico",
      imponibile: 1020.0,
      trasporto: 0,
      iva: 224.4,
      totale: 1244.4,
      file_url: null,
      created_at: "2026-08-24T09:00:00.000Z",
      customers: { ragione_sociale: "Ottica Verdi SRL" },
    },
    items: [
      {
        id: "i1",
        order_id: "o1",
        product_row: 1,
        descrizione: "Lente progressiva Freedom",
        diottria: "+1.75",
        prezzo: 420.0,
        sconto: 40.0,
        iva: 22,
        quantita: 2,
        subtotale: 760.0,
      },
      {
        id: "i2",
        order_id: "o1",
        product_row: 2,
        descrizione: "Trattamento antiriflesso Premium",
        diottria: null,
        prezzo: 120.0,
        sconto: 0,
        iva: 22,
        quantita: 1,
        subtotale: 120.0,
      },
    ],
  },
  {
    order: {
      id: "o2",
      agent_id: DEMO_AGENT_ID,
      customer_id: "c2",
      numero_ordine: "ORD-2026-0011",
      data_ordine: "2026-08-22",
      pagamento: "RID",
      imponibile: 700.0,
      trasporto: 0,
      iva: 154.0,
      totale: 854.0,
      file_url: null,
      created_at: "2026-08-22T10:30:00.000Z",
      customers: { ragione_sociale: "Vision Center Snc" },
    },
    items: [
      {
        id: "i3",
        order_id: "o2",
        product_row: 1,
        descrizione: "Lente monofocale Air",
        diottria: "-2.25",
        prezzo: 180.0,
        sconto: 18.0,
        iva: 22,
        quantita: 3,
        subtotale: 486.0,
      },
    ],
  },
  {
    order: {
      id: "o3",
      agent_id: DEMO_AGENT_ID,
      customer_id: "c3",
      numero_ordine: "ORD-2026-0010",
      data_ordine: "2026-08-19",
      pagamento: "Contanti",
      imponibile: 1725.0,
      trasporto: 15.0,
      iva: 382.8,
      totale: 2122.8,
      file_url: null,
      created_at: "2026-08-19T16:00:00.000Z",
      customers: { ragione_sociale: "Lenti & Co. di Russo M." },
    },
    items: [
      {
        id: "i4",
        order_id: "o3",
        product_row: 1,
        descrizione: "Lente progressiva Freedom",
        diottria: "+2.00",
        prezzo: 420.0,
        sconto: 0,
        iva: 22,
        quantita: 3,
        subtotale: 1260.0,
      },
      {
        id: "i5",
        order_id: "o3",
        product_row: 2,
        descrizione: "Occhiale solare Polar",
        diottria: null,
        prezzo: 155.0,
        sconto: 15.0,
        iva: 22,
        quantita: 2,
        subtotale: 280.0,
      },
    ],
  },
];

function nowIso(): string {
  return new Date().toISOString();
}

function toListItems(): OrderListItem[] {
  return sortOrdersByArrival(
    orders.map((detail) => {
      const customer = customers.find((c) => c.id === detail.order.customer_id);
      return {
        id: detail.order.id,
        numero_ordine: detail.order.numero_ordine,
        data_ordine: detail.order.data_ordine,
        created_at: detail.order.created_at,
        totale: Number(detail.order.totale),
        pagamento: detail.order.pagamento,
        file_url: detail.order.file_url,
        customers: customer ? { ragione_sociale: customer.ragione_sociale } : null,
        stato: detail.order.stato ?? null,
        annullamento_motivo: detail.order.annullamento_motivo ?? null,
        annullato_at: detail.order.annullato_at ?? null,
      };
    })
  );
}

export function demoCountCustomers(): number {
  return customers.length;
}

export function demoSearchCustomers(query: string, limit = 50): Customer[] {
  const q = query.trim().toLowerCase();
  if (!q) {
    return [...customers]
      .sort((a, b) => a.ragione_sociale.localeCompare(b.ragione_sociale))
      .slice(0, limit);
  }
  return customers
    .filter((c) =>
      [c.ragione_sociale, c.partita_iva ?? "", c.codice_fiscale ?? "", c.citta ?? ""]
        .join(" ")
        .toLowerCase()
        .includes(q)
    )
    .sort((a, b) => a.ragione_sociale.localeCompare(b.ragione_sociale))
    .slice(0, limit);
}

export function demoCreateCustomer(data: CustomerInput): { error?: string; success?: boolean } {
  const duplicate = customers.find(
    (c) =>
      (data.partita_iva && c.partita_iva === data.partita_iva) ||
      (data.codice_fiscale && c.codice_fiscale === data.codice_fiscale)
  );
  if (duplicate) {
    return { error: "Esiste già un cliente con questa P.IVA o codice fiscale." };
  }
  customers.push({
    id: "c" + Date.now(),
    ragione_sociale: data.ragione_sociale,
    indirizzo: data.indirizzo || null,
    cap: data.cap || null,
    citta: data.citta || null,
    provincia: data.provincia || null,
    partita_iva: data.partita_iva || null,
    codice_fiscale: data.codice_fiscale || null,
    sdi: data.sdi || null,
    cellulare: data.cellulare || null,
    email: data.email || null,
    updated_at: nowIso(),
    updated_by: DEMO_AGENT_ID,
    created_at: nowIso(),
  });
  return { success: true };
}

export function demoUpdateCustomer(
  id: string,
  data: CustomerInput
): { error?: string; success?: boolean } {
  const customer = customers.find((c) => c.id === id);
  if (!customer) return { error: "Cliente non trovato." };
  Object.assign(customer, {
    ragione_sociale: data.ragione_sociale,
    indirizzo: data.indirizzo || null,
    cap: data.cap || null,
    citta: data.citta || null,
    provincia: data.provincia || null,
    partita_iva: data.partita_iva || null,
    codice_fiscale: data.codice_fiscale || null,
    sdi: data.sdi || null,
    cellulare: data.cellulare || null,
    email: data.email || null,
    updated_at: nowIso(),
    updated_by: DEMO_AGENT_ID,
  });
  return { success: true };
}

export function demoDeleteCustomer(id: string): void {
  customers = customers.filter((c) => c.id !== id);
}

/**
 * Inserisce o aggiorna un cliente nello store demo (ricercato per P.IVA/CF).
 * Usato quando si salva un ordine o un nuovo cliente dalla sezione Clienti.
 */
export function demoUpsertCustomer(
  data: CustomerInput
): { error?: string; success?: boolean; id?: string } {
  const existing = customers.find(
    (c) =>
      (data.partita_iva && c.partita_iva === data.partita_iva) ||
      (data.codice_fiscale && c.codice_fiscale === data.codice_fiscale)
  );
  if (existing) {
    const res = demoUpdateCustomer(existing.id, data);
    return { ...res, id: existing.id };
  }
  return demoCreateCustomer(data);
}

export async function demoGetStats(): Promise<OrderStats> {
  const firstOfMonth = new Date();
  firstOfMonth.setDate(1);
  const iso = firstOfMonth.toISOString().slice(0, 10);

  const seedMonth = orders.filter((d) => d.order.data_ordine >= iso);
  const fileOrders = await fileListOrders(1000);

  const allMonth = [
    ...seedMonth.map((d) => d.order),
    ...fileOrders.filter((o) => o.data_ordine >= iso),
  ];

  return {
    ordersMonth: allMonth.length,
    customersCount: customers.length,
    valueMonth: allMonth.reduce((sum, d) => sum + Number(d.totale), 0),
  };
}

function mergeOrders(a: OrderListItem[], b: OrderListItem[]): OrderListItem[] {
  const seen = new Set<string>();
  const out: OrderListItem[] = [];
  for (const o of [...a, ...b]) {
    if (seen.has(o.id)) continue;
    seen.add(o.id);
    out.push(o);
  }
  // Ordine di ARRIVO: l'ultimo ordine trasmesso e' il primo della lista.
  return sortOrdersByArrival(out).slice(0, 100);
}

export async function demoRecentOrders(limit = 5): Promise<OrderListItem[]> {
  return (await demoGetOrders(limit)).slice(0, limit);
}

export async function demoGetOrders(limit = 100): Promise<OrderListItem[]> {
  const fileOrders = await fileListOrders(limit);
  return mergeOrders(toListItems(), fileOrders).slice(0, limit);
}

export async function demoGetOrderDetail(orderId: string): Promise<OrderDetail | null> {
  const seed = orders.find((d) => d.order.id === orderId) ?? null;
  if (seed) return seed;
  return fileGetOrderDetail(orderId);
}

/** Crea un ordine in modalita' demo (salvato su file JSON). */
export async function demoCreateOrder(detail: OrderDetail): Promise<void> {
  await fileCreateOrder(detail);
}

/**
 * Marca un ordine demo come ANNULLATO con la motivazione (ordini in memoria,
 * seed di esempio). Ritorna false se l'ordine non esiste.
 */
export function demoCancelOrder(orderId: string, motivo: string): boolean {
  const detail = orders.find((d) => d.order.id === orderId);
  if (!detail) return false;
  detail.order.stato = "annullato";
  detail.order.annullamento_motivo = motivo;
  detail.order.annullato_at = new Date().toISOString();
  return true;
}

/** Ripristina un ordine demo annullato (torna "attivo", motivazione rimossa). */
export function demoRestoreOrder(orderId: string): boolean {
  const detail = orders.find((d) => d.order.id === orderId);
  if (!detail) return false;
  detail.order.stato = "attivo";
  detail.order.annullamento_motivo = null;
  detail.order.annullato_at = null;
  return true;
}
