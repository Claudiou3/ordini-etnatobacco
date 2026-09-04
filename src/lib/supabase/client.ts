"use client";

import { createBrowserClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";
import { hasSupabaseConfig } from "./env";

/**
 * Client Supabase per il browser. Ritorna null se le variabili
 * d'ambiente non sono configurate, per non far crashare l'app.
 *
 * cookieOptions: attributi espliciti e coerenti dei cookie di sessione
 * (come per le sessioni admin/demo). Il maxAge (400 giorni) lo impone la
 * libreria @supabase/ssr: su iPhone/iPad (app avviata da Home) cookie con
 * scadenza lunga e Secure in produzione sono ciò che tiene la sessione
 * attiva tra un'avvio e l'altro.
 */
export function createClient(): SupabaseClient | null {
  if (!hasSupabaseConfig()) {
    return null;
  }
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookieOptions: {
        path: "/",
        sameSite: "lax",
        secure: process.env.NODE_ENV === "production",
      },
    }
  );
}
