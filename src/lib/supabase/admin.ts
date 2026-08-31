import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getSetting } from "@/lib/settings/runtime";

/**
 * Client con la service role key: bypassa la RLS ed e' usato solo
 * per operazioni server privilegiate (es. lettura dati come amministratore).
 * MAI importato in componenti client. Ritorna null se non configurato.
 * Legge la chiave dalle Impostazioni (data/settings.json) o da .env.local.
 */
export async function createAdminClient(): Promise<SupabaseClient | null> {
  const url = await getSetting("NEXT_PUBLIC_SUPABASE_URL");
  const serviceRole = await getSetting("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !serviceRole) {
    return null;
  }
  return createSupabaseClient(url, serviceRole, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
