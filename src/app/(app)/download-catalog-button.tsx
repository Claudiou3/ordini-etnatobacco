"use client";

import { useEffect, useState } from "react";
import type { ReactNode } from "react";

type InstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

/**
 * Pulsante "SCARICA IL CATALOGO" nella barra laterale (lato agenti):
 * permette di aggiungere l'app alla Home/scrivania del dispositivo
 * (Android, iPhone/iPad e PC). Le istruzioni compaiono in un pannello
 * ancorato a DESTRA (non al centro), così non coprono i campi della pagina.
 */
export function DownloadCatalogButton({ iconUrl }: { iconUrl?: string }) {
  const [deferred, setDeferred] = useState<InstallPromptEvent | null>(null);
  const [open, setOpen] = useState(false);

  // Rilevamento dispositivo (valutato solo nel browser).
  const ua = typeof navigator !== "undefined" ? navigator.userAgent : "";
  const isIos = /iphone|ipad|ipod/i.test(ua);
  const isAndroid = /android/i.test(ua);

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
    // Su Android e PC (Chrome/Edge) puo' partire la richiesta nativa
    // "Installa app": la mostriamo subito se disponibile.
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

  const steps = isIos
    ? "ios"
    : isAndroid
      ? "android"
      : "desktop";

  const stepsContent: Record<"ios" | "android" | "desktop", ReactNode> = {
    ios: (
      <>
        <p className="settings-help">
          <strong>iPhone / iPad (Safari):</strong>
        </p>
        <ol className="install-steps">
          <li>Apri il sito in Safari</li>
          <li>
            Tocca <strong>Condividi</strong> (in basso, quadrato con freccia
            verso l&apos;alto)
          </li>
          <li>
            Scorri e scegli <strong>&quot;Aggiungi a Home&quot;</strong>
          </li>
          <li>
            Premi <strong>&quot;Aggiungi&quot;</strong>: icona sulla Home
          </li>
        </ol>
      </>
    ),
    // STEPS_ANDROID
    android: (
      <>
        <p className="settings-help">
          <strong>Android (Chrome):</strong>
        </p>
        <ol className="install-steps">
          <li>Tocca il menu ⋮ (in alto a destra)</li>
          <li>
            Scegli <strong>&quot;Aggiungi a schermata Home&quot;</strong>{" "}
            oppure <strong>&quot;Installa app&quot;</strong>
          </li>
          <li>Conferma: l&apos;icona apparirà sulla Home</li>
        </ol>
      </>
    ),
    desktop: (
      <>
        <p className="settings-help">
          <strong>PC (Windows/Mac):</strong>
        </p>
        <ol className="install-steps">
          <li>Usa Chrome o Edge</li>
          <li>
            Clicca l&apos;icona <strong>&quot;Installa&quot;</strong> nella
            barra degli indirizzi (monitor con freccia) oppure{" "}
            <strong>⋮ → Installa &quot;IOI Orders&quot;</strong>
          </li>
          <li>
            Conferma: icona sul desktop / menu Start che apre l&apos;app
          </li>
        </ol>
        <p className="settings-help">
          In alternativa aggiungi il sito ai <strong>preferiti</strong>.
        </p>
      </>
    ),
  };

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
          className="install-popover"
          role="dialog"
          aria-label="Scarica il catalogo"
        >
          <div className="install-popover-head">
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
            <p>
              L&apos;app si installa su <strong>Android</strong>,{" "}
              <strong>iPhone/iPad</strong> e <strong>PC</strong>: l&apos;icona
              resta sul dispositivo e apre subito l&apos;applicazione.
            </p>

            {iconUrl ? (
              <div className="install-icon-row">
                <div className="install-icon-preview">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={iconUrl} alt="Icona catalogo" />
                </div>
                <span>Questa sarà l&apos;icona sul dispositivo</span>
              </div>
            ) : (
              <p className="form-note">
                ⚠️ L&apos;amministratore non ha ancora caricato il logo
                dell&apos;icona: puoi comunque installare l&apos;app.
              </p>
            )}

            {stepsContent[steps]}
          </div>
        </div>
      )}
    </>
  );
}
