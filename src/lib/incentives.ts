/**
 * OBIETTIVI AGENTI / GARE INCENTIVANTI (con PERIODI liberi).
 *
 * L'amministratore può creare più "gare" indipendenti, ciascuna su un periodo
 * (da… a) completamente libero: un singolo mese oppure più mesi/anno.
 *  - kind "obiettivo": premio a OGNI agente che nel periodo raggiunge
 *    l'obiettivo di imponibile (ordini ANNULLATI esclusi);
 *  - kind "vendite": gara "miglior venditore" — premio al 1° agente per
 *    imponibile complessivo del periodo (UN solo vincitore).
 *
 * Regola vincitore "vendite" (amministratore):
 *  - se esiste una gara "obiettivo" con lo STESSO periodo (stessa da… a),
 *    il vincitore è verde SOLO se ha superato anche quell'obiettivo;
 *  - se la gara è singola/individuale (nessun obiettivo accoppiato),
 *    vince chi è primo nel periodo.
 *
 * Persistenza: chiave Supabase app_settings "incentive_plans" (array) con
 * fallback su data/incentive-plans.json. Le gare salvate nel vecchio formato
 * mensile (campo month) vengono lette e migrate automaticamente al periodo.
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
import { monthLabel } from "./incentive";

export { monthLabel };

export type IncentiveKind = "obiettivo" | "vendite";

export type IncentiveGara = {
  id: string;
  kind: IncentiveKind;
  /** Data inizio periodo inclusiva "YYYY-MM-DD". */
  from: string;
  /** Data fine periodo inclusiva "YYYY-MM-DD". */
  to: string;
  /** Obiettivo imponibile (€) — solo kind "obiettivo". */
  target?: number;
  /** Premio in euro. */
  prize: number;
  /** Premio argento — 2° classificato (solo gara "vendite"). */
  prizeArgento?: number;
  /** Premio bronzo — 3° classificato (solo gara "vendite"). */
  prizeBronzo?: number;
  /** Etichetta facoltativa. */
  note?: string;
  createdAt: number;
};

