"use client";

import { useEffect, useState } from "react";
import type { ReactNode } from "react";

type InstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

/**
 * Pulsante "SCARICA L'APP" nella barra laterale (lato agenti):
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
        <p className="install-step-title">iPhone / iPad (Safari)</p>
        <ol className="install-steps">
          <li>
            Guarda <strong>in basso al centro</strong> di Safari: c&apos;è il
            pulsante <strong>Condividi</strong> (quadrato con freccia verso
            l&apos;alto)
          </li>
          <li>
            Toccato quello, scegli{" "}
            <strong>&quot;Aggiungi a Home&quot;</strong>
          </li>
          <li>
            Premi <strong>&quot;Aggiungi&quot;</strong>: ora l&apos;icona del
            catalogo è sulla Home
          </li>
        </ol>
      </>
    ),
    // STEPS_ANDROID
    android: (
      <>
        <p className="install-step-title">Android (Chrome)</p>
        <ol className="install-steps">
          <li>
            In <strong>alto a destra</strong> di Chrome tocca i{" "}
            <strong>tre puntini ⋮</strong>
          </li>
          <li>
            Scegli <strong>&quot;Aggiungi a schermata Home&quot;</strong>{" "}
            (oppure <strong>&quot;Installa app&quot;</strong>)
          </li>
          <li>
            Tocca <strong>&quot;Aggiungi&quot;</strong>: ora l&apos;icona del
            catalogo è sulla Home
          </li>
        </ol>
      </>
    ),
    desktop: (
      <>
        <p className="install-step-title">PC (Windows / Mac)</p>
        <ol className="install-steps">
          <li>
            Apri il sito con <strong>Chrome</strong> o <strong>Edge</strong>
          </li>
          <li>
            Guarda in <strong>alto a destra, nella barra degli indirizzi</strong>:
            c&apos;è una piccola icona (un <strong>monitor con la
            freccia</strong>). Cliccala e premi <strong>&quot;Installa&quot;</strong>
          </li>
          <li>
            Se non la vedi, clicca i <strong>tre puntini ⋮</strong> (in alto a
            destra) → <strong>&quot;Installa IOI Orders…&quot;</strong>
          </li>
          <li>
            Fatto: ora sul desktop / menu Start c&apos;è l&apos;icona che apre
            il catalogo
          </li>
        </ol>
        <p className="install-note">
          In alternativa puoi aggiungere il sito ai <strong>preferiti</strong>{" "}
          (Ctrl+D): non crea l&apos;icona dedicata ma resta a un clic di
          distanza.
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
          <span aria-hidden="true">📥</span> SCARICA L&apos;APP
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
