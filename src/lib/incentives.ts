/**
 * OBIETTIVI AGENTI / GARE INCENTIVANTI.
 *
 * L'amministratore può creare per un mese più "gare" tra loro indipendenti:
 *  - kind "obiettivo": premio a OGNI agente che raggiunge l'obiettivo di
 *    imponibile del mese (solo merce, ordini ANNULLATI esclusi);
 *  - kind "vendite": gara "miglior venditore" — premio al 1° agente per
 *    imponibile complessivo del mese (UN solo vincitore).
 *
 * Persistenza: chiave Supabase app_settings "incentive_plans" (array di gare)
 * con fallback sul file data/incentive-plans.json. Il vecchio piano singolo
 * (chiave "incentive_plan") viene letto e mostrato come gara "obiettivo" per
 * non perdere nessun dato già configurato.
 */

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
import { monthLabel, monthRange } from "./incentive";

export { monthLabel };

export type IncentiveKind = "obiettivo" | "vendite";

export type IncentiveGara = {
  id: string;
  kind: IncentiveKind;
  /** Mese di riferimento "YYYY-MM". */
  month: string;
  /** Obiettivo imponibile (€) — solo per kind "obiettivo". */
  target?: number;
  /** Premio in euro. */
  prize: number;
  /** Etichetta facoltativa (es. "1° classificato"). */
  note?: string;
  createdAt: number;
};

export const GARE_KEY = "incentive_plans";
export const LEGACY_GARE_KEY = "incentive_plan";

const GARE_FILE = appDataPath("incentive-plans.json");
const LEGACY_GARE_FILE = appDataPath("incentive-plan.json");
const CACHE_KEY = "incentive-gare";
const CACHE_TTL = 30_000;

export function kindLabel(kind: IncentiveKind): string {
  return kind === "obiettivo"
    ? "Obiettivo imponibile"
    : "Gara miglior venditore";
}

/** Legge il vecchio "piano singolo" (formato precedente alle gare). */
type LegacyPlan = { target: number; month: string; prize: number };

function isLegacyPlan(v: unknown): v is LegacyPlan {
  const p = v as LegacyPlan;
  return Boolean(
    p &&
      typeof p.month === "string" &&
      /^\d{4}-\d{2}$/.test(p.month) &&
      Number(p.target) > 0 &&
      Number.isFinite(Number(p.prize))
  );
}

async function readLegacyPlan(): Promise<LegacyPlan | null> {
  try {
    const remote = await getAppSetting<unknown>(LEGACY_GARE_KEY);
    if (isLegacyPlan(remote)) return remote;
  } catch {
    // nessun valore remoto
  }
  try {
    const file = JSON.parse(await fs.readFile(LEGACY_GARE_FILE, "utf8"));
    if (isLegacyPlan(file)) return file;
  } catch {
    // file assente o non valido
  }
  return null;
}

async function loadGareRaw(): Promise<IncentiveGara[]> {
  const remote = await getAppSetting<IncentiveGara[] | null>(GARE_KEY);
  const list = Array.isArray(remote) ? [...remote] : [];
  if (list.length === 0) {
    try {
      const file = JSON.parse(await fs.readFile(GARE_FILE, "utf8"));
      if (Array.isArray(file)) list.push(...file);
    } catch {
      // file non ancora creato
    }
  }
  // Migrazione: un eventuale vecchio piano singolo diventa una gara obiettivo.
  const legacy = await readLegacyPlan();
  if (legacy) {
    const already = list.some(
      (g) => g.kind === "obiettivo" && g.month === legacy.month
    );
    if (!already) {
      list.push({
        id: "legacy-obiettivo",
        kind: "obiettivo",
        month: legacy.month,
        target: legacy.target,
        prize: legacy.prize,
        createdAt: 0,
      });
    }
  }
  return list;
}

async function persistGare(list: IncentiveGara[]): Promise<boolean> {
  const saved = await setAppSetting(GARE_KEY, list);
  if (saved) {
    try {
      await fs.rm(GARE_FILE, { force: true });
    } catch {
      // file locale non presente
    }
  } else {
    try {
      await fs.mkdir(path.dirname(GARE_FILE), { recursive: true });
      await fs.writeFile(GARE_FILE, JSON.stringify(list, null, 2), {
        mode: 0o600,
      });
    } catch {
      return false;
    }
  }
  invalidateMemo(CACHE_KEY);
  // Il vecchio formato "piano singolo" ora è incorporato nell'array.
  await deleteAppSetting(LEGACY_GARE_KEY);
  try {
    await fs.rm(LEGACY_GARE_FILE, { force: true });
  } catch {
    // niente da rimuovere
  }
  return true;
}

