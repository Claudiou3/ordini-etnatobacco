import type { MetadataRoute } from "next";

/**
 * Manifest dell'app installabile ("Scarica il catalogo"): permette di
 * aggiungere l'app alla schermata Home di telefono/tablet con l'icona
 * caricata dall'amministratore (logo-3.png, rotta /logo-files/logo-3.png).
 */
export default function manifest(): MetadataRoute.Manifest {
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
        src: "/logo-files/logo-3.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/logo-files/logo-3.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/logo-files/logo-3.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
