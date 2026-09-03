import { getDataClient } from "@/lib/supabase/data";
import { getCurrentAdmin } from "@/lib/supabase/session";
import { isSupabaseConfigured } from "@/lib/settings/runtime";
import {
  fileListOrders,
  fileGetOrderDetail,
} from "@/lib/orders/store";
import { getReadOrderIds } from "@/lib/orders/read";
import { sortOrdersByArrival } from "@/lib/orders/sort";
import {
  demoGetStats,
  demoRecentOrders,
  demoGetOrders,
  demoGetOrderDetail,
} from "@/lib/demo/store";
import type { OrderDetail, OrderListItem } from "@/lib/types";

export type OrderStats = {
  ordersMonth: number;
  customersCount: number;
  valueMonth: number;
};

/**
 * L'amministratore locale (account di configurazione) NON e' un utente
 * Supabase: ha id "admin-agent" che non e' un uuid valido. Vede quindi
 * TUTTI gli ordini del database (niente filtro agent_id) e, per gli ordini
 * creati da lui (salvati sul file locale), anche quelli.
 */
async function isLocalAdmin(): Promise<boolean> {
  return Boolean(await getCurrentAdmin());
}

function mergeOrderLists(
  a: OrderListItem[],
  b: OrderListItem[]
): OrderListItem[] {
  const seen = new Set<string>();
  const out: OrderListItem[] = [];
  for (const o of [...a, ...b]) {
    if (seen.has(o.id)) continue;
    seen.add(o.id);
    out.push(o);
  }
  // Ordine di ARRIVO: l'ultimo ordine trasmesso e' il primo della lista.
  return sortOrdersByArrival(out);
}

export async function getDashboardStats(agentId: string): Promise<OrderStats> {
  if (!(await isSupabaseConfigured())) {
    return demoGetStats();
  }

  const supabase = await getDataClient();
  if (!supabase) return { ordersMonth: 0, customersCount: 0, valueMonth: 0 };

  const isAdmin = await isLocalAdmin();

  const now = new Date();
  const firstOfMonth = new Date(now.getFullYear(), now.getMonth(), 1)
    .toISOString()
    .slice(0, 10);

  let ordersQuery = supabase
    .from("orders")
    .select("id", { count: "exact", head: true });
  let valueQuery = supabase.from("orders").select("totale");
  if (!isAdmin) {
    ordersQuery = ordersQuery.eq("agent_id", agentId);
    valueQuery = valueQuery.eq("agent_id", agentId);
  }

  const [ordersRes, customersRes, valueRes] = await Promise.all([
    ordersQuery.gte("data_ordine", firstOfMonth),
    supabase.from("customers").select("id", { count: "exact", head: true }),
    valueQuery.gte("data_ordine", firstOfMonth),
  ]);

  if (ordersRes.error || customersRes.error || valueRes.error) {
    return demoGetStats();
  }

  const valueMonth = (valueRes.data ?? []).reduce(
    (sum, row) => sum + Number(row.totale ?? 0),
    0
  );

  // Somma anche gli ordini salvati su file (fallback se l'insert DB fallisce),
  // così dashboard e statistiche non perdono nessun ordine del mese.
  const file = await fileListOrders(1000);
  let fileOrders = 0;
  let fileValue = 0;
  for (const o of file) {
    if (!isAdmin && o.agent_id !== agentId) continue;
    if (o.data_ordine >= firstOfMonth) {
      fileOrders += 1;
      fileValue += Number(o.totale ?? 0);
    }
  }

  return {
    ordersMonth: (ordersRes.count ?? 0) + fileOrders,
    customersCount: customersRes.count ?? 0,
    valueMonth: valueMonth + fileValue,
  };
}

export async function getRecentOrders(
  agentId: string,
  limit = 5
): Promise<OrderListItem[]> {
  if (!(await isSupabaseConfigured())) {
    return demoRecentOrders(limit);
  }

  const supabase = await getDataClient();
  if (!supabase) return [];

  const isAdmin = await isLocalAdmin();
  const selectCols =
    "id, numero_ordine, data_ordine, created_at, totale, pagamento, file_url, customers(ragione_sociale), partita_iva, codice_fiscale, stato, annullamento_motivo, annullato_at";
  const baseCols =
    "id, numero_ordine, data_ordine, created_at, totale, pagamento, file_url, customers(ragione_sociale)";

  let query = supabase.from("orders").select(selectCols);
  if (!isAdmin) query = query.eq("agent_id", agentId);
  const { data, error } = await query
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) {
    // Colonne snapshot non ancora presenti nel DB: riprova senza.
    let query2 = supabase.from("orders").select(baseCols);
    if (!isAdmin) query2 = query2.eq("agent_id", agentId);
    const r2 = await query2.order("created_at", { ascending: false }).limit(limit);
    if (r2.error) {
      const file = await fileListOrders(limit);
      return isAdmin
        ? file
        : file.filter((o) => o.agent_id === agentId).slice(0, limit);
    }
    const db2 = (r2.data ?? []) as unknown as OrderListItem[];
    const file = await fileListOrders(limit);
    return mergeOrderLists(
      db2,
      isAdmin ? file : file.filter((o) => o.agent_id === agentId)
    ).slice(0, limit);
  }

  const db = (data ?? []) as unknown as OrderListItem[];
  // Anche gli ordini salvati su file (fallback se l'insert DB fallisce, es.
  // cliente dell'anagrafica Excel senza uuid) devono comparire all'agente.
  const file = await fileListOrders(limit);
  return mergeOrderLists(
    db,
    isAdmin ? file : file.filter((o) => o.agent_id === agentId)
  ).slice(0, limit);
}

