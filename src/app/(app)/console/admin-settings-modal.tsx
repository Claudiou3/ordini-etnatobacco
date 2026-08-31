"use client";

import { useEffect, useState } from "react";
import { AdminCredentialsPanel } from "./admin-credentials-panel";

/**
 * Pulsante "Impostazioni" della Consolle: apre il modale con il pannello
 * per SOSTITUIRE l'utente amministratore (indirizzo email) e la password.
 */
export function AdminSettingsModal() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <>
      <button
        type="button"
        className="outline-button"
        onClick={() => setOpen(true)}
      >
        ⚙️ Impostazioni
      </button>

      {open && (
        <div
          className="modal-overlay"
          onClick={(e) => {
            if (e.target === e.currentTarget) setOpen(false);
          }}
        >
          <div
            className="modal-panel"
            role="dialog"
            aria-modal="true"
            aria-label="Impostazioni account"
          >
            <div className="modal-head">
              <h3>Impostazioni</h3>
              <button
                type="button"
                className="modal-close"
                onClick={() => setOpen(false)}
                aria-label="Chiudi"
              >
                ×
              </button>
            </div>

            <AdminCredentialsPanel />
          </div>
        </div>
      )}
    </>
  );
}
