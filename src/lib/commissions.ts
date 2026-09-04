import { promises as fs } from "node:fs";
import path from "node:path";
import { getDataClient } from "@/lib/supabase/data";
import { isSupabaseConfigured } from "@/lib/settings/runtime";
import { appDataPath } from "@/lib/data-dir";
import { getAppSetting, setAppSetting } from "@/lib/supabase/app-settings";
import { memoized, invalidateMemo } from "@/lib/server-cache";
import {
  demoGetOrders,
  demoGetOrderDetail,
} from "@/lib/demo/store";
import { fileListOrders, fileGetOrderDetail } from "@/lib/orders/store";
import { getMyOrders } from "@/lib/orders";
import { DEMO_AGENT } from "@/lib/supabase/session";
import {
  classifyGroup,
  type AgentCommissionData,
  type AgentCommissionView,
  type AgentOrderRow,
  type ClientCommissionData,
  type CommissionRates,
} from "@/lib/commission-groups";

// Re-export per i consumatori server.
export { COMMISSION_GROUPS, classifyGroup } from "@/lib/commission-groups";
export type {
  AgentCommissionData,
  AgentCommissionView,
  AgentOrderCommissionRow,
  AgentOrderRow,
  ClientCommissionData,
  CommissionGroupKey,
  CommissionRates,
} from "@/lib/commission-groups";

const RATES_FILE = appDataPath("commissions.json");
const RATES_SETTING_KEY = "commission_rates";

// Aliquote lette dalle pagine console/agenti: TTL breve + invalidazione al salvataggio.
const RATES_CACHE_KEY = "commission-rates";
const RATES_CACHE_TTL_MS = 30_000;

const ZERO_RATES: CommissionRates = { occhiali: 0, espositori: 0, astucci: 0 };

function clampRate(value: unknown): number {
  const n = Number(value ?? 0);
  if (!Number.isFinite(n)) return 0;
  return Math.min(100, Math.max(0, n));
}

function toRates(raw: unknown): CommissionRates {
  const r = (raw ?? {}) as Partial<CommissionRates>;
  return {
    occhiali: clampRate(r.occhiali),
    espositori: clampRate(r.espositori),
    astucci: clampRate(r.astucci),
  };
}

export async function getCommissionRates(): Promise<CommissionRates> {
  return memoized<CommissionRates>(
    RATES_CACHE_KEY,
    RATES_CACHE_TTL_MS,
    async () => {
      // 1) Supabase (online, filesystem in sola lettura).
      const remote = await getAppSetting<CommissionRates>(RATES_SETTING_KEY);
      if (remote) return toRates(remote);
      // 2) File locale.
      try {
        const raw = JSON.parse(
          await fs.readFile(RATES_FILE, "utf8")
        ) as Partial<CommissionRates>;
        return toRates(raw);
      } catch {
        return { ...ZERO_RATES };
      }
    }
  );
}

export async function saveCommissionRates(
  rates: CommissionRates
): Promise<void> {
  const saved = await setAppSetting(RATES_SETTING_KEY, toRates(rates));
  if (!saved) {
    await fs.mkdir(path.dirname(RATES_FILE), { recursive: true });
    await fs.writeFile(
      RATES_FILE,
      JSON.stringify({ ...toRates(rates), updatedAt: new Date().toISOString() }, null, 2)
    );
  }
  // Aliquote aggiornate: la voce in cache non è più valida.
  invalidateMemo(RATES_CACHE_KEY);
}

/** Quota di imponibile per gruppo, da una lista di voci (subtotale). */
function groupFromSubtotals(
  entries: { descrizione: string; subtotale: number }[]
): CommissionRates {
  const groups: CommissionRates = { occhiali: 0, espositori: 0, astucci: 0 };
  for (const entry of entries) {
    const key = classifyGroup(entry.descrizione);
    groups[key] += Number(entry.subtotale ?? 0);
  }
  return groups;
}

