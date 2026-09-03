import { getLogos } from "@/lib/logos";

/**
 * Manifest dell'app installabile (pulsante "SCARICA L'APP").
 *
 * ROUTE HANDLER (non il file manifest.ts di Next): viene eseguita a OGNI
 * richiesta, quindi l'icona appena caricata dall'amministratore (logo-3.png)
 * e il nome "ordini etnatobacco" sono sempre quelli attuali, senza aspettare
 * un nuovo deploy. Con il file manifest.ts il manifest veniva generato al
 * build e restava "vecchio" dopo ogni nuovo caricamento dell'icona.
 */
export const dynamic = "force-dynamic";

export async function GET(): Promise<Response> {
  const logos = await getLogos();
  const icon = logos.logo3.present
    ? logos.logo3.src
    : "/logo-files/logo-3.png";

  const manifest = {
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

  return new Response(JSON.stringify(manifest), {
    headers: {
      "Content-Type": "application/manifest+json; charset=utf-8",
      // NIENTE cache: il browser/telefono deve sempre ricevere l'ultima
      // icona e l'ultimo nome, mai una copia vecchia.
      "Cache-Control": "no-store, max-age=0",
    },
  });
}