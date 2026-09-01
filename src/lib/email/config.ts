import { promises as fs } from "node:fs";
import { readStoredSetting, writeStoredSetting } from "@/lib/settings/store";
import { appDataPath } from "@/lib/data-dir";
import { getAppSetting, setAppSetting } from "@/lib/supabase/app-settings";
import { getSetting } from "@/lib/settings/runtime";

/**
 * Configurazione dell'account email (server SMTP/IMAP) usato dall'azienda.
 * I valori visibili (server, porte, sicurezza, nome) sono salvati in chiaro
 * su Supabase (app_settings) quando disponibile, altrimenti in
 * data/email-config.json (file locale, permessi 600); la PASSWORD resta
 * crittografata nello store impostazioni (come le altre chiavi) o nelle
 * variabili d'ambiente.
 * Default preimpostati per l'hosting Aruba, come da configurazione attuale.
 *
 * Le variabili d'ambiente hanno priorita' sul file (utile in produzione dove
 * la cartella data/ potrebbe non essere disponibile):
 *   EMAIL_DISPLAY_NAME, EMAIL_ACCOUNT, EMAIL_IMAP_SERVER, EMAIL_IMAP_PORT,
 *   EMAIL_IMAP_SECURE, EMAIL_SMTP_SERVER, EMAIL_SMTP_PORT, EMAIL_SMTP_SECURE,
 *   EMAIL_USERNAME
 */

const EMAIL_CONFIG_FILE = appDataPath("email-config.json");
const EMAIL_CONFIG_SETTING_KEY = "email_config";
const EMAIL_PASSWORD_SETTING_KEY = "email_account_password";
const PASSWORD_KEY = "EMAIL_ACCOUNT_PASSWORD";

export const DEFAULT_EMAIL_ACCOUNT = "ordinidetomaso@etnatobacco.com";

export type EmailConfig = {
  displayName: string; // Nome visualizzato
  account: string; // Indirizzo e-mail account
  imapServer: string; // Server posta in arrivo
  imapPort: string; // Porta in arrivo
  imapSecure: string; // Sicurezza in arrivo
  smtpServer: string; // Server posta in uscita (SMTP)
  smtpPort: string; // Porta in uscita
  smtpSecure: string; // Sicurezza in uscita
  username: string; // Nome utente account
};

const DEFAULTS: EmailConfig = {
  displayName: "Ordini De Tomaso",
  account: DEFAULT_EMAIL_ACCOUNT,
  imapServer: "imaps.aruba.it",
  imapPort: "993",
  imapSecure: "SSL/TLS",
  smtpServer: "smtps.aruba.it",
  smtpPort: "465",
  smtpSecure: "SSL/TLS",
  username: DEFAULT_EMAIL_ACCOUNT,
};

export type EmailConfigWithStatus = EmailConfig & { passwordSet: boolean };

function clean(value: string, fallback: string): string {
  return value.trim() || fallback;
}

/** Valore da variabile d'ambiente, se presente e non vuota. */
function envOr(name: string, fallback: string): string {
  const value = process.env[name];
  if (value && value.trim() !== "") return value.trim();
  return fallback;
}

export async function getEmailConfig(): Promise<EmailConfigWithStatus> {
  let stored: Partial<EmailConfig> = {};
  // 1) File locale (autoritativo in locale).
  try {
    stored = JSON.parse(await fs.readFile(EMAIL_CONFIG_FILE, "utf8"));
  } catch {
    // file non presente
  }
  // 2) Supabase (online/Vercel, dove il file non esiste).
  if (!stored.smtpServer) {
    const remote = await getAppSetting<Partial<EmailConfig>>(EMAIL_CONFIG_SETTING_KEY);
    if (remote) stored = remote;
  }
  const passwordSet = Boolean(await getEmailAccountPassword());
  const account = clean(envOr("EMAIL_ACCOUNT", stored.account ?? ""), DEFAULT_EMAIL_ACCOUNT);
  return {
    displayName: clean(
      envOr("EMAIL_DISPLAY_NAME", stored.displayName ?? ""),
      DEFAULTS.displayName
    ),
    account,
    imapServer: clean(
      envOr("EMAIL_IMAP_SERVER", stored.imapServer ?? ""),
      DEFAULTS.imapServer
    ),
    imapPort: clean(
      envOr("EMAIL_IMAP_PORT", stored.imapPort ?? ""),
      DEFAULTS.imapPort
    ),
    imapSecure: clean(
      envOr("EMAIL_IMAP_SECURE", stored.imapSecure ?? ""),
      DEFAULTS.imapSecure
    ),
    smtpServer: clean(
      envOr("EMAIL_SMTP_SERVER", stored.smtpServer ?? ""),
      DEFAULTS.smtpServer
    ),
    smtpPort: clean(
      envOr("EMAIL_SMTP_PORT", stored.smtpPort ?? ""),
      DEFAULTS.smtpPort
    ),
    smtpSecure: clean(
      envOr("EMAIL_SMTP_SECURE", stored.smtpSecure ?? ""),
      DEFAULTS.smtpSecure
    ),
    username: clean(
      envOr("EMAIL_USERNAME", stored.username ?? ""),
      account
    ),
    passwordSet,
  };
}

/**
 * Password SMTP in ordine di priorita':
 *  1. variabile d'ambiente EMAIL_ACCOUNT_PASSWORD (consigliata in produzione);
 *  2. store impostazioni cifrato locale (Impostazioni -> server email);
 *  3. Supabase (app_settings) — quando salvata online su Vercel.
 */
export async function getEmailAccountPassword(): Promise<string | null> {
  const env = process.env[PASSWORD_KEY];
  if (env && env.trim() !== "") return env.trim();
  const stored = await readStoredSetting(PASSWORD_KEY);
  if (stored) return stored;
  const remote = await getAppSetting<string>(EMAIL_PASSWORD_SETTING_KEY);
  if (remote && remote.trim() !== "") return remote.trim();
  return null;
}

export async function saveEmailConfig(
  config: EmailConfig,
  password?: string
): Promise<void> {
  // Configurazione non segreta: file locale se scrivibile, altrimenti Supabase.
  try {
    const dataDir = appDataPath();
    await fs.mkdir(dataDir, { recursive: true });
    await fs.writeFile(EMAIL_CONFIG_FILE, JSON.stringify(config, null, 2), {
      mode: 0o600,
    });
  } catch {
    await setAppSetting(EMAIL_CONFIG_SETTING_KEY, config);
  }
  // Password: store cifrato locale se scrivibile, altrimenti Supabase.
  if (password && password.trim()) {
    const cleanPw = password.trim();
    try {
      await writeStoredSetting(PASSWORD_KEY, cleanPw);
    } catch {
      await setAppSetting(EMAIL_PASSWORD_SETTING_KEY, cleanPw);
    }
  }
}


