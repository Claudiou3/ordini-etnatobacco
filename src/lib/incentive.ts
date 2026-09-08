import { promises as fs } from "node:fs";
import path from "node:path";
import { appDataPath } from "@/lib/data-dir";
import {
  getAppSetting,
  setAppSetting,
  deleteAppSetting,
} from "@/lib/supabase/app-settings";
import { createClient as createServerClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { memoized, invalidateMemo } from "@/lib/server-cache";

/**
 * PIANO INCENTIVANTE.
 *
 * L'amministratore definisce, per un mese/anno (YYYY-MM):
 *  - target: importo IMPONIBILE (merce, escluse spedizione/IVA) da raggiungere;
 *  - prize: valore in euro del premio.
 *
 * Calcolo agente: somma dell'imponibile degli ordini ATTIVI del mese
 * (gli ordini ANNULLATI dall'amministratore NON contano).
 * L'amministratore vede i primi 3 agenti per imponibile raggiunto.
 */

export type IncentivePlan = {
  target: number; // obiettivo imponibile (es. 10000)
  month: string; // "YYYY-MM"
  prize: number; // premio in euro
};

const SETTINGS_FILE = appDataPath("incentive-plan.json");
const SETTINGS_KEY = "incentive_plan";
const CACHE_KEY = "incentive-plan";
const CACHE_TTL = 30_000;

export function monthLabel(month: string): string {
  const names = [
    "Gennaio","Febbraio","Marzo","Aprile","Maggio","Giugno",
    "Luglio","Agosto","Settembre","Ottobre","Novembre","Dicembre",
  ];
  const [y, m] = month.split("-");
  return `${names[Number(m) - 1] ?? m} ${y}`;
}

/** Intervallo [inizio, fine) del mese, confrontabile lessicograficamente. */
export function monthRange(month: string): { from: string; to: string } {
  const [y, m] = month.split("-").map(Number);
  const next = new Date(Date.UTC(y, m - 1 + 1, 1));
  const to = next.toISOString().slice(0, 10);
  return { from: `${month}-01`, to };
}

export async function getIncentivePlan(): Promise<IncentivePlan | null> {
  return memoized<IncentivePlan | null>(
    CACHE_KEY,
    CACHE_TTL,
    async () => {
      const remote = await getAppSetting<IncentivePlan>(SETTINGS_KEY);
      if (remote && remote.target > 0 && remote.month && remote.prize >= 0) {
        return remote;
      }
      try {
        const file = JSON.parse(
          await fs.readFile(SETTINGS_FILE, "utf8")
        ) as IncentivePlan;
        if (file && file.target > 0 && file.month && file.prize >= 0) return file;
      } catch {
        // file assente o non valido
      }
      return null;
    }
  );
}

export async function saveIncentivePlan(
  plan: IncentivePlan
): Promise<{ ok: boolean; error?: string }> {
  if (!Number.isFinite(plan.target) || plan.target <= 0) {
    return { ok: false, error: "Inserisci un importo obiettivo valido (es. 10000)." };
  }
  if (!/^\d{4}-\d{2}$/.test(plan.month)) {
    return { ok: false, error: "Inserisci mese/anno nel formato MM/AAAA." };
  }
  if (!Number.isFinite(plan.prize) || plan.prize < 0) {
    return { ok: false, error: "Inserisci un valore premio valido." };
  }

  const clean: IncentivePlan = {
    target: Math.round(plan.target * 100) / 100,
    month: plan.month,
    prize: Math.round(plan.prize * 100) / 100,
  };

  const saved = await setAppSetting(SETTINGS_KEY, clean);
  if (!saved) {
    try {
      await fs.mkdir(path.dirname(SETTINGS_FILE), { recursive: true });
      await fs.writeFile(SETTINGS_FILE, JSON.stringify(clean, null, 2), {
        mode: 0o600,
      });
    } catch (err) {
      return {
        ok: false,
        error:
          "Impossibile salvare il piano (file system non scrivibile o Supabase non raggiungibile): " +
          (err as Error).message,
      };
    }
  }
  invalidateMemo(CACHE_KEY);
  return { ok: true };
}

/** Somma dell'imponibile degli ordini ATTIVI dell'agente nel mese. */
async function imponibileMonth(
  agentId: string,
  month: string
): Promise<number> {
  const { from, to } = monthRange(month);
  const supabase = await createServerClient();
  if (!supabase) return 0;
  const { data, error } = await supabase
    .from("orders")
    .select("imponibile, stato")
    .eq("agent_id", agentId)
    .gte("data_ordine", from)
    .lt("data_ordine", to);
  if (error || !data) return 0;
  return (data ?? []).reduce(
    (sum, o) =>
      o.stato === "annullato" ? sum : sum + Number(o.imponibile ?? 0),
    0
  );
}

/** Elimina il piano incentivante corrente (Supabase o file locale). */
export async function deleteIncentivePlan(): Promise<boolean> {
  invalidateMemo(CACHE_KEY);

  // Cancella la riga su Supabase (se configurato). NON si può usare
  // setAppSetting(key, null): la colonna value è jsonb NOT NULL, quindi
  // quell'upsert fallisce in silenzio e il piano rimarrebbe in linea.
  const remote = await deleteAppSetting(SETTINGS_KEY);
  if (remote === false) {
    // Supabase configurato ma cancellazione fallita: non rimuovere il file
    // locale, altrimenti al prossimo giro il piano "tornerebbe" dal remoto.
    return false;
  }

  // Rimuove anche l'eventuale file locale (modalità desktop / senza Supabase).
  try {
    await fs.rm(SETTINGS_FILE, { force: true });
  } catch {
    // file locale assente o non rimovibile: la cancellazione è già riuscita
  }
  return true;
}

export type IncentiveAgentView = {
  plan: IncentivePlan;
  current: number;
  /** Quanto manca (0 se raggiunto). */
  missing: number;
};

/** Vista per l'agente: piano attivo + progresso del mese. */
export async function getAgentIncentiveView(
  agentId: string
): Promise<IncentiveAgentView | null> {
  const plan = await getIncentivePlan();
  if (!plan) return null;
  const current = await imponibileMonth(agentId, plan.month);
  return {
    plan,
    current,
    missing: Math.max(0, plan.target - current),
  };
}

export type AgentIncentiveRank = {
  nome: string;
  email: string;
  imponibile: number;
};

/** Top 3 agenti per imponibile del mese del piano (solo ordini attivi). */
export async function getTopAgentsIncentive(
  plan: IncentivePlan
): Promise<AgentIncentiveRank[]> {
  const admin = await createAdminClient();
  if (!admin) return [];
  const { from, to } = monthRange(plan.month);

  const [agentsRes, ordersRes] = await Promise.all([
    admin.from("agents").select("id, nome, email, stato"),
    admin
      .from("orders")
      .select("agent_id, imponibile, stato")
      .gte("data_ordine", from)
      .lt("data_ordine", to),
  ]);
  if (agentsRes.error || ordersRes.error) return [];

  const map = new Map<string, number>();
  for (const o of ordersRes.data ?? []) {
    if (o.stato === "annullato") continue;
    const cur = map.get(o.agent_id) ?? 0;
    map.set(o.agent_id, cur + Number(o.imponibile ?? 0));
  }

  return (agentsRes.data ?? [])
    .filter((a) => a.stato === "attivo" || map.has(a.id))
    .map((a) => ({
      nome: a.nome,
      email: a.email,
      imponibile: map.get(a.id) ?? 0,
    }))
    .sort((a, b) => b.imponibile - a.imponibile)
    .slice(0, 3);
}