export async function getMyOrders(
  agentId: string,
  limit = 100
): Promise<OrderListItem[]> {
  if (!(await isSupabaseConfigured())) {
    return demoGetOrders(limit);
  }

  const supabase = await getDataClient();
  if (!supabase) return [];

  const isAdmin = await isLocalAdmin();
  const selectCols =
    "id, numero_ordine, data_ordine, created_at, totale, pagamento, file_url, customers(ragione_sociale), partita_iva, codice_fiscale, stato, annullamento_motivo, annullato_at";
  const baseCols =
    "id, numero_ordine, data_ordine, created_at, totale, pagamento, file_url, customers(ragione_sociale)";

  let query = supabase.from("orders").select(selectCols);
  if (!isAdmin) query = query.eq("agent_id", agentId);
  const { data, error } = await query
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) {
    // Colonne snapshot non ancora presenti nel DB: riprova senza.
    let query2 = supabase.from("orders").select(baseCols);
    if (!isAdmin) query2 = query2.eq("agent_id", agentId);
    const r2 = await query2.order("created_at", { ascending: false }).limit(limit);
    if (r2.error) {
      const file = await fileListOrders(limit);
      return isAdmin
        ? file
        : file.filter((o) => o.agent_id === agentId).slice(0, limit);
    }
    const db2 = (r2.data ?? []) as unknown as OrderListItem[];
    const file = await fileListOrders(limit);
    return mergeOrderLists(
      db2,
      isAdmin ? file : file.filter((o) => o.agent_id === agentId)
    ).slice(0, limit);
  }

  const db = (data ?? []) as unknown as OrderListItem[];
  // Anche gli ordini salvati su file (fallback se l'insert DB fallisce) devono
  // comparire all'agente che li ha emessi.
  const file = await fileListOrders(limit);
  return mergeOrderLists(
    db,
    isAdmin ? file : file.filter((o) => o.agent_id === agentId)
  ).slice(0, limit);
}

/** Numero di ordini NON ancora letti dall'amministratore (per il pop-up Consolle). */
export async function countUnreadAdminOrders(): Promise<number> {
  if (!(await isLocalAdmin())) return 0;
  const [orders, readSet] = await Promise.all([
    getMyOrders("admin-agent", 1000),
    getReadOrderIds(),
  ]);
  return orders.filter((o) => !readSet.has(o.id)).length;
}

export async function getOrderDetail(
  orderId: string,
  agentId: string
): Promise<OrderDetail | null> {
  if (!(await isSupabaseConfigured())) {
    return demoGetOrderDetail(orderId);
  }

  const supabase = await getDataClient();
  if (!supabase) return null;

  const isAdmin = await isLocalAdmin();
  let query = supabase
    .from("orders")
    // Anagrafica COMPLETA del cliente (serve per la stampa del documento).
    .select("*, customers(*)")
    .eq("id", orderId);
  if (!isAdmin) query = query.eq("agent_id", agentId);

  const { data: rawOrder, error } = await query.maybeSingle();
  if (error || !rawOrder) {
    const file = await fileGetOrderDetail(orderId);
    if (file) return file;
    return demoGetOrderDetail(orderId);
  }

  const order = rawOrder as unknown as OrderDetail["order"];
  // Supabase può restituire la relazione customers come oggetto; per sicurezza
  // accetta anche una lista e prende il primo elemento.
  const customers = order.customers as unknown;
  if (Array.isArray(customers)) {
    order.customers = (customers[0] ?? null) as OrderDetail["order"]["customers"];
  }

  const { data: items } = await supabase
    .from("order_items")
    .select("*")
    .eq("order_id", orderId)
    .order("product_row", { ascending: true });

  return {
    order: order as unknown as OrderDetail["order"],
    items: (items ?? []) as OrderDetail["items"],
  };
}
