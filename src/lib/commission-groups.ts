/**
 * Gruppi di provvigione (modulo PURO, utilizzabile anche nel browser).
 * - OCCCHIALI / KIT / MIX: occhiali (LETTURA/SOLE), kit, kit mix e ricariche.
 * - ESPOSITORI: espositori (Expo Banco, Expo Terra, Pre-Caricato).
 * - ASTUCCI: astucci (ecopelle, tessuto, microfibra).
 * La provvigione si calcola sull'IMPONIBILE (merce, senza spedizione e IVA).
 */

export const COMMISSION_GROUPS = [
  { key: "occhiali", label: "Occhiali / Kit / Mix" },
  { key: "espositori", label: "Espositori" },
  { key: "astucci", label: "Astucci" },
] as const;

export type CommissionGroupKey = (typeof COMMISSION_GROUPS)[number]["key"];
export type CommissionRates = Record<CommissionGroupKey, number>;

/** Classifica un articolo (dalla sua descrizione) nel gruppo di provvigione. */
export function classifyGroup(descrizione: string): CommissionGroupKey {
  if (/astuccio/i.test(descrizione)) return "astucci";
  if (/expo/i.test(descrizione)) return "espositori";
  return "occhiali";
}

export type AgentOrderRow = {
  id: string;
  numero: string;
  data: string;
  cliente: string | null;
  imponibile: number;
  /** Imponibile per gruppo di questo singolo ordine (per i filtri mensili). */
  groups: CommissionRates;
};

export type AgentCommissionData = {
  id: string;
  nome: string;
  email: string;
  /** Stato dell'agente: "attivo" oppure "disattivato". */
  stato: string;
  orders: AgentOrderRow[];
  groups: CommissionRates; // imponibile per gruppo (solo merce)
  totale: number; // somma imponibile per gruppo
};

/** Riga ordine vista dall'agente: imponibile e provvigione del singolo ordine. */
export type AgentOrderCommissionRow = {
  id: string;
  numero: string;
  data: string;
  imponibile: number;
  /** Provvigione (euro) calcolata su questo singolo ordine. */
  commissione: number;
  groups: CommissionRates;
};

/** Raggruppamento degli ordini dell'agente per cliente. */
export type ClientCommissionData = {
  cliente: string;
  orders: AgentOrderCommissionRow[];
  groups: CommissionRates; // imponibile per gruppo (solo merce)
  totale: number; // imponibile complessivo
  commissione: number; // provvigione complessiva (euro)
};

/** Vista lato agente: percentuali + raggruppamento per cliente. */
export type AgentCommissionView = {
  rates: CommissionRates;
  clients: ClientCommissionData[];
};