/** Formato di storage: tollera il vecchio campo month (gara mensile). */
type StoredGara = {
  id: string;
  kind: IncentiveKind;
  month?: string;
  from?: string;
  to?: string;
  target?: number;
  prize: number;
  prizeArgento?: number;
  prizeBronzo?: number;
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

/** Data odierna "YYYY-MM-DD" (fuso locale server). */
export function todayISO(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** Ultimo giorno (inclusivo) del mese "YYYY-MM". */
export function lastDayOfMonth(month: string): string {
  const [y, m] = month.split("-").map(Number);
  return new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
}

export function dataLabel(date: string): string {
  const [y, m, d] = date.split("-");
  return `${d}/${m}/${y}`;
}

/** Etichetta leggibile di un periodo: mese intero o intervallo date. */
export function periodoLabel(g: { from: string; to: string }): string {
  const from = g.from ?? "";
  const to = g.to ?? "";
  if (/^\d{4}-\d{2}$/.test(from.slice(0, 7))) {
    const month = from.slice(0, 7);
    const fullMonth =
      from === `${month}-01` && to === lastDayOfMonth(month);
    if (fullMonth) return monthLabel(month);
  }
  return `dal ${dataLabel(from)} al ${dataLabel(to)}`;
}

function normalizeGara(s: StoredGara): IncentiveGara {
  const month = s.month && /^\d{4}-\d{2}$/.test(s.month) ? s.month : undefined;
  const from = s.from || (month ? `${month}-01` : todayISO());
  const to = s.to || (month ? lastDayOfMonth(month) : from);
  const [f, t] = from <= to ? [from, to] : [to, from];
  return {
    id: s.id,
    kind: s.kind === "vendite" ? "vendite" : "obiettivo",
    from: f,
    to: t,
    target:
      typeof s.target === "number" && Number.isFinite(s.target)
        ? Math.round(s.target * 100) / 100
        : undefined,
    prize: Math.round((Number(s.prize) || 0) * 100) / 100,
    prizeArgento:
      typeof s.prizeArgento === "number" && Number.isFinite(s.prizeArgento)
        ? Math.round(s.prizeArgento * 100) / 100
        : undefined,
    prizeBronzo:
      typeof s.prizeBronzo === "number" && Number.isFinite(s.prizeBronzo)
        ? Math.round(s.prizeBronzo * 100) / 100
        : undefined,
    note: s.note || undefined,
    createdAt: s.createdAt ?? 0,
  };
}

/** Legge il vecchio "piano singolo" mensile (formato precedente alle gare). */
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
  const remote = await getAppSetting<StoredGara[] | null>(GARE_KEY);
  const stored = Array.isArray(remote) ? [...remote] : [];
  if (stored.length === 0) {
    try {
      const file = JSON.parse(await fs.readFile(GARE_FILE, "utf8"));
      if (Array.isArray(file)) stored.push(...file);
    } catch {
      // file non ancora creato
    }
  }
  const out: IncentiveGara[] = stored.map(normalizeGara);

  // Migrazione: un eventuale vecchio piano singolo diventa una gara obiettivo
  // nel suo mese (dal 1° all'ultimo giorno).
  const legacy = await readLegacyPlan();
  if (legacy) {
    const from = `${legacy.month}-01`;
    const to = lastDayOfMonth(legacy.month);
    const already = out.some(
      (g) => g.kind === "obiettivo" && g.from === from && g.to === to
    );
    if (!already) {
      out.push({
        id: "legacy-obiettivo",
        kind: "obiettivo",
        from,
        to,
        target: legacy.target,
        prize: legacy.prize,
        createdAt: 0,
      });
    }
  }
  return out;
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

/** Elenco di tutte le gare (periodo più recente per primo). */
export async function listIncentiveGare(): Promise<IncentiveGara[]> {
  const raw = await memoized<IncentiveGara[]>(CACHE_KEY, CACHE_TTL, loadGareRaw);
  const sorted = [...raw];
  sorted.sort((a, b) => {
    const byFrom = b.from.localeCompare(a.from);
    if (byFrom !== 0) return byFrom;
    const byTo = b.to.localeCompare(a.to);
    if (byTo !== 0) return byTo;
    if (a.kind !== b.kind) return a.kind === "obiettivo" ? -1 : 1;
    return a.createdAt - b.createdAt;
  });
  return sorted;
}

/**
 * Periodo "attivo" delle gare: quello in corso (se contiene oggi), altrimenti
 * il prossimo in partenza, altrimenti l'ultimo concluso.
 */
export function periodoAttualeGare(
  gare: IncentiveGara[]
): { from: string; to: string } | null {
  if (gare.length === 0) return null;
  const ranges = [...new Map(gare.map((g) => [`${g.from}|${g.to}`, { from: g.from, to: g.to }])).values()];
  const today = todayISO();
  const sorted = [...ranges].sort(
    (a, b) => b.from.localeCompare(a.from) || b.to.localeCompare(a.to)
  );
  const inCorso = sorted.filter((r) => r.from <= today && r.to >= today);
  if (inCorso.length) return inCorso[0];
  const future = sorted.filter((r) => r.from > today);
  if (future.length) return future[future.length - 1];
  const past = sorted.filter((r) => r.to < today);
  if (past.length) return past[past.length - 1];
  return sorted[0];
}

/** (Compatibilità) mese più recente con gare, altrimenti mese corrente. */
export function meseAttualeGare(gare: IncentiveGara[]): string {
  const p = periodoAttualeGare(gare);
  if (!p) {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  }
  return p.from.slice(0, 7);
}

/** (Compatibilità) funzione di ordinamento mesi non più usata all'interno. */

/**
 * Crea/aggiorna una gara su un periodo libero (da… a inclusi).
 * - kind "obiettivo": per lo stesso periodo esiste al più una gara obiettivo
 *   (se già presente viene aggiornata);
 * - kind "vendite": ogni salvataggio aggiunge una nuova gara indipendente.
 */
export async function saveIncentiveGara(input: {
  kind: IncentiveKind;
  from: string;
  to: string;
  target?: number;
  prize: number;
  prizeArgento?: number;
  prizeBronzo?: number;
  note?: string;
}): Promise<{ ok: boolean; error?: string }> {
  const kind: IncentiveKind =
    input.kind === "vendite" ? "vendite" : "obiettivo";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.from) || !/^\d{4}-\d{2}-\d{2}$/.test(input.to)) {
    return { ok: false, error: "Seleziona un periodo valido (data inizio e fine)." };
  }
  if (input.to < input.from) {
    return { ok: false, error: "La data di fine non può essere prima della data di inizio." };
  }
  const prize = Math.round((Number(input.prize) || 0) * 100) / 100;
  if (!Number.isFinite(prize) || prize <= 0) {
    return { ok: false, error: "Inserisci un premio (€) valido." };
  }
  const note = input.note?.trim().slice(0, 120) || undefined;
  const aux = (v: number | undefined): number | undefined =>
    typeof v === "number" && Number.isFinite(v) && v >= 0
      ? Math.round(v * 100) / 100
      : undefined;
  const prizeArgento = aux(input.prizeArgento);
  const prizeBronzo = aux(input.prizeBronzo);

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
      (g) => g.kind === "obiettivo" && g.from === input.from && g.to === input.to
    );
    if (idx >= 0) {
      list[idx] = { ...list[idx], target, prize, note };
    } else {
      list.push({
        id: newGaraId(),
        kind,
        from: input.from,
        to: input.to,
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
    from: input.from,
    to: input.to,
    prize,
    prizeArgento,
    prizeBronzo,
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

/** Somma dell'imponibile (ordini ATTIVI) di un agente tra due date inclusive. */
export async function imponibileAgenteRange(
  agentId: string,
  from: string,
  to: string
): Promise<number> {
  const supabase = await createServerClient();
  if (!supabase) return 0;
  const { data, error } = await supabase
    .from("orders")
    .select("imponibile, stato")
    .eq("agent_id", agentId)
    .gte("data_ordine", from)
    .lte("data_ordine", to);
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

/** Classifica completa di un periodo per imponibile (solo ordini attivi). */
export async function getClassificaRange(
  from: string,
  to: string
): Promise<ClassificaRiga[]> {
  const admin = await createAdminClient();
  if (!admin) return [];
  const [agentsRes, ordersRes] = await Promise.all([
    admin.from("agents").select("id, nome, email, stato"),
    admin
      .from("orders")
      .select("agent_id, imponibile, stato")
      .gte("data_ordine", from)
      .lte("data_ordine", to),
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

/** (Compatibilità) classifica del singolo mese. */
export async function getClassificaMese(month: string): Promise<ClassificaRiga[]> {
  return getClassificaRange(`${month}-01`, lastDayOfMonth(month));
}

export type GaraAgenteView = {
  id: string;
  kind: IncentiveKind;
  from: string;
  to: string;
  target?: number;
  prize: number;
  prizeArgento?: number;
  prizeBronzo?: number;
  note?: string;
  /** Obiettivo imponibile della gara obiettivo con lo STESSO periodo (se c'è). */
  requisito?: number;
  current: number;
  reached: boolean;
  missing: number;
};

export type GareAgenteView = {
  from: string;
  to: string;
  gare: GaraAgenteView[];
} | null;

/**
 * Vista per l'agente: gare del periodo attivo (in corso / prossimo / ultimo),
 * con il suo imponibile del periodo calcolato una sola volta.
 */
export async function getGareAgente(
  agentId: string
): Promise<GareAgenteView> {
  const gare = await listIncentiveGare();
  if (gare.length === 0) return null;
  const periodo = periodoAttualeGare(gare);
  if (!periodo) return null;
  const items = gare.filter(
    (g) => g.from === periodo.from && g.to === periodo.to
  );
  if (items.length === 0) return null;

  const current = await imponibileAgenteRange(agentId, periodo.from, periodo.to);

  return {
    from: periodo.from,
    to: periodo.to,
    gare: items
      .sort((a, b) => {
        if (a.kind !== b.kind) return a.kind === "obiettivo" ? -1 : 1;
        return a.createdAt - b.createdAt;
      })
      .map((g) => {
        const target = g.kind === "obiettivo" ? Number(g.target ?? 0) : 0;
        // Obiettivo accoppiato allo stesso periodo (per la regola del vincitore).
        const requisito =
          g.kind === "vendite"
            ? items.find(
                (o) => o.kind === "obiettivo" && o.from === g.from && o.to === g.to
              )?.target
            : undefined;
        return {
          id: g.id,
          kind: g.kind,
          from: g.from,
          to: g.to,
          target: g.kind === "obiettivo" ? target : undefined,
          prize: g.prize,
          prizeArgento: g.prizeArgento,
          prizeBronzo: g.prizeBronzo,
          note: g.note,
          requisito:
            requisito !== undefined && Number.isFinite(Number(requisito))
              ? Number(requisito)
              : undefined,
          current,
          reached: g.kind === "obiettivo" ? current >= target : false,
          missing: g.kind === "obiettivo" ? Math.max(0, target - current) : 0,
        };
      }),
  };
}



