"use client";

import { useEffect, useState } from "react";

type InstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

/**
 * Pulsante "SCARICA IL CATALOGO" nella barra laterale (lato agenti):
 * installa l'app sul dispositivo (icona nella Home di telefono/tablet).
 * Su Android/desktop prova la richiesta nativa di installazione; su
 * iPhone/iPad mostra le istruzioni "Aggiungi a Home" di Safari.
 */
export function DownloadCatalogButton({ iconUrl }: { iconUrl?: string }) {
  const [deferred, setDeferred] = useState<InstallPromptEvent | null>(null);
  const [open, setOpen] = useState(false);
  const iosDevice =
    typeof window !== "undefined" &&
    /iphone|ipad|ipod/i.test(navigator.userAgent);

  useEffect(() => {
    const onBefore = (e: Event) => {
      e.preventDefault();
      setDeferred(e as InstallPromptEvent);
    };
    const onInstalled = () => setDeferred(null);
    window.addEventListener("beforeinstallprompt", onBefore);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onBefore);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  async function handleClick() {
    if (deferred) {
      await deferred.prompt();
      try {
        await deferred.userChoice;
      } catch {
        // scelta non disponibile: ignora
      }
      setDeferred(null);
      return;
    }
    setOpen(true);
  }

  return (
    <>
      <div className="download-catalog-side">
        <button
          type="button"
          className="download-catalog-btn"
          onClick={() => void handleClick()}
          title="Salva l'app sul dispositivo (icona sulla Home)"
        >
          <span aria-hidden="true">📥</span> SCARICA IL CATALOGO
        </button>
      </div>

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
            aria-label="Scarica il catalogo"
          >
            <div className="modal-head">
              <h3>Scarica il catalogo</h3>
              <button
                type="button"
                className="modal-close"
                onClick={() => setOpen(false)}
                aria-label="Chiudi"
              >
                ×
              </button>
            </div>

            <div className="install-content">
              {iconUrl ? (
                <div className="install-icon-preview">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={iconUrl} alt="Icona catalogo" />
                </div>
              ) : (
                <p className="form-note">
                  ⚠️ L&apos;amministratore non ha ancora caricato il logo
                  dell&apos;icona: puoi comunque installare l&apos;app.
                </p>
              )}

              <p>
                Salva l&apos;app sul dispositivo: sulla schermata Home comparirà
                l&apos;icona del catalogo. Toccandola si aprirà direttamente
                l&apos;applicazione (serve internet e l&apos;accesso con le tue
                credenziali).
              </p>

              {iosDevice ? (
                <>
                  <p className="settings-help">
                    <strong>iPhone / iPad (Safari):</strong>
                  </p>
                  <ol className="install-steps">
                    <li>
                      Tocca il pulsante <strong>Condividi</strong>{" "}
                      (il quadrato con la freccia in alto nel browser)
                    </li>
                    <li>
                      Scegli <strong>&quot;Aggiungi a Home&quot;</strong>
                    </li>
                    <li>
                      Premi <strong>&quot;Aggiungi&quot;</strong>: l&apos;icona
                      apparirà sulla Home
                    </li>
                  </ol>
                </>
              ) : (
                <>
                  <p className="settings-help">
                    <strong>Android / tablet (Chrome):</strong>
                  </p>
                  <ol className="install-steps">
                    <li>
                      Tocca il menu <strong>⋮</strong> (in alto a destra)
                    </li>
                    <li>
                      Scegli{" "}
                      <strong>&quot;Installa app&quot;</strong> oppure{" "}
                      <strong>&quot;Aggiungi a schermata Home&quot;</strong>
                    </li>
                    <li>
                      Conferma: l&apos;icona apparirà sulla Home
                    </li>
                  </ol>
                </>
              )}

              <div className="install-actions">
                <button
                  type="button"
                  className="primary-button"
                  onClick={() => setOpen(false)}
                >
                  Ok
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
