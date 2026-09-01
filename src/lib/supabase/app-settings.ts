import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Impostazioni persistenti chiave-valore su Supabase (tabella app_settings).
 *
 * Su Vercel il filesystem è in sola lettura, quindi tutte le configurazioni
 * che in locale vivono su file (admin, provvigioni, spedizioni, sub-admin,
 * catalogo, loghi) vengono salvate qui, usando la service_role key.
 * Ritorna null/false se Supabase non è configurato: i chiamanti devono
 * ripiegare sul file locale.
 */

export async function getAppSetting<T>(key: string): Promise<T | null> {
  const supabase = await createAdminClient();
  if (!supabase) return null;
  const { data, error } = await supabase
    .from("app_settings")
    .select("value")
    .eq("key", key)
    .maybeSingle();
  if (error || !data) return null;
  return (data.value as T) ?? null;
}

export async function setAppSetting<T>(
  key: string,
  value: T
): Promise<boolean> {
  const supabase = await createAdminClient();
  if (!supabase) return false;
  const { error } = await supabase.from("app_settings").upsert(
    { key, value, updated_at: new Date().toISOString() },
    { onConflict: "key" }
  );
  return !error;
}
