"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { getUnreadOrdersCountAction } from "./actions";

/**
 * Pop-up "Nuovo ordine" nella Consolle di comando.
 * Controlla ogni 15 secondi il numero di ordini non letti: se arriva un nuovo
 * ordine (il conteggio aumenta) mostra il pop-up con la scritta "Nuovo ordine".
 */
export function NewOrderPopup({ initialUnread }: { initialUnread: number }) {
  const [open, setOpen] = useState(initialUnread > 0);
  const [count, setCount] = useState(initialUnread);
  const lastCountRef = useRef(initialUnread);

  useEffect(() => {
    let cancelled = false;
    async function poll() {
      try {
        const res = await getUnreadOrdersCountAction();
        if (cancelled) return;
        setCount(res.count);
        // Nuovo ordine arrivato mentre la Consolle è aperta.
        if (res.count > 0 && res.count > lastCountRef.current) {
          setOpen(true);
        }
        lastCountRef.current = res.count;
      } catch {
        // rete momentaneamente non disponibile: si riprova al prossimo giro
      }
    }
    const id = setInterval(poll, 15000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, []);

  if (!open) return null;

  return (
    <div className="new-order-popup" role="alert">
      <span className="new-order-popup-icon" aria-hidden="true">
        📬
      </span>
      <div>
        <strong>Nuovo ordine{count > 1 ? ` (${count})` : ""}</strong>
        <span>
          {count === 1
            ? "È stato ricevuto un nuovo ordine."
            : `Sono stati ricevuti ${count} ordini non ancora letti.`}
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
