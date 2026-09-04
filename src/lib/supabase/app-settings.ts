import { createAdminClient } from "@/lib/supabase/admin";
import { memoized, invalidateMemo } from "@/lib/server-cache";

/**
 * Impostazioni persistenti chiave-valore su Supabase (tabella app_settings).
 *
 * Su Vercel il filesystem è in sola lettura, quindi tutte le configurazioni
 * che in locale vivono su file (admin, provvigioni, spedizioni, sub-admin,
 * catalogo, loghi) vengono salvate qui, usando la service_role key.
 * Ritorna null/false se Supabase non è configurato: i chiamanti devono
 * ripiegare sul file locale.
 *
 * Cache: la lettura è una query al database ripetuta da molti moduli a ogni
 * richiesta (loghi, spedizioni, provvigioni, step4 catalogo). Con TTL breve
 * (10 s) e single-flight, 100 agenti nello stesso istante fanno UNA sola
 * query per chiave invece di 100; `setAppSetting` invalida subito la voce.
 */

const APP_SETTING_CACHE_TTL_MS = 10_000;

function settingCacheKey(key: string): string {
  return `app-setting:${key}`;
}

export async function getAppSetting<T>(key: string): Promise<T | null> {
  return memoized<T | null>(settingCacheKey(key), APP_SETTING_CACHE_TTL_MS, async () => {
    const supabase = await createAdminClient();
    if (!supabase) return null;
    const { data, error } = await supabase
      .from("app_settings")
      .select("value")
      .eq("key", key)
      .maybeSingle();
    if (error || !data) return null;
    return (data.value as T) ?? null;
  });
}

export async function setAppSetting<T>(
  key: string,
  value: T
): Promise<boolean> {
  // La voce (se presente) non è più valida, sia in caso di successo sia in
  // caso di errore (il chiamante può ripiegare sul file locale).
  invalidateMemo(settingCacheKey(key));

  const supabase = await createAdminClient();
  if (!supabase) return false;
  const { error } = await supabase.from("app_settings").upsert(
    { key, value, updated_at: new Date().toISOString() },
    { onConflict: "key" }
  );
  return !error;
}