function newGaraId(): string {
  return `gara-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

/** Elenco di tutte le gare (mese più recente per primo). */
export async function listIncentiveGare(): Promise<IncentiveGara[]> {
  const raw = await memoized<IncentiveGara[]>(CACHE_KEY, CACHE_TTL, loadGareRaw);
  const sorted = [...raw];
  sorted.sort((a, b) => {
    const byMonth = b.month.localeCompare(a.month);
    if (byMonth !== 0) return byMonth;
    if (a.kind !== b.kind) return a.kind === "obiettivo" ? -1 : 1;
    return a.createdAt - b.createdAt;
  });
  return sorted;
}

/** Mese con gare più recente; se non c'è nessuna gara, il mese corrente. */
export function meseAttualeGare(gare: IncentiveGara[]): string {
  const months = [...new Set(gare.map((g) => g.month))].sort();
  if (months.length > 0) return months[months.length - 1];
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

/**
 * Crea/aggiorna una gara.
 * - kind "obiettivo": per ogni mese esiste al più una gara obiettivo
 *   (se già presente viene aggiornata);
 * - kind "vendite": ogni salvataggio aggiunge una nuova gara indipendente.
 */
export async function saveIncentiveGara(input: {
  kind: IncentiveKind;
  month: string;
  target?: number;
  prize: number;
  note?: string;
}): Promise<{ ok: boolean; error?: string }> {
  const kind: IncentiveKind =
    input.kind === "vendite" ? "vendite" : "obiettivo";
  if (!/^\d{4}-\d{2}$/.test(input.month)) {
    return { ok: false, error: "Seleziona un mese valido." };
  }
  const prize = Math.round((Number(input.prize) || 0) * 100) / 100;
  if (!Number.isFinite(prize) || prize <= 0) {
    return { ok: false, error: "Inserisci un premio (€) valido." };
  }
  const note = input.note?.trim().slice(0, 120) || undefined;

  if (kind === "obiettivo") {
    const target = Math.round((Number(input.target) || 0) * 100) / 100;
    if (!Number.isFinite(target) || target <= 0) {
      return {
        ok: false,
        error: "Inserisci un obiettivo imponibile (€) valido.",
      };
    }
    const list = await loadGareRaw();
    const idx = list.findIndex(
      (g) => g.kind === "obiettivo" && g.month === input.month
    );
    if (idx >= 0) {
      list[idx] = { ...list[idx], target, prize, note };
    } else {
      list.push({
        id: newGaraId(),
        kind,
        month: input.month,
        target,
        prize,
        note,
        createdAt: Date.now(),
      });
    }
    return (await persistGare(list))
      ? { ok: true }
      : { ok: false, error: "Impossibile salvare la gara (riprova)." };
  }

  const list = await loadGareRaw();
  list.push({
    id: newGaraId(),
    kind,
    month: input.month,
    prize,
    note,
    createdAt: Date.now(),
  });
  return (await persistGare(list))
    ? { ok: true }
    : { ok: false, error: "Impossibile salvare la gara (riprova)." };
}

/** Elimina una singola gara per id. */
export async function deleteIncentiveGara(id: string): Promise<boolean> {
  const list = await loadGareRaw();
  const next = list.filter((g) => g.id !== id);
  if (next.length === list.length) return true;
  return persistGare(next);
}

/** Somma dell'imponibile degli ordini ATTIVI di un agente nel mese. */
export async function imponibileAgenteMese(
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

export type ClassificaRiga = {
  id: string;
  nome: string;
  email: string;
  imponibile: number;
};

/** Classifica completa del mese per imponibile (solo ordini attivi). */
export async function getClassificaMese(month: string): Promise<ClassificaRiga[]> {
  const admin = await createAdminClient();
  if (!admin) return [];
  const { from, to } = monthRange(month);

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
    map.set(o.agent_id, (map.get(o.agent_id) ?? 0) + Number(o.imponibile ?? 0));
  }

  return (agentsRes.data ?? [])
    .filter((a) => a.stato === "attivo" || map.has(a.id))
    .map((a) => ({
      id: a.id,
      nome: a.nome,
      email: a.email,
      imponibile: map.get(a.id) ?? 0,
    }))
    .sort((a, b) => b.imponibile - a.imponibile);
}

export type GaraAgenteView = {
  id: string;
  kind: IncentiveKind;
  month: string;
  target?: number;
  prize: number;
  note?: string;
  current: number;
  reached: boolean;
  missing: number;
};

export type GareAgenteView = { month: string; gare: GaraAgenteView[] } | null;

/**
 * Vista per l'agente: gare attive (mese più recente configurato) con il
 * suo imponibile del mese già calcolato una sola volta.
 */
export async function getGareAgente(
  agentId: string
): Promise<GareAgenteView> {
  const gare = await listIncentiveGare();
  if (gare.length === 0) return null;
  const month = gare[0].month; // già ordinato: mese più recente
  const current = await imponibileAgenteMese(agentId, month);
  return {
    month,
    gare: gare
      .filter((g) => g.month === month)
      .map((g) => {
        const target = g.kind === "obiettivo" ? Number(g.target ?? 0) : 0;
        return {
          id: g.id,
          kind: g.kind,
          month: g.month,
          target: g.kind === "obiettivo" ? target : undefined,
          prize: g.prize,
          note: g.note,
          current,
          reached: g.kind === "obiettivo" ? current >= target : false,
          missing: g.kind === "obiettivo" ? Math.max(0, target - current) : 0,
        };
      }),
  };
}

