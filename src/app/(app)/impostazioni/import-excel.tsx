"use client";

import { useRef, useState } from "react";
import { importCustomersExcel, type ImportExcelState } from "./actions";

type ImportMsg = { type: "ok" | "err"; text: string } | null;

export function ImportExcel() {
  const inputRef = useRef<HTMLInputElement>(null);
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<ImportMsg>(null);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const file = inputRef.current?.files?.[0];
    if (!file) {
      setMessage({ type: "err", text: "Scegli un file Excel (.xlsx)." });
      return;
    }

    const formData = new FormData();
    formData.append("file", file);

    setPending(true);
    setMessage(null);
    const res: ImportExcelState = await importCustomersExcel(formData);
    setPending(false);

    if (res.error) {
      setMessage({ type: "err", text: res.error });
      return;
    }
    setMessage({
      type: "ok",
      text:
        `Importazione completata: ${res.inserted ?? 0} nuovi inseriti, ` +
        `${res.updated ?? 0} aggiornati (anche P.IVA/CF cambiati), ${res.skipped ?? 0} scartati.` +
        (res.note ? ` ${res.note}` : ""),
    });
    if (inputRef.current) inputRef.current.value = "";
  }

  return (
    <div className="content-panel">
      <div className="panel-heading">
        <div>
          <p className="eyebrow">Anagrafica clienti</p>
          <h2>Carica / aggiorna dal file Excel</h2>
          <p className="settings-help">
            Carica <code>anagrafica_clienti.xlsx</code>: chi è già presente con
            la stessa <strong>P.IVA o codice fiscale</strong> viene aggiornato
            riscrivendo anche CF/P.IVA cambiati (es. cambio di gestione
            padre&rarr;figlio); gli <strong>ordini già emessi mantengono</strong> la
            P.IVA/CF di allora. I nuovi clienti vengono <strong>inseriti</strong>.
            Nessun cliente viene mai eliminato.
          </p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="settings-row">
        <input
          ref={inputRef}
          type="file"
          accept=".xlsx"
          className="form-input import-input"
          disabled={pending}
        />
        <button className="primary-button table-button" type="submit" disabled={pending}>
          {pending
            ? "Importazione in corso… (1-2 min, non chiudere la pagina)"
            : "Carica e importa"}
        </button>
      </form>

      {message && (
        <p className={message.type === "ok" ? "form-note" : "form-error"} role="status">
          {message.text}
        </p>
      )}
    </div>
  );
}
