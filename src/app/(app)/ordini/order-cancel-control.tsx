"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { cancelOrderAction, restoreOrderAction } from "./actions";

/**
 * Controlli ANNULLA / RIPRISTINA ordine (dettaglio ordine, lato admin).
 * L'annullamento richiede una motivazione: l'ordine resta visibile in grigio
 * scuro per l'agente e non genera provvigioni.
 */
export function OrderCancelControl({
  orderId,
  numeroOrdine,
  cliente,
  isCancelled,
  canManage,
}: {
  orderId: string;
  numeroOrdine: string;
  cliente: string;
  isCancelled: boolean;
  canManage: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [motivo, setMotivo] = useState("");
  const [busy, setBusy] = useState(false);

  async function doCancel() {
    const m = motivo.trim();
    if (!m) {
      window.alert("Inserisci la motivazione dell'annullamento.");
      return;
    }
    setBusy(true);
    const res = await cancelOrderAction(orderId, m);
    setBusy(false);
    if (res.error) {
      window.alert(res.error);
      return;
    }
    setOpen(false);
    setMotivo("");
    router.refresh();
  }

  async function doRestore() {
    const ok = window.confirm(
      `Ripristinare l'ordine ${numeroOrdine}? Tornerà "attivo" e le provvigioni verranno di nuovo conteggiate.`
    );
    if (!ok) return;
    setBusy(true);
    const res = await restoreOrderAction(orderId);
    setBusy(false);
    if (res.error) {
      window.alert(res.error);
      return;
    }
    router.refresh();
  }

  if (!canManage) return null;

  return (
    <div className="order-cancel-control">
      {isCancelled ? (
        <button
          type="button"
          className="outline-button"
          onClick={() => void doRestore()}
          disabled={busy}
        >
          {busy ? "Ripristino…" : "↩ Ripristina ordine"}
        </button>
      ) : (
        <button
          type="button"
          className="danger-button"
          onClick={() => setOpen(true)}
          disabled={busy}
        >
          ✕ Annulla ordine
        </button>
      )}

      {open && (
        <div
          className="modal-overlay"
          onClick={(e) => {
            if (e.target === e.currentTarget && !busy) setOpen(false);
          }}
        >
          <div
            className="modal-panel confirm-modal"
            role="dialog"
            aria-modal="true"
            aria-label="Annulla ordine"
          >
            <div className="modal-head">
              <h3>Annulla ordine</h3>
            </div>
            <div className="confirm-body">
              <p>
                Annullare <strong>{numeroOrdine}</strong> per{" "}
                <strong>{cliente}</strong>?<br />
                L&apos;ordine resterà visibile in grigio scuro e{" "}
                <strong>l&apos;agente non riceverà provvigioni</strong>.
              </p>
              <label className="form-field">
                <span className="form-label">
                  Motivazione dell&apos;annullamento *
                </span>
                <textarea
                  className="form-input cancel-reason-input"
                  value={motivo}
                  onChange={(e) => setMotivo(e.target.value)}
                  rows={3}
                  maxLength={500}
                  autoFocus
                  placeholder="es. Il cliente ha rifiutato la merce"
                />
              </label>
            </div>
            <div className="confirm-actions">
              <button
                type="button"
                className="outline-button"
                onClick={() => setOpen(false)}
                disabled={busy}
              >
                Indietro
              </button>
              <button
                type="button"
                className="danger-button"
                onClick={() => void doCancel()}
                disabled={busy || motivo.trim().length === 0}
              >
                {busy ? "Annullamento…" : "Conferma annullamento"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
