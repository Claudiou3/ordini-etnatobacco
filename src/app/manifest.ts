import type { MetadataRoute } from "next";
import { getLogos } from "@/lib/logos";

/**
 * Manifest dell'app installabile (pulsante "SCARICA L'APP"): permette di
 * aggiungere l'app alla schermata Home di telefono/tablet con l'icona
 * caricata dall'amministratore (logo-3.png) e il nome "ordini etnatobacco".
 *
 * La rotta è FORZATA DINAMICA: i loghi vengono letti a ogni richiesta, così
 * un'icona appena caricata dalle Impostazioni viene usata subito, senza
 * dover aspettare un nuovo deploy (prima il manifest era generato al build
 * e restava "vecchio" fino al push successivo).
 */
export const dynamic = "force-dynamic";

export default async function manifest(): Promise<MetadataRoute.Manifest> {
  const logos = await getLogos();
  const icon = logos.logo3.present
    ? logos.logo3.src
    : "/logo-files/logo-3.png";

  return {
    name: "ordini etnatobacco",
    short_name: "ordini etnatobacco",
    description:
      "Ordini Etnatobacco: consulta il catalogo e gestisci gli ordini.",
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#f1f5f9",
    theme_color: "#2563eb",
    icons: [
      {
        src: icon,
        sizes: "192x192",
        type: "image/png",
        purpose: "any",
      },
      {
        src: icon,
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
      {
        src: icon,
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