async function demoAgentsData(): Promise<AgentCommissionData[]> {
  const list = await demoGetOrders(500);
  const orders: AgentOrderRow[] = [];
  const groups: CommissionRates = { occhiali: 0, espositori: 0, astucci: 0 };
  for (const row of list) {
    const detail = await demoGetOrderDetail(row.id);
    // Gli ordini ANNULLATI non generano provvigioni.
    if (detail?.order.stato === "annullato") continue;
    const g = groupFromSubtotals(
      (detail?.items ?? []).map((it) => ({
        descrizione: it.descrizione,
        subtotale: Number(it.subtotale ?? 0),
      }))
    );
    orders.push({
      id: row.id,
      numero: detail?.order.numero_ordine ?? row.numero_ordine,
      data: row.data_ordine,
      cliente: row.customers?.ragione_sociale ?? null,
      imponibile: Number(detail?.order.imponibile ?? 0),
      groups: g,
    });
    groups.occhiali += g.occhiali;
    groups.espositori += g.espositori;
    groups.astucci += g.astucci;
  }
  return [
    {
      id: DEMO_AGENT.id,
      nome: DEMO_AGENT.nome,
      email: DEMO_AGENT.email,
      stato: DEMO_AGENT.stato,
      orders,
      groups,
      totale: groups.occhiali + groups.espositori + groups.astucci,
    },
  ];
}

/**
 * Elenco agenti registrati ATTIVI con tutti i loro ordini e l'imponibile
 * (merce, senza spedizione/IVA) suddiviso per gruppo di provvigione.
 */
