"use client";

/**
 * Pulsante "Stampa" nella pagina di dettaglio ordine.
 * Usabile da TUTTI (agente, amministratore, sub-amministratore): apre la
 * finestra di stampa del browser con il documento ordine (anagrafica
 * completa, articoli e totali). La classe "print-hide" evita che il
 * pulsante stesso compaia nella pagina stampata.
 */
export function PrintOrderButton() {
  return (
    <button
      type="button"
      className="secondary-button print-hide"
      onClick={() => window.print()}
    >
      🖨 Stampa
    </button>
  );
}