import { promises as fs } from "node:fs";
import path from "node:path";
import { readStoredSetting, writeStoredSetting } from "@/lib/settings/store";

/**
 * Configurazione dell'account email (server SMTP/IMAP) usato dall'azienda.
 * I valori visibili (server, porte, sicurezza, nome) sono salvati in chiaro
 * in data/email-config.json (file locale, permessi 600); la PASSWORD resta
 * crittografata nello store impostazioni (come le altre chiavi).
 * Default preimpostati per l'hosting Aruba, come da configurazione attuale.
 */

const EMAIL_CONFIG_FILE = path.join(process.cwd(), "data", "email-config.json");
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

export async function getEmailConfig(): Promise<EmailConfigWithStatus> {
  let stored: Partial<EmailConfig> = {};
  try {
    stored = JSON.parse(await fs.readFile(EMAIL_CONFIG_FILE, "utf8"));
  } catch {
    // file non ancora presente: si usano i default
  }
  const passwordSet = Boolean(await readStoredSetting(PASSWORD_KEY));
  const account = clean(stored.account ?? "", DEFAULT_EMAIL_ACCOUNT);
  return {
    displayName: clean(stored.displayName ?? "", DEFAULTS.displayName),
    account,
    imapServer: clean(stored.imapServer ?? "", DEFAULTS.imapServer),
    imapPort: clean(stored.imapPort ?? "", DEFAULTS.imapPort),
    imapSecure: clean(stored.imapSecure ?? "", DEFAULTS.imapSecure),
    smtpServer: clean(stored.smtpServer ?? "", DEFAULTS.smtpServer),
    smtpPort: clean(stored.smtpPort ?? "", DEFAULTS.smtpPort),
    smtpSecure: clean(stored.smtpSecure ?? "", DEFAULTS.smtpSecure),
    username: clean(stored.username ?? "", account),
    passwordSet,
  };
}

export async function saveEmailConfig(
  config: EmailConfig,
  password?: string
): Promise<void> {
  await fs.mkdir(path.dirname(EMAIL_CONFIG_FILE), { recursive: true });
  await fs.writeFile(EMAIL_CONFIG_FILE, JSON.stringify(config, null, 2), {
    mode: 0o600,
  });
  if (password && password.trim()) {
    await writeStoredSetting(PASSWORD_KEY, password.trim());
  }
}