export async function getAgentsCommissionData(): Promise<AgentCommissionData[]> {
  if (!(await isSupabaseConfigured())) {
    return demoAgentsData();
  }

  const supabase = await getDataClient();
  if (!supabase) return [];

  const { data: agents, error: agentsError } = await supabase
    .from("agents")
    .select("id, email, nome, stato")
    .order("nome", { ascending: true });
  if (agentsError || !agents || agents.length === 0) return [];

  const agentIds = new Set(agents.map((a) => a.id));

  const [ordersRes, itemsRes] = await Promise.all([
    supabase
      .from("orders")
      .select(
        "id, agent_id, numero_ordine, data_ordine, imponibile, stato, customers(ragione_sociale)"
      )
      .order("data_ordine", { ascending: false }),
    supabase.from("order_items").select("order_id, descrizione, subtotale"),
  ]);

  const orders = ordersRes.data ?? [];
  const items = itemsRes.data ?? [];

  // Imponibile per gruppo, per singolo ordine
  const groupsByOrder = new Map<string, CommissionRates>();
  for (const item of items) {
    const key = classifyGroup(item.descrizione ?? "");
    const g = groupsByOrder.get(item.order_id) ?? {
      occhiali: 0,
      espositori: 0,
      astucci: 0,
    };
    g[key] += Number(item.subtotale ?? 0);
    groupsByOrder.set(item.order_id, g);
  }

  const ordersByAgent = new Map<string, AgentOrderRow[]>();
  const groupsByAgent = new Map<string, CommissionRates>();
  for (const order of orders) {
    if (!agentIds.has(order.agent_id)) continue;
    // Gli ordini ANNULLATI non generano provvigioni.
    if (order.stato === "annullato") continue;
    const row: AgentOrderRow = {
      id: order.id,
      numero: order.numero_ordine,
      data: order.data_ordine,
      cliente:
        (order.customers as unknown as { ragione_sociale: string } | null)
          ?.ragione_sociale ?? null,
      imponibile: Number(order.imponibile ?? 0),
      groups: groupsByOrder.get(order.id) ?? {
        occhiali: 0,
        espositori: 0,
        astucci: 0,
      },
    };
    const list = ordersByAgent.get(order.agent_id) ?? [];
    list.push(row);
    ordersByAgent.set(order.agent_id, list);

    const g = groupsByOrder.get(order.id) ?? {
      occhiali: 0,
      espositori: 0,
      astucci: 0,
    };
    const agg = groupsByAgent.get(order.agent_id) ?? {
      occhiali: 0,
      espositori: 0,
      astucci: 0,
    };
    agg.occhiali += g.occhiali;
    agg.espositori += g.espositori;
    agg.astucci += g.astucci;
    groupsByAgent.set(order.agent_id, agg);
  }

  // Unisce anche gli ordini salvati su file (fallback quando l'insert nel DB
  // fallisce, es. cliente dell'anagrafica Excel): le provvigioni non devono
  // perdere nessun ordine emesso dall'agente.
  const dbOrderIds = new Set(orders.map((o) => o.id));
  const fileOrders = await fileListOrders(1000);
  for (const row of fileOrders) {
    if (dbOrderIds.has(row.id)) continue; // gia' nel DB: niente doppioni
    if (!row.agent_id || !agentIds.has(row.agent_id)) continue;
    if (row.stato === "annullato") continue; // annullati: niente provvigioni

    const detail = await fileGetOrderDetail(row.id);
    const g = groupFromSubtotals(
      (detail?.items ?? []).map((it) => ({
        descrizione: it.descrizione,
        subtotale: Number(it.subtotale ?? 0),
      }))
    );
    const rowEntry: AgentOrderRow = {
      id: row.id,
      numero: detail?.order.numero_ordine ?? row.numero_ordine,
      data: row.data_ordine,
      cliente: row.customers?.ragione_sociale ?? null,
      imponibile: Number(detail?.order.imponibile ?? 0),
      groups: g,
    };
    const list = ordersByAgent.get(row.agent_id) ?? [];
    list.push(rowEntry);
    ordersByAgent.set(row.agent_id, list);

    const agg = groupsByAgent.get(row.agent_id) ?? {
      occhiali: 0,
      espositori: 0,
      astucci: 0,
    };
    agg.occhiali += g.occhiali;
    agg.espositori += g.espositori;
    agg.astucci += g.astucci;
    groupsByAgent.set(row.agent_id, agg);
  }

  return agents.map((agent) => {
    const groups = groupsByAgent.get(agent.id) ?? {
      occhiali: 0,
      espositori: 0,
      astucci: 0,
    };
    return {
      id: agent.id,
      nome: agent.nome,
      email: agent.email,
      stato: agent.stato ?? "attivo",
      orders: ordersByAgent.get(agent.id) ?? [],
      groups,
      totale: groups.occhiali + groups.espositori + groups.astucci,
    };
  });
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

/**
 * Vista provvigioni LATO AGENTE: gli ordini dell'agente raggruppati per
 * CLIENTE, con la provvigione calcolata su ogni singolo ordine (imponibile
 * per gruppo x percentuale) e il totale complessivo per cliente.
 */
export async function getAgentCommissionView(
  agentId: string
): Promise<AgentCommissionView> {
  const [orders, rates] = await Promise.all([
    getMyOrders(agentId, 1000),
    getCommissionRates(),
  ]);

  // Carica in un colpo solo le righe articolo degli ordini presenti nel DB;
  // gli ordini salvati solo su file vengono letti dal dettaglio locale.
  const itemsByOrder = new Map<
    string,
    { descrizione: string; subtotale: number }[]
  >();
  if (orders.length > 0 && (await isSupabaseConfigured())) {
    const supabase = await getDataClient();
    if (supabase) {
      const { data } = await supabase
        .from("order_items")
        .select("order_id, descrizione, subtotale")
        .in(
          "order_id",
          orders.map((o) => o.id)
        );
      for (const it of data ?? []) {
        const list = itemsByOrder.get(it.order_id) ?? [];
        list.push({
          descrizione: it.descrizione ?? "",
          subtotale: Number(it.subtotale ?? 0),
        });
        itemsByOrder.set(it.order_id, list);
      }
    }
  }

  const byClient = new Map<string, ClientCommissionData>();
  for (const o of orders) {
    // Gli ordini ANNULLATI non generano provvigioni (cliente che rifiuta la merce).
    if (o.stato === "annullato") continue;
    let items = itemsByOrder.get(o.id);
    if (items === undefined) {
      const detail = await fileGetOrderDetail(o.id);
      items = (detail?.items ?? []).map((it) => ({
        descrizione: it.descrizione,
        subtotale: Number(it.subtotale ?? 0),
      }));
      if (items.length === 0) continue; // dettaglio non disponibile
    }

    const g = groupFromSubtotals(items);
    const imponibile = items.reduce((sum, it) => sum + it.subtotale, 0);
    const commissione =
      (g.occhiali * rates.occhiali +
        g.espositori * rates.espositori +
        g.astucci * rates.astucci) /
      100;

    const cliente = o.customers?.ragione_sociale ?? "Cliente sconosciuto";
    let entry = byClient.get(cliente);
    if (!entry) {
      entry = {
        cliente,
        orders: [],
        groups: { occhiali: 0, espositori: 0, astucci: 0 },
        totale: 0,
        commissione: 0,
      };
      byClient.set(cliente, entry);
    }
    entry.orders.push({
      id: o.id,
      numero: o.numero_ordine,
      data: o.data_ordine,
      imponibile: round2(imponibile),
      commissione: round2(commissione),
      groups: g,
    });
    entry.groups.occhiali += g.occhiali;
    entry.groups.espositori += g.espositori;
    entry.groups.astucci += g.astucci;
    entry.totale += imponibile;
    entry.commissione += commissione;
  }

  const clients = Array.from(byClient.values())
    .map((c) => ({
      ...c,
      totale: round2(c.totale),
      commissione: round2(c.commissione),
    }))
    .sort((a, b) => a.cliente.localeCompare(b.cliente));

  return { rates, clients };
}

