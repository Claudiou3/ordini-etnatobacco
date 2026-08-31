"use client";

import { useEffect } from "react";

/**
 * Avvia la stampa del browser non appena la pagina e' pronta.
 * Usato dal pulsante "stampa" dell'amministratore (?print=1).
 */
export function PrintTrigger() {
  useEffect(() => {
    const timer = setTimeout(() => {
      window.print();
    }, 400);
    return () => clearTimeout(timer);
  }, []);
  return null;
}
