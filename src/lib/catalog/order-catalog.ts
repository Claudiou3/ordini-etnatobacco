import { readCatalog, type CatalogItem } from "./template";
import {
  GIFT_EXCLUDED_PATTERNS,
  isAllowedGiftRicarica,
} from "./gift-rules";

/**
 * Raggruppamento del catalogo come nel vecchio modulo WordPress:
 * categorie "macro" (astucci, expo) e gruppi per modello con varianti.
 * Include anche il filtro per l'articolo in OMAGGIO.
 */

export type OrderVariant = {
  row: number;
  codice: string;
  descrizione: string;
  diottria: string;
  prezzo: number;
  iva: number; // percentuale
  sconto: number; // frazione (0.6 = 60%)
  netto: number; // prezzo * (1 - sconto)
  step4: boolean; // quantita' a multipli di 4 (decisione dell'amministratore)
};

export type OrderGroup = {
  name: string;
  macro?: boolean;
  variants: OrderVariant[];
};

const MACRO_CATEGORIES: { name: string; patterns: string[] }[] = [
  {
    name: "Astucci",
    patterns: [
      "Astuccio Nero Ecopelle e Cordicella 48pz",
      "Astuccio Tessuto 48pz",
      "IOI Astuccio Microfibra 48pz",
    ],
  },
  {
    name: "Expo Banco",
    patterns: ["De Tomaso Expo Banco 8pz", "De Tomaso Expo Banco 24pz"],
  },
  {
    name: "De Tomaso Expo Terra",
    patterns: ["De Tomaso Expo Terra 48pz", "De Tomaso Expo Terra 144pz"],
  },
  {
    name: "IOI Expo",
    patterns: ["IOI Expo Banco 24pz", "IOI Expo Terra 48pz", "IOI Expo Terra 80pz"],
  },
];

function toVariant(item: CatalogItem): OrderVariant {
  return {
    row: item.row,
    codice: item.codice,
    descrizione: item.descrizione,
    diottria: item.diottria,
    prezzo: item.prezzo,
    iva: item.iva,
    sconto: item.sconto,
    netto: item.nettoEscl,
    step4: item.step4,
  };
}

/** Catalogo raggruppato per il modulo ordine. */
export async function getOrderCatalog(): Promise<OrderGroup[]> {
  const items = await readCatalog();
  const macroBuckets = MACRO_CATEGORIES.map((m) => ({
    ...m,
    variants: [] as OrderVariant[],
  }));
  const normal: CatalogItem[] = [];

  for (const item of items) {
    let assigned = false;
    for (const bucket of macroBuckets) {
      if (bucket.patterns.some((p) => item.descrizione.includes(p))) {
        bucket.variants.push(toVariant(item));
        assigned = true;
        break;
      }
    }
    if (!assigned) normal.push(item);
  }

  const groups: OrderGroup[] = [];
  for (const bucket of macroBuckets) {
    if (bucket.variants.length > 0) {
      groups.push({ name: bucket.name, macro: true, variants: bucket.variants });
    }
  }

  const groupMap = new Map<string, OrderVariant[]>();
  const order: string[] = [];
  for (const item of normal) {
    let base = item.descrizione.replace(/\s+\+[\d,]+$/, "").trim();
    if (item.descrizione.includes("Ricarica")) {
      const match = item.descrizione.match(/Ricarica\s+(\d+)/);
      if (match) base = "Ricarica " + match[1];
    }
    if (!groupMap.has(base)) {
      groupMap.set(base, []);
      order.push(base);
    }
    groupMap.get(base)!.push(toVariant(item));
  }
  for (const name of order) {
    const variants = groupMap.get(name)!.sort((a, b) => a.row - b.row);
    groups.push({ name, variants });
  }

  // L'elenco rispecchia ESATTAMENTE l'ordine del file Excel: i gruppi
  // (macro e normali) vengono ordinati per la riga del primo articolo.
  return groups.sort((a, b) => {
    const aRow = Math.min(...a.variants.map((v) => v.row));
    const bRow = Math.min(...b.variants.map((v) => v.row));
    return aRow - bRow;
  });
}

/**
 * Articoli ammessi all'OMAGGIO: gli occhiali singoli (LETTURA/SOLE da 1 pezzo)
 * e le ricariche ammesse (confezioni "De Tomaso Ricarica 501..532 +diottria
 * 4pz"). Esclusi: kit, espositori (precaricati e non) e astucci.
 */
export async function getGiftArticles(): Promise<OrderVariant[]> {
  const items = await readCatalog();
  return items
    .filter((item) => {
      const tip = item.tipologia.trim().toUpperCase();
      if (tip !== "LETTURA" && tip !== "SOLE") return false;
      if (item.prezzo <= 0) return false;
      const ricaricaAmmessa = isAllowedGiftRicarica(item.descrizione);
      if (
        GIFT_EXCLUDED_PATTERNS.test(item.descrizione) &&
        !ricaricaAmmessa
      ) {
        return false;
      }
      // Omaggio = occhiale in confezione da 1 pezzo, ad eccezione delle
      // ricariche ammesse (confezioni da 4 pezzi: "4pz").
      if (item.pezzi !== 1 && !ricaricaAmmessa) return false;
      return true;
    })
    .map(toVariant);
}
