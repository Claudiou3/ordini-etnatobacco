"use client";

import { useState } from "react";
import Link from "next/link";

/**
 * Pop-up "Nuovo ordine" nella Consolle di comando.
 *
 * NESSUN POLLING PERIODICO: qui non ci sono setInterval/ping verso il server.
 * L'avviso compare SOLO se al caricamento della pagina risultano ordini non
 * letti (conteggio calcolato lato server come per tutte le altre pagine).
 * L'aggiornamento avviene a ogni normale caricamento/navigazione: è il
 * comportamento serverless standard di Vercel e non consuma CPU.
 */
export function NewOrderPopup({ initialUnread }: { initialUnread: number }) {
  const [open, setOpen] = useState(initialUnread > 0);

  if (!open || initialUnread === 0) return null;

  return (
    <div className="new-order-popup" role="alert">
      <span className="new-order-popup-icon" aria-hidden="true">
        📬
      </span>
      <div>
        <strong>Nuovo ordine{initialUnread > 1 ? ` (${initialUnread})` : ""}</strong>
        <span>
          {initialUnread === 1
            ? "È stato ricevuto un nuovo ordine."
            : `Sono stati ricevuti ${initialUnread} ordini non ancora letti.`}
        </span>
      </div>
      <Link href="/ordini" className="primary-button">
        Vai agli ordini
      </Link>
      <button
        type="button"
        className="new-order-popup-close"
        onClick={() => setOpen(false)}
        aria-label="Chiudi avviso"
        title="Chiudi"
      >
        ✕
      </button>
    </div>
  );
}
