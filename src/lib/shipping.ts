/**
 * Calcolo spedizione/trasporto.
 * Formula originale del modulo WordPress (e del foglio ordine_template.xlsx):
 * "Trasporto 2,9% min. €9,50 max. €99,00"
 *   trasporto = clamp(imponibile * 2,9% , 9,50 , 99,00)
 *   IVA sul trasporto = trasporto * 22%
 *
 * Le regole sono configurabili dall'amministratore (Impostazioni → Spese di
 * spedizione): due metodi — percentuale (come da Excel, valori estrapolati dal
 * file e modificabili) oppure importo fisso (il sistema calcola l'IVA con la
 * formula attuale). Le funzioni accettano le impostazioni come parametro
 * opzionale: senza parametro si usano i valori di default (comportamento
 * attuale invariato).
 */

export const TRASPORTO_PERCENT = 0.029;
export const TRASPORTO_MIN = 9.5;
export const TRASPORTO_MAX = 99.0;
export const IVA_TRASPORTO_PERCENT = 22;

/** Regole spese di spedizione configurabili dall'amministratore. */
export type ShippingSettings = {
  /** Metodo di calcolo attivo. */
  method: "percentuale" | "fisso";
  /** Metodo percentuale: trasporto = clamp(imponibile*percent%, min, max). */
  percentuale: { percent: number; min: number; max: number };
  /** Metodo importo fisso: trasporto = amount (l'IVA viene calcolata sopra). */
  fisso: { amount: number };
  /** Aliquota IVA applicata al trasporto (percentuale, es. 22). */
  iva: number;
};

/** Valori di default = gli stessi attualmente usati dal template Excel. */
export const DEFAULT_SHIPPING_SETTINGS: ShippingSettings = {
  method: "percentuale",
  percentuale: {
    percent: TRASPORTO_PERCENT * 100,
    min: TRASPORTO_MIN,
    max: TRASPORTO_MAX,
  },
  fisso: { amount: 0 },
  iva: IVA_TRASPORTO_PERCENT,
};

export function calcTrasporto(
  imponibile: number,
  settings?: ShippingSettings
): number {
  const s = settings ?? DEFAULT_SHIPPING_SETTINGS;
  if (s.method === "fisso" && s.fisso.amount > 0) return s.fisso.amount;
  const base = imponibile * (s.percentuale.percent / 100);
  return Math.min(Math.max(base, s.percentuale.min), s.percentuale.max);
}

export function calcIvaTrasporto(
  imponibile: number,
  settings?: ShippingSettings
): number {
  const s = settings ?? DEFAULT_SHIPPING_SETTINGS;
  return calcTrasporto(imponibile, s) * (s.iva / 100);
}

/** Arrotonda a 2 decimali. */
export function round2(value: number): number {
  return Math.round(value * 100) / 100;
}
