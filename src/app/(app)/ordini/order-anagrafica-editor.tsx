"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { updateOrderAnagraficaAction } from "./actions";
import type { OrderAnagrafica } from "@/lib/orders/order-anagrafica";

/**
 * Pulsante "Correggi anagrafica" (SOLO amministratore principale) con modale
 * per correggere gli errori di battitura dell'anagrafica di UN ordine.
 *
 * La correzione e' legata al singolo ordine: non modifica l'ordine originale,
 * il file Excel ne' l'anagrafica condivisa dei clienti.
 */
export function OrderAnagraficaEditor({
  orderId,
  numeroOrdine,
  cliente,
  initial,
}: {
  orderId: string;
  numeroOrdine: string;
  cliente: string;
  initial: OrderAnagrafica;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function handleSubmit(formData: FormData) {
    setError(null);
    startTransition(async () => {
      const res = await updateOrderAnagraficaAction({}, formData);
      if (res.error) {
        setError(res.error);
        return;
      }
      setOpen(false);
      router.refresh();
    });
  }

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape" && !pending) setOpen(false);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, pending]);

  return (
    <div className="print-hide">
      <button
        type="button"
        className="outline-button"
        onClick={() => setOpen(true)}
        disabled={pending}
      >
        ✏️ Correggi anagrafica
      </button>

      {open && (
        <div
          className="modal-overlay"
          onClick={(e) => {
            if (e.target === e.currentTarget && !pending) setOpen(false);
          }}
        >
          <div
            className="modal-panel"
            role="dialog"
            aria-modal="true"
            aria-label="Correggi anagrafica ordine"
          >
            <div className="modal-head">
              <h3>Correggi anagrafica ordine</h3>
              <button
                type="button"
                className="modal-close"
                onClick={() => setOpen(false)}
                disabled={pending}
                aria-label="Chiudi"
              >
                ×
              </button>
            </div>

            <p className="list-meta">
              Ordine <strong>{numeroOrdine}</strong> — cliente{" "}
              <strong>{cliente}</strong>. La correzione vale{" "}
              <strong>solo per questo ordine</strong>: l&apos;ordine originale,
              il file Excel e l&apos;anagrafica condivisa dei clienti restano
              invariati.
            </p>

            <form action={handleSubmit} className="customer-form">
              <input type="hidden" name="order_id" value={orderId} />
              <div className="form-grid">
                <label className="form-field span-2">
                  <span className="form-label">Ragione sociale *</span>
                  <input
                    className="form-input"
                    name="ragione_sociale"
                    defaultValue={initial.ragione_sociale}
                    required
                    maxLength={200}
                    autoFocus
                  />
                </label>

                <label className="form-field span-2">
                  <span className="form-label">Indirizzo</span>
                  <input
                    className="form-input"
                    name="indirizzo"
                    defaultValue={initial.indirizzo}
                    maxLength={255}
                  />
                </label>

                <label className="form-field">
                  <span className="form-label">CAP</span>
                  <input
                    className="form-input"
                    name="cap"
                    defaultValue={initial.cap}
                    maxLength={10}
                  />
                </label>

                <label className="form-field">
                  <span className="form-label">Città</span>
                  <input
                    className="form-input"
                    name="citta"
                    defaultValue={initial.citta}
                    maxLength={100}
                  />
                </label>

                <label className="form-field">
                  <span className="form-label">Provincia</span>
                  <input
                    className="form-input"
                    name="provincia"
                    defaultValue={initial.provincia}
                    maxLength={2}
                  />
                </label>

                <label className="form-field">
                  <span className="form-label">P.IVA</span>
                  <input
                    className="form-input"
                    name="partita_iva"
                    defaultValue={initial.partita_iva}
                    maxLength={20}
                  />
                </label>

                <label className="form-field">
                  <span className="form-label">Codice fiscale</span>
                  <input
                    className="form-input"
                    name="codice_fiscale"
                    defaultValue={initial.codice_fiscale}
                    maxLength={20}
                  />
                </label>

                <label className="form-field">
                  <span className="form-label">SDI</span>
                  <input
                    className="form-input"
                    name="sdi"
                    defaultValue={initial.sdi}
                    maxLength={7}
                  />
                </label>

                <label className="form-field">
                  <span className="form-label">Cellulare</span>
                  <input
                    className="form-input"
                    name="cellulare"
                    defaultValue={initial.cellulare}
                    maxLength={30}
                  />
                </label>

                <label className="form-field span-2">
                  <span className="form-label">Email</span>
                  <input
                    className="form-input"
                    type="email"
                    name="email"
                    defaultValue={initial.email}
                    maxLength={200}
                  />
                </label>
              </div>

              {error && (
                <p className="form-error" role="alert">
                  {error}
                </p>
              )}

              <div className="form-actions">
                <button
                  type="button"
                  className="outline-button"
                  onClick={() => setOpen(false)}
                  disabled={pending}
                >
                  Annulla
                </button>
                <button
                  className="primary-button"
                  type="submit"
                  disabled={pending}
                >
                  {pending ? "Salvataggio…" : "Salva correzione"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
