import type { OrderListItem } from "@/lib/types";

/**
 * Orario di ARRIVO (trasmissione) di un ordine in millisecondi:
 * priorita' assoluta a `created_at` (timestamp di trasmissione).
 * Se manca, ripiega sulla data ordine (inizio giornata).
 */
function arrivalMs(o: OrderListItem): number {
  if (o.created_at) {
    const t = Date.parse(o.created_at);
    if (!Number.isNaN(t)) return t;
  }
  const t = Date.parse(`${o.data_ordine}T00:00:00.000Z`);
  return Number.isNaN(t) ? 0 : t;
}

/**
 * Ordina gli ordini per ARRIVO (dal piu' recente al piu' vecchio):
 * l'ultimo ordine trasmesso e' sempre il primo della lista. A parita' di
 * timestamp spicca il numero progressivo piu' alto.
 */
export function sortOrdersByArrival(list: OrderListItem[]): OrderListItem[] {
  return [...list].sort((a, b) => {
    const diff = arrivalMs(b) - arrivalMs(a);
    if (diff !== 0) return diff;
    return b.numero_ordine.localeCompare(a.numero_ordine);
  });
}
