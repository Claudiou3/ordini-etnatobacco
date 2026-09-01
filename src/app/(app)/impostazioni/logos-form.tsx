"use client";

import { useState } from "react";
import { deleteLogoAction, uploadLogoAction } from "./actions";
import type { LogoInfo } from "@/lib/logos";

/**
 * Sezione "Loghi" delle Impostazioni: due campi liberi per CARICARE,
 * SOSTITUIRE ed ELIMINARE il PRIMO logo (quello in alto) e il SECONDO
 * logo (sotto). Formati ammessi: JPG e PNG. Le immagini vengono
 * ridimensionate automaticamente alla misura del logo attuale.
 */
export function LogosForm({
  logos,
}: {
  logos: { logo1: LogoInfo; logo2: LogoInfo };
}) {
  const [busy, setBusy] = useState<1 | 2 | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  // Il primo logo "caricato dall'amministratore" (quello originale in
  // public/logo-detomaso.png non ha l'URL /logo-files/...).
  const logo1Custom = logos.logo1.src.startsWith("/logo-files/");

  async function handleUpload(position: 1 | 2, file: File) {
    setBusy(position);
    setError(null);
    setMessage(null);
    const formData = new FormData();
    formData.append("file", file);
    const res = await uploadLogoAction(position, formData);
    if (!res.ok) {
      setError(
        `Errore nel caricamento del logo ${
          position === 1 ? "1" : "2"
        }: ${res.error ?? "riprova."}`
      );
    } else {
      setMessage(
        `Logo ${position === 1 ? "1" : "2"} ${
          position === 1 && !logo1Custom ? "caricato" : "sostituito"
        }. Ricarico la pagina…`
      );
      // Ricarica COMPLETA della pagina: garantisce che sidebar, login e
      // anteprime mostrino subito l'immagine nuova (aggira eventuali
      // versioni vecchie tenute in memoria dal browser).
      window.setTimeout(() => window.location.reload(), 600);
    }
    setBusy(null);
  }

  async function handleDelete(position: 1 | 2) {
    const isFirst = position === 1;
    const ok = window.confirm(
      isFirst
        ? "Eliminare il primo logo caricato? Verrà ripristinato il logo originale."
        : "Eliminare il secondo logo? Non comparirà più sotto il primo."
    );
    if (!ok) return;
    setBusy(position);
    setError(null);
    setMessage(null);
    const res = await deleteLogoAction(position);
    if (!res.ok) {
      setError(
        `Errore durante l'eliminazione del logo ${
          isFirst ? "1" : "2"
        }: ${res.error ?? "riprova."}`
      );
    } else {
      setMessage(
        isFirst
          ? "Primo logo eliminato: è stato ripristinato il logo originale. Ricarico la pagina…"
          : "Secondo logo eliminato. Ricarico la pagina…"
      );
      window.setTimeout(() => window.location.reload(), 600);
    }
    setBusy(null);
  }

  function renderRow(position: 1 | 2, label: string, info: LogoInfo) {
    const fileId = `logo-file-${position}`;
    const canDelete = position === 2 ? info.present : logo1Custom;
    const pickerText = info.present ? "Sostituisci…" : "Carica…";
    return (
      <div className="logo-row">
        <div className="logo-preview" aria-hidden="true">
          {info.present ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={info.src} alt={label} />
          ) : (
            <span className="logo-empty">Nessun logo</span>
          )}
        </div>
        <div className="logo-upload">
          <span className="form-label">{label}</span>
          <div className="logo-actions">
            <label className="logo-file-field">
              <input
                id={fileId}
                type="file"
                accept=".png,.jpg,.jpeg,image/png,image/jpeg"
                disabled={busy !== null}
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) void handleUpload(position, file);
                  e.target.value = "";
                }}
              />
              <span className="logo-file-text">{pickerText}</span>
            </label>
            {canDelete && (
              <button
                type="button"
                className="danger-button logo-delete"
                onClick={() => void handleDelete(position)}
                disabled={busy !== null}
              >
                {position === 1 ? "Ripristina logo originale" : "Elimina logo"}
              </button>
            )}
          </div>
          <span className="settings-help">
            JPG o PNG · max 8 MB · ridimensionato automaticamente
          </span>
          {busy === position && (
            <span className="logo-busy">
              {info.present ? "Sostituzione in corso…" : "Caricamento in corso…"}
            </span>
          )}
        </div>
      </div>
    );
  }

  return (
    <div>
      <p className="settings-help">
        Il primo logo è quello attualmente visibile in alto; il secondo compare
        sotto di esso. Scegliendo un nuovo file il logo viene{" "}
        <strong>sostituito</strong>; con il pulsante puoi <strong>eliminarlo</strong>{" "}
        (per il primo logo torna quello originale). Le immagini più grandi
        vengono riadattate automaticamente alla misura del logo attuale.
      </p>

      {renderRow(1, "Primo logo", logos.logo1)}
      {renderRow(2, "Secondo logo", logos.logo2)}

      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      {message && <p className="form-note">{message}</p>}
    </div>
  );
}

