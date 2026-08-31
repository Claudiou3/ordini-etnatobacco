import { readStoredSetting, listStoredSettings } from "./store";
import { API_KEY_DEFS } from "./defs";

/**
 * Lettura delle chiavi di configurazione usate dall'app.
 * Priorita': variabile d'ambiente -> impostazione inserita dall'amministratore.
 */
export async function getSetting(name: string): Promise<string | null> {
  const envValue = process.env[name];
  if (envValue && envValue.trim() !== "") return envValue;
  return readStoredSetting(name);
}

export async function isSupabaseConfigured(): Promise<boolean> {
  return Boolean(
    (await getSetting("NEXT_PUBLIC_SUPABASE_URL")) &&
      (await getSetting("NEXT_PUBLIC_SUPABASE_ANON_KEY"))
  );
}

export type SettingsStatus = {
  name: string;
  label: string;
  help: string;
  sensitive: boolean;
  configured: boolean;
  updatedAt: string | null;
};

export async function listSettingsStatus(): Promise<SettingsStatus[]> {
  const stored = await listStoredSettings();
  return API_KEY_DEFS.map((def) => {
    const entry = stored[def.name];
    const envValue = process.env[def.name];
    const envSet = Boolean(envValue && envValue.trim() !== "");
    return {
      name: def.name,
      label: def.label,
      help: def.help,
      sensitive: def.sensitive ?? false,
      configured: Boolean(entry) || envSet,
      updatedAt: entry?.updatedAt ?? (envSet ? "da file .env" : null),
    };
  });
}
