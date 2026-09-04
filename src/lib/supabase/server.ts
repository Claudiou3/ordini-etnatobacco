import { createServerClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { getSetting } from "@/lib/settings/runtime";

/**
 * Client Supabase lato server (Server Components, Server Actions,
 * Route Handlers). La sessione viene letta dai cookie della richiesta.
 * L'URL e la chiave possono arrivare dalle variabili d'ambiente OPPURE
 * dalle impostazioni inserite dall'amministratore. Ritorna null se
 * Supabase non e' configurato.
 */
export async function createClient(): Promise<SupabaseClient | null> {
  const url = await getSetting("NEXT_PUBLIC_SUPABASE_URL");
  const anonKey = await getSetting("NEXT_PUBLIC_SUPABASE_ANON_KEY");
  if (!url || !anonKey) {
    return null;
  }

  const cookieStore = await cookies();

  return createServerClient(url, anonKey, {
    cookieOptions: {
      path: "/",
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
    },
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options)
          );
        } catch {
          // setAll viene chiamato anche da un Server Component:
          // in quel caso il proxy.ts aggiorna la sessione.
        }
      },
    },
  });
}

