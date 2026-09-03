/**
 * Regole catalogo e omaggi (modulo puro, utilizzabile anche nel browser):
 * - OMAGGIO: solo occhiali singoli (niente kit, espositori, astucci, ricariche);
 *   totale omaggi max 10 pezzi, anche su articoli/diottrie differenti.
 * - QUANTITA' MULTIPLI DI 4: tutti gli articoli eccetto KIT, espositori
 *   (precaricati e da banco) e accessori (astucci) devono essere ordinati
 *   a multipli di 4.
 */

export const GIFT_MAX_QTY = 10;

/** Quantita' valida per una singola riga omaggio (1..10). */
export function isValidGiftQty(qty: number): boolean {
  return Number.isInteger(qty) && qty >= 1 && qty <= GIFT_MAX_QTY;
}

/** Totale omaggi valido: da 1 a 10 pezzi complessivi. */
export function isValidGiftTotal(total: number): boolean {
  return Number.isInteger(total) && total >= 1 && total <= GIFT_MAX_QTY;
}

/**
 * Descrivono un articolo NON candidabile a omaggio: restano ammessi SOLO
 * gli occhiali singoli e le ricariche consentite (vedi sotto).
 */
export const GIFT_EXCLUDED_PATTERNS = /expo|kit|astuccio|ricarica/i;

/**
 * Ricariche ammesse come OMAGGIO: le confezioni
 * "De Tomaso Ricarica 501..532 +diottria 4pz" (restano escluse le altre
 * ricariche, es. RDT).
 */
const GIFT_ALLOWED_RICARICA =
  /^De Tomaso Ricarica (50[1-9]|51[0-9]|52[0-9]|53[0-2]) \+[\d,]+ 4pz$/i;

/** True se l'articolo e' una ricarica ammessa come omaggio. */
export function isAllowedGiftRicarica(descrizione: string): boolean {
  return GIFT_ALLOWED_RICARICA.test(descrizione);
}

/**
 * Un articolo richiede quantita' multipli di 4 se NON e' un KIT, un
 * espositore (precaricato o da banco) o un accessorio (astuccio).
 * Es.: occhiali DT100x e ricariche RDT -> multipli di 4;
 *      KIT, Expo, Astucci -> quantita' libera (anche 1 pezzo).
 */
export function requiresStep4(descrizione: string): boolean {
  return !/(expo|kit|astuccio)/i.test(descrizione);
}

/** Un articolo e' un KIT (sfondo verde e badge in catalogo).
 *  Include anche "Expo Pre-Caricato 160pz" (KDT160), che l'azienda
 *  tratta come un kit: dropdown e pulsanti verdi come i KIT/MIX. */
export function isKit(descrizione: string): boolean {
  return /(\bkit\b|pre-caricato\s+160pz)/i.test(descrizione);
}

/** Un articolo e' un MIX (es. "Kit Mix"): pulsanti verdi come i KIT. */
export function isMix(descrizione: string): boolean {
  return /\bmix\b/i.test(descrizione);
}

/** Quantita' valida per gli articoli a multipli di 4. */
export function isMultipleOf4(qty: number): boolean {
  return Number.isInteger(qty) && qty >= 0 && qty % 4 === 0;
}

