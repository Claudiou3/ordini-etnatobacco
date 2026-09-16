"use client";

import { useActionState } from "react";
import type { CustomerCopySettings } from "@/lib/customer-copy";
import {
  saveCustomerCopySettingsAction,
  type CustomerCopyActionState,
} from "./actions";

/**
 * "Copia dell'ordine al cliente" (area Impostazioni).
 *
 * Interruttore generale deciso dall'amministratore:
 *  - DISATTIVATO (predefinito): nel modulo "Nuovo ordine" degli agenti non
 *    compare nulla di nuovo e nessuna copia viene inviata ai clienti;
 *  - ATTIVATO: in "Nuovo ordine", al Passo 6, l'agente puo' decidere ordine per
 *    ordine se inviare al cliente la copia (solo la stampa, senza file Excel).
 *
 * L'ordine ufficiale (email con il modulo Excel allegato) parte sempre verso
 * l'ufficio, esattamente come prima: questa copia e' un invio separato.
 */
export function CustomerCopyForm({
  settings,
}: {
  settings: CustomerCopySettings;
}) {
  const [state, formAction, pending] = useActionState<
    CustomerCopyActionState,
    FormData
  >(saveCustomerCopySettingsAction, {});

  return (
    <section className="content-panel">
      <div className="panel-heading">
        <div>
          <p className="eyebrow">Copia al cliente</p>
          <h2>Invia al cliente la copia dell&apos;ordine</h2>
          <p className="settings-help">
            Quando è attiva, l&apos;agente può inviare al cliente una copia
            dell&apos;ordine: solo il documento di stampa (nessun file Excel),
            all&apos;indirizzo email del cliente indicato nell&apos;ordine
            (anagrafica, oppure inserito dall&apos;agente). L&apos;ordine
            ufficiale con il modulo Excel continua ad arrivare all&apos;ufficio
            come sempre.
          </p>
        </div>
        <span
          className={`status-pill${settings.enabled ? " status-pill-on" : ""}`}
        >
          {settings.enabled ? "Attiva" : "Disattivata"}
        </span>
      </div>

      <form action={formAction}>
        <label
          className="customer-copy-opt"
          style={{
            display: "flex",
            gap: 10,
            alignItems: "flex-start",
            margin: "10px 0",
            padding: "10px 12px",
            border: "1px solid #e2e8f0",
            borderRadius: 10,
            background: "#f8fafc",
            fontSize: 14,
            cursor: "pointer",
          }}
        >
          <input
            type="checkbox"
            name="enabled"
            value="1"
            defaultChecked={settings.enabled}
            style={{ marginTop: 3 }}
          />
          <span>
            <strong>Abilita l&apos;invio della copia al cliente</strong>
            <br />
            Se disattivata, gli agenti non vedono alcuna opzione nuova e le
            copie non vengono inviate ai clienti.
          </span>
        </label>

        <label className="form-field">
          <span className="form-label">
            Messaggio facoltativo in coda all&apos;email del cliente
          </span>
          <textarea
            className="form-input"
            name="message"
            rows={3}
            maxLength={800}
            defaultValue={settings.message}
            placeholder="Es. Grazie per l'ordine. Per qualsiasi informazione risponda a questa email."
          />
        </label>

        <div className="form-actions">
          <button
            className="primary-button"
            type="submit"
            disabled={pending}
          >
            {pending ? "Salvataggio…" : "Salva impostazione"}
          </button>
        </div>
      </form>

      {state.error && (
        <p className="form-error" role="alert">
          {state.error}
        </p>
      )}
      {state.success && (
        <p className="form-note" role="status">
          Impostazione salvata.
        </p>
      )}
    </section>
  );
}
