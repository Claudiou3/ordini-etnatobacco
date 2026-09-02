"use client";

import { useEffect, useState } from "react";
import { SubadminsForm } from "./subadmins-form";
import type { SubadminView } from "@/lib/subadmin/types";

/**
 * Pulsante "Utenti" della Consolle di comando: apre il modale con la sezione
 * "Sub-amministratori / Utenti con accesso in sola lettura" (6 slot email +
 * password). Visibile solo all'amministratore principale: i sub-amministratori
 * sono in sola lettura e non gestiscono altri utenti.
 */
export function UsersModal({ subadmins }: { subadmins: SubadminView[] }) {
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
        👥 Utenti
      </button>

      {open && (
        <div
          className="modal-overlay"
          onClick={(e) => {
            if (e.target === e.currentTarget) setOpen(false);
          }}
        >
          <div
            className="modal-panel users-modal-panel"
            role="dialog"
            aria-modal="true"
            aria-label="Utenti con accesso in sola lettura"
          >
            <div className="modal-head">
              <h3>Utenti con accesso in sola lettura</h3>
              <button
                type="button"
                className="modal-close"
                onClick={() => setOpen(false)}
                aria-label="Chiudi"
              >
                ×
              </button>
            </div>

            <div className="panel-heading">
              <div>
                <p className="eyebrow">Sub-amministratori</p>
                <h2>Utenti con accesso in sola lettura</h2>
              </div>
            </div>

            <SubadminsForm subadmins={subadmins} />
          </div>
        </div>
      )}
    </>
  );
}
