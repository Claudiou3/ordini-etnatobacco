import type { MetadataRoute } from "next";
import { getLogos } from "@/lib/logos";

/**
 * Manifest dell'app installabile ("Scarica il catalogo"): permette di
 * aggiungere l'app alla schermata Home di telefono/tablet con l'icona
 * caricata dall'amministratore (logo-3.png). L'URL include il timestamp
 * del caricamento (?v=...) per evitare icone vecchie in cache.
 */
export default async function manifest(): Promise<MetadataRoute.Manifest> {
  const logos = await getLogos();
  const icon = logos.logo3.present
    ? logos.logo3.src
    : "/logo-files/logo-3.png";

  return {
    name: "Ordini Etnatobacco - Catalogo",
    short_name: "Catalogo",
    description:
      "App ordini e catalogo Etnatobacco: consulta il catalogo e gestisci gli ordini.",
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
