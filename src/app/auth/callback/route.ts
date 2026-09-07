import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { getSetting } from "@/lib/settings/runtime";

/**
 * Callback del recupero password (link ricevuto via email da Supabase).
 * Scambia il codice con la sessione di recupero e porta l'agente alla pagina
 * dove può impostare la nuova password.
 */
export async function GET(request: NextRequest): Promise<Response> {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const nextRaw = searchParams.get("next") ?? "/cambia-password";
  const next = nextRaw.startsWith("/") ? nextRaw : "/cambia-password";

  const url = await getSetting("NEXT_PUBLIC_SUPABASE_URL");
  const anonKey = await getSetting("NEXT_PUBLIC_SUPABASE_ANON_KEY");
  if (!code || !url || !anonKey) {
    return NextResponse.redirect(`${origin}/login`);
  }

  const response = NextResponse.redirect(`${origin}${next}`);
  const supabase = createServerClient(url, anonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value, options }) =>
          response.cookies.set(name, value, options)
        );
      },
    },
  });

  const { error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) {
    return NextResponse.redirect(`${origin}/login?err=recovery`);
  }
  return response;
}
