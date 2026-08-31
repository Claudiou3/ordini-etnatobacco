import os from "node:os";
import type { NextConfig } from "next";

/**
 * Hostnames consentiti in sviluppo per i resource dev (JS/CSS/HMR/azioni).
 * Next confronta SOLO l'hostname (senza schema http:// ne' porta) con
 * l'header Origin/Referer delle richieste: quindi qui vanno hostname puri.
 * Aggiunge automaticamente l'IP di rete della macchina: cosi' lo
 * smartphone/tablet (http://<IP>:3000) puo' caricare gli script ed eseguire
 * le server action (ricerca clienti, invio ordine, modifica anagrafica...).
 */
function devOrigins(): string[] {
  const origins = ["localhost"];
  const nets = os.networkInterfaces();
  for (const name of Object.keys(nets)) {
    for (const net of nets[name] ?? []) {
      if (net.family === "IPv4" && !net.internal) {
        origins.push(net.address);
      }
    }
  }
  return origins;
}

const nextConfig: NextConfig = {
  serverExternalPackages: ["xlsx-populate"],
  allowedDevOrigins: devOrigins(),
};

export default nextConfig;


