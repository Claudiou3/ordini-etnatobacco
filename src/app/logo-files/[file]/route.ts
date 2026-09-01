import { NextResponse } from "next/server";
import { readLogoFile } from "@/lib/logos";

/**
 * Serve i PNG dei loghi caricati dall'amministratore.
 * - Online (Vercel): li legge da Supabase Storage (bucket "ordini", cartella "logos/").
 * - Locale: li legge da public/logos/.
 * L'URL resta pubblico (escluso dal Proxy/Middleware per l'estensione .png).
 */
export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ file: string }> }
) {
  const { file } = await params;
  const buffer = await readLogoFile(file);
  if (!buffer) {
    return new NextResponse("Logo non trovato", { status: 404 });
  }
  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "image/png",
      // NIENTE cache (CDN/browser): il logo deve mostrare sempre l'ultimo
      // caricamento. La cache era la causa del logo "che non cambiava"
      // anche dopo una sostituzione riuscita.
      "Cache-Control": "no-store",
    },
  });
}
