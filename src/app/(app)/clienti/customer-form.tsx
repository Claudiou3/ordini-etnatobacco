"use client";

import { useActionState, useEffect } from "react";
import type { Customer } from "@/lib/types";
import { createCustomer, updateCustomer, type CustomerActionState } from "./actions";

export function CustomerForm({
  customer,
  onSaved,
}: {
  customer?: Customer;
  onSaved?: () => void;
}) {
  const action = customer ? updateCustomer : createCustomer;
  const [state, formAction, pending] = useActionState<CustomerActionState, FormData>(
    action,
    {}
  );
  const c = customer;

  useEffect(() => {
    if (state.success) onSaved?.();
  }, [state.success, onSaved]);

  return (
    <form action={formAction} className="customer-form">
      {c && <input type="hidden" name="id" value={c.id} />}

      <div className="form-grid">
        <label className="form-field span-2">
          <span className="form-label">Ragione sociale *</span>
          <input
            className="form-input"
            name="ragione_sociale"
            defaultValue={c?.ragione_sociale ?? ""}
            required
            maxLength={200}
          />
        </label>

        <label className="form-field span-2">
          <span className="form-label">Indirizzo</span>
          <input
            className="form-input"
            name="indirizzo"
            defaultValue={c?.indirizzo ?? ""}
            maxLength={255}
          />
        </label>

        <label className="form-field">
          <span className="form-label">CAP</span>
          <input className="form-input" name="cap" defaultValue={c?.cap ?? ""} maxLength={10} />
        </label>

        <label className="form-field">
          <span className="form-label">Città</span>
          <input className="form-input" name="citta" defaultValue={c?.citta ?? ""} maxLength={100} />
        </label>

        <label className="form-field">
          <span className="form-label">Provincia</span>
          <input
            className="form-input"
            name="provincia"
            defaultValue={c?.provincia ?? ""}
            maxLength={2}
          />
        </label>

        <label className="form-field">
          <span className="form-label">P.IVA</span>
          <input
            className="form-input"
            name="partita_iva"
            defaultValue={c?.partita_iva ?? ""}
            maxLength={20}
          />
        </label>

        <label className="form-field">
          <span className="form-label">Codice fiscale</span>
          <input
            className="form-input"
            name="codice_fiscale"
            defaultValue={c?.codice_fiscale ?? ""}
            maxLength={20}
          />
        </label>

        <label className="form-field">
          <span className="form-label">SDI</span>
          <input className="form-input" name="sdi" defaultValue={c?.sdi ?? ""} maxLength={7} />
        </label>

        <label className="form-field">
          <span className="form-label">Cellulare</span>
          <input
            className="form-input"
            name="cellulare"
            defaultValue={c?.cellulare ?? ""}
            maxLength={30}
          />
        </label>

        <label className="form-field span-2">
          <span className="form-label">Email</span>
          <input
            className="form-input"
            type="email"
            name="email"
            defaultValue={c?.email ?? ""}
            maxLength={200}
          />
        </label>
      </div>

      {state.error && (
        <p className="form-error" role="alert">
          {state.error}
        </p>
      )}
      {state.success && (
        <p className="form-note" role="status">
          Cliente salvato.
        </p>
      )}

      <div className="form-actions">
        <button className="primary-button" type="submit" disabled={pending}>
          {pending ? "Salvataggio…" : c ? "Salva modifiche" : "Inserisci cliente"}
        </button>
      </div>
    </form>
  );
}
