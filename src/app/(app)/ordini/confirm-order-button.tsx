"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { confirmOrderAction } from "./actions";

/**
 * Pulsante "Confermato" nel dettaglio ordine (solo amministratore):
 * da qui l'ordine passa da "Non Confermato" a "Confermato". L'apertura
 * dell'ordine da sola non basta piu'.
 */
export function ConfirmOrderButton({
  orderId,
  confirmed,
}: {
  orderId: string;
  confirmed: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function handleConfirm() {
    setBusy(true);
    setMessage(null);
    const res = await confirmOrderAction(orderId);
    setBusy(false);
    if (res.error) {
      setMessage(res.error);
      return;
    }
    setMessage("Ordine confermato.");
    router.refresh();
  }

  if (confirmed) {
    return (
      <p className="form-note" role="status">
        ✅ Ordine <strong>confermato</strong>.
      </p>
    );
  }

  return (
    <div className="anagrafica-save">
      <button
        type="button"
        className="green-button"
        onClick={() => void handleConfirm()}
        disabled={busy}
      >
        {busy ? "Conferma in corso…" : "Confermato"}
      </button>
      <p className="settings-help">
        L&apos;ordine è ancora <strong>Non Confermato</strong>. Premi
        &quot;Confermato&quot; per toglierlo dall&apos;elenco degli ordini in
        rosso.
      </p>
      {message && <p className="form-error">{message}</p>}
    </div>
  );
}
