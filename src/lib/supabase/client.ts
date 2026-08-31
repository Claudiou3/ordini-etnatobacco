"use client";

import { createBrowserClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";
import { hasSupabaseConfig } from "./env";

/**
 * Client Supabase per il browser. Ritorna null se le variabili
 * d'ambiente non sono configurate, per non far crashare l'app.
 */
export function createClient(): SupabaseClient | null {
  if (!hasSupabaseConfig()) {
    return null;
  }
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}
