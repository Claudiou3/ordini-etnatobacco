"use client";

import { useEffect, useState } from "react";
import type { Customer } from "@/lib/types";
import { formatDateTime } from "@/lib/format";
import { CustomerForm } from "./customer-form";
import { DeleteCustomerButton } from "./delete-customer-button";

/**
 * Card cliente cliccabile: toccando la card si apre la modifica (utile
 * soprattutto su smartphone/tablet dove la zona toccabile del pulsante
 * "Modifica" e' troppo piccola).
 */
export function CustomerCard({
  customer,
  canDelete = false,
}: {
  customer: Customer;
  /** Mostra il pulsante "Elimina" solo all'amministratore (default: nascosto). */
  canDelete?: boolean;
}) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;

    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", onKey);

    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = previous;
    };
  }, [open]);

  return (
    <article
      className={`customer-card${open ? " is-open" : ""}`}
      onClick={() => setOpen(true)}
      role="button"
      tabIndex={0}
      aria-label={`Modifica cliente ${customer.ragione_sociale}`}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          setOpen(true);
        }
      }}
    >
      <div className="customer-card-head">
        <div className="customer-card-main">
          <strong>{customer.ragione_sociale}</strong>
          {customer.email && <small>{customer.email}</small>}
        </div>
        <span className="customer-icon" aria-hidden="true">
          {customer.ragione_sociale.slice(0, 1)}
        </span>
      </div>

      <dl className="customer-card-meta">
        <div>
          <dt>Città</dt>
          <dd>
            {customer.citta ?? "—"}
            {customer.provincia ? ` (${customer.provincia})` : ""}
          </dd>
        </div>
        <div>
          <dt>P.IVA</dt>
          <dd>{customer.partita_iva ?? "—"}</dd>
        </div>
        <div>
          <dt>Codice fiscale</dt>
          <dd>{customer.codice_fiscale ?? "—"}</dd>
        </div>
        <div>
          <dt>Ultima modifica</dt>
          <dd>{formatDateTime(customer.updated_at)}</dd>
        </div>
      </dl>

      <div
        className="customer-card-actions"
        onClick={(event) => event.stopPropagation()}
      >
        <button
          type="button"
          className="outline-button table-button"
          onClick={() => setOpen(true)}
        >
          Modifica
        </button>
        {canDelete && (
          <DeleteCustomerButton
            id={customer.id}
            nome={customer.ragione_sociale}
          />
        )}
      </div>

      {open && (
        <div className="modal-overlay" onClick={() => setOpen(false)}>
          <div
            className="modal-panel"
            role="dialog"
            aria-modal="true"
            aria-label={`Modifica cliente ${customer.ragione_sociale}`}
            onClick={(event) => event.stopPropagation()}
          >
            <div className="modal-head">
              <h3>Modifica cliente</h3>
              <button
                type="button"
                className="modal-close"
                onClick={() => setOpen(false)}
                aria-label="Chiudi"
              >
                ×
              </button>
            </div>
            <CustomerForm customer={customer} onSaved={() => setOpen(false)} />
          </div>
        </div>
      )}
    </article>
  );
}
