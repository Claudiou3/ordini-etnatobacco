"use client";

import { useEffect } from "react";

/**
 * Registra il Service Worker (/sw.js) che rende l'app installabile come vera
 * PWA standalone (senza il logo di Chrome accanto all'icona).
 * Registrato solo in produzione: in sviluppo non serve.
 */
export function ServiceWorkerRegister() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production") return;
    if (typeof window === "undefined") return;
    if (!("serviceWorker" in navigator)) return;

    window.addEventListener("load", () => {
      navigator.serviceWorker
        .register("/sw.js")
        .catch(() => {
          // Nessun problema se la registrazione non riesce: l'app funziona
          // comunque, semplicemente non è "installabile" in modalità standalone.
        });
    });
  }, []);

  return null;
}