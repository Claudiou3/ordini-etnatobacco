"use client";

import { useState } from "react";
import type { CSSProperties } from "react";
import {
  deleteLogoAction,
  saveLogoSizeAction,
  uploadLogoAction,
} from "./actions";
import type { LogoInfo, LogoPosition } from "@/lib/logos";

/**
 * Sezione "Loghi" delle Impostazioni: tre campi per CARICARE, SOSTITUIRE,
 * ELIMINARE e REGOLARE LA GRANDEZZA del PRIMO logo (in alto), del SECONDO
 * logo (sotto) e dell'ICONA app "da scaricare". Per ogni logo è presente un
 * campo "Grandezza (px)": l'amministratore può gestire in autonomia quanto
 * è grande ogni logo nella piattaforma. Formati ammessi: JPG e PNG.
 */
export function LogosForm({
  logos,
}: {
  logos: { logo1: LogoInfo; logo2: LogoInfo; logo3: LogoInfo };
}) {
  const [busy, setBusy] = useState<LogoPosition | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  // Il primo logo "caricato dall'amministratore" (quello originale in
  // public/logo-detomaso.png non ha l'URL /logo-files/...).
  const logo1Custom = logos.logo1.src.startsWith("/logo-files/");

  async function handleUpload(position: LogoPosition, file: File) {
    setBusy(position);
    setError(null);
    setMessage(null);
    const formData = new FormData();
    formData.append("file", file);
    const res = await uploadLogoAction(position, formData);
    if (!res.ok) {
      setError(
        `Errore nel caricamento (${labelOf(position)}): ${res.error ?? "riprova."}`
      );
    } else {
      setMessage(
        `${labelOf(position)} ${
          position === 1 && !logo1Custom ? "caricato" : "sostituito"
        }. Ricarico la pagina…`
      );
      // Ricarica COMPLETA della pagina: garantisce che sidebar, login e
      // anteprime mostrino subito l'immagine nuova.
      window.setTimeout(() => window.location.reload(), 600);
    }
    setBusy(null);
  }

  async function handleDelete(position: LogoPosition) {
    const ok = window.confirm(confirmText(position));
    if (!ok) return;
    setBusy(position);
    setError(null);
    setMessage(null);
    const res = await deleteLogoAction(position);
    if (!res.ok) {
      setError(
        `Errore durante l'eliminazione (${labelOf(position)}): ${res.error ?? "riprova."}`
      );
    } else {
      setMessage(`${labelOf(position)} eliminato. Ricarico la pagina…`);
      window.setTimeout(() => window.location.reload(), 600);
    }
    setBusy(null);
  }

  function labelOf(position: LogoPosition): string {
    if (position === 1) return "Primo logo";
    if (position === 2) return "Secondo logo";
    return "Logo catalogo da scaricare";
  }

  function confirmText(position: LogoPosition): string {
    if (position === 1) {
      return "Eliminare il primo logo caricato? Verrà ripristinato il logo originale.";
    }
    if (position === 2) {
      return "Eliminare il secondo logo? Non comparirà più sotto il primo.";
    }
    return "Eliminare l'icona del catalogo? Sul dispositivo resterà il logo precedente fino a nuova installazione.";
  }

  function renderRow(position: LogoPosition, info: LogoInfo) {
    const fileId = `logo-file-${position}`;
    const canDelete =
      position === 1 ? logo1Custom : info.present;
    const pickerText = info.present ? "Sostituisci…" : "Carica…";
    const help =
      position === 3
        ? "PNG/JPG quadrato (consigliato 512x512) · sarà l'icona sul telefono/tablet"
        : "JPG o PNG · max 8 MB · ridimensionato automaticamente";
    return (
      <div className="logo-row">
        <div className="logo-preview" aria-hidden="true">
          {info.present ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={info.src}
              alt={labelOf(position)}
              style={{ "--logo-size": `${info.size}px` } as CSSProperties}
            />
          ) : (
            <span className="logo-empty">Nessun logo</span>
          )}
        </div>
        <div className="logo-upload">
          <span className="form-label">{labelOf(position)}</span>
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
          <span className="settings-help">{help}</span>
          {busy === position && (
            <span className="logo-busy">
              {info.present ? "Sostituzione in corso…" : "Caricamento in corso…"}
            </span>
          )}
          <LogoSizeControl position={position} size={info.size} />
        </div>
      </div>
    );
  }

  return (
    <div>
      <p className="settings-help">
        Il primo logo è quello visibile in alto; il secondo compare sotto.
        Il <strong>Logo catalogo da scaricare</strong> è l&apos;icona che
        compare sul telefono/tablet quando un agente installa l&apos;app con il
        pulsante &quot;SCARICA L&apos;APP&quot;.
      </p>
      <p className="settings-help">
        Per ogni logo puoi regolare la <strong>grandezza (px)</strong>: la
        misura indicata è quella nella <strong>barra laterale</strong>; la
        pagina di accesso e le anteprime mostrano il logo in proporzione.
      </p>

      {renderRow(1, logos.logo1)}
      {renderRow(2, logos.logo2)}
      {renderRow(3, logos.logo3)}

      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      {message && <p className="form-note">{message}</p>}
    </div>
  );
}

/** Campo "Grandezza (px)" di un singolo logo: salva la misura scelta. */
function LogoSizeControl({
  position,
  size,
}: {
  position: LogoPosition;
  size: number;
}) {
  const [value, setValue] = useState(String(size));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function apply() {
    const px = Number.parseInt(value, 10);
    if (!Number.isInteger(px) || px < 20 || px > 400) {
      setError("Inserisci un numero intero tra 20 e 400 px.");
      return;
    }
    setBusy(true);
    setError(null);
    const res = await saveLogoSizeAction(position, px);
    if (!res.ok) {
      setError(res.error ?? "Errore durante il salvataggio.");
      setBusy(false);
      return;
    }
    // Ricarica: le misure vengono lette lato server (Impostazioni/file).
    window.setTimeout(() => window.location.reload(), 350);
  }

  return (
    <div className="logo-size-ctl">
      <label>
        <span className="form-label">Grandezza (px)</span>
        <input
          className="form-input logo-size-input"
          type="number"
          min={20}
          max={400}
          step={1}
          inputMode="numeric"
          value={value}
          disabled={busy}
          onChange={(e) => {
            setValue(e.target.value);
            setError(null);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              void apply();
            }
          }}
        />
      </label>
      <button
        type="button"
        className="secondary-button"
        onClick={() => void apply()}
        disabled={busy}
      >
        {busy ? "Salvataggio…" : "Applica"}
      </button>
      {error && (
        <p className="logo-size-err" role="alert">
          {error}
        </p>
      )}
      <p className="logo-size-hint">
        Valore di riferimento in piattaforma (barra laterale). Su
        login/registrazione e anteprime il logo viene mostrato in proporzione.
      </p>
    </div>
  );
}
