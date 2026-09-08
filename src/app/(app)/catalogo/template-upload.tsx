"use client";

import { useActionState } from "react";
import { uploadTemplateAction, type TemplateUploadState } from "./actions";

export function TemplateUpload() {
  const [state, formAction, pending] = useActionState<
    TemplateUploadState,
    FormData
  >(uploadTemplateAction, {});

  return (
    <section className="content-panel">
      <div className="panel-heading">
        <div>
          <p className="eyebrow">Aggiornamento catalogo</p>
          <h2>Carica / sostituisci il file ordine_template.xlsx</h2>
          <p className="settings-help">
            Usa questa funzione quando l&apos;azienda ti consegna il file Excel
            aggiornato (es. con nuovi articoli). Il file sostituisce quello di
            lavoro usato da Catalogo e dagli ordini nuovi: online viene salvato
            su Supabase, in locale su <code>data/ordine_template.xlsx</code>.
          </p>
        </div>
      </div>

      <form action={formAction} className="incentive-form">
        <label className="form-field">
          <span className="form-label">File Excel (.xlsx)</span>
          <input
            className="form-input"
            type="file"
            name="file"
            accept=".xlsx"
            required
          />
        </label>
        {state.error && (
          <p className="form-error" role="alert">
            {state.error}
          </p>
        )}
        {state.success && (
          <p className="form-note" role="status">
            File catalogo aggiornato con successo.
          </p>
        )}
        <div className="form-actions">
          <button
            type="submit"
            className="primary-button"
            disabled={pending}
          >
            {pending ? "Caricamento…" : "Aggiorna file catalogo"}
          </button>
        </div>
      </form>

      <p className="settings-help">
        Nota: se i nuovi articoli vengono inseriti nel mezzo del file, gli
        eventuali vincoli &quot;multipli di 4&quot; configurati in precedenza
        restano legati alle vecchie righe e vanno ricontrollati.
      </p>
    </section>
  );
}
