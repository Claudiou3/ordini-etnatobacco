import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "./server";
import { createAdminClient } from "./admin";
import { getCurrentAdmin } from "./session";

/**
 * Client dati per la richiesta corrente.
 * - Amministratore locale: usa la service role key (lato server, mai nel browser)
 *   per poter gestire l'anagrafica completa senza una sessione Supabase.
 * - Agente autenticato via Supabase: usa la propria sessione (RLS attiva).
 */
export async function getDataClient(): Promise<SupabaseClient | null> {
  const admin = await getCurrentAdmin();
  if (admin) {
    const adminClient = await createAdminClient();
    if (adminClient) return adminClient;
  }
  return createClient();
}
