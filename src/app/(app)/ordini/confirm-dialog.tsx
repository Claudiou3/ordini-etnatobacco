"use client";

import { useEffect } from "react";

/**
 * Dialogo di conferma generico con pulsanti "Sì" e "No".
 * Alla prima pressione del pulsante di eliminazione il sistema chiede:
 * "Sei certo di volerlo eliminare?" — con "Sì" si elimina definitivamente,
 * con "No" l'elemento resta nel sistema.
 */
export function ConfirmDialog({
  title,
  message,
  confirmLabel = "Sì",
  cancelLabel = "No",
  busy = false,
  onConfirm,
  onCancel,
}: {
  title: string;
  message: React.ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape" && !busy) onCancel();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onCancel, busy]);

  return (
    <div
      className="modal-overlay"
      onClick={(e) => {
        if (e.target === e.currentTarget && !busy) onCancel();
      }}
    >
      <div
        className="modal-panel confirm-modal"
        role="alertdialog"
        aria-modal="true"
        aria-label={title}
      >
        <div className="modal-head">
          <h3>{title}</h3>
        </div>
        <div className="confirm-body">{message}</div>
        <div className="confirm-actions">
          <button
            type="button"
            className="outline-button"
            onClick={onCancel}
            disabled={busy}
            autoFocus
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            className="danger-button"
            onClick={onConfirm}
            disabled={busy}
          >
            {busy ? "Eliminazione…" : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
