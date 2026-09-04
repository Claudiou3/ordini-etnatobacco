import { promises as fs } from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { appDataDir } from "@/lib/data-dir";
import { getAppSetting, setAppSetting } from "@/lib/supabase/app-settings";
import { getSetting } from "@/lib/settings/runtime";
import { getEncryptionKey } from "@/lib/crypto";
// Ri-esportato dal modulo condiviso (usato anche dal Proxy/Middleware Edge).
export { ADMIN_SESSION_COOKIE } from "@/lib/session-cookies";

/**
 * Account amministratore + sessione.
 * La password viene salvata come hash scrypt con salt casuale.
 * I dati vivono su Supabase (tabella app_settings, chiave "admin_account")
 * quando disponibile, altrimenti in data/admin.json (locale).
 * L'email dell'amministratore NON e' mai mostrata nell'interfaccia:
 * viene richiesta al login (campo vuoto) e verificata.
 */

const DATA_DIR = appDataDir();
const ADMIN_FILE = path.join(DATA_DIR, "admin.json");
const ADMIN_SETTING_KEY = "admin_account";

export const ADMIN_SESSION_TTL_MS = 365 * 24 * 60 * 60 * 1000;

type AdminRecord = {
  email: string;
  salt: string;
  hash: string;
  createdAt: string;
};

async function readAdminRecord(): Promise<AdminRecord | null> {
  const remote = await getAppSetting<AdminRecord>(ADMIN_SETTING_KEY);
  if (remote?.email && remote?.hash) return remote;
  try {
    return JSON.parse(await fs.readFile(ADMIN_FILE, "utf8")) as AdminRecord;
  } catch {
    return null;
  }
}

async function writeAdminRecord(record: AdminRecord): Promise<void> {
  const saved = await setAppSetting(ADMIN_SETTING_KEY, record);
  if (!saved) {
    await fs.mkdir(DATA_DIR, { recursive: true });
    await fs.writeFile(ADMIN_FILE, JSON.stringify(record, null, 2), {
      mode: 0o600,
    });
  }
}

export async function adminExists(): Promise<boolean> {
  return (await readAdminRecord()) !== null;
}

function hashPassword(password: string, salt: string): string {
  return crypto
    .scryptSync(password, salt, 64, { N: 16384, r: 8, p: 1 })
    .toString("hex");
}

/**
 * Chiave HMAC della sessione amministratore, STABILE tra i riavvii:
 * - se Supabase e' configurata usa un hash della service role key
 *   (cosi' funziona anche su Vercel senza SETTINGS_ENCRYPTION_KEY);
 * - altrimenti la chiave di cifratura locale (data/.encryption-key).
 */
export async function getAdminSessionKey(): Promise<Buffer> {
  const serviceRole = await getSetting("SUPABASE_SERVICE_ROLE_KEY");
  if (serviceRole && serviceRole.trim() !== "") {
    return crypto
      .createHash("sha256")
      .update("ioi-admin-session:" + serviceRole.trim())
      .digest();
  }
  return getEncryptionKey();
}


export async function createAdmin(
  email: string,
  password: string
): Promise<{ ok: boolean; error?: string }> {
  if (await adminExists()) {
    return { ok: false, error: "Amministratore già configurato." };
  }
  const salt = crypto.randomBytes(16).toString("hex");
  const record: AdminRecord = {
    email: email.trim().toLowerCase(),
    salt,
    hash: hashPassword(password, salt),
    createdAt: new Date().toISOString(),
  };
  try {
    await writeAdminRecord(record);
  } catch {
    return {
      ok: false,
      error:
        "Impossibile salvare l'account amministratore (file system non scrivibile o Supabase non raggiungibile).",
    };
  }
  return { ok: true };
}

export async function verifyAdmin(email: string, password: string): Promise<boolean> {
  const record = await readAdminRecord();
  if (!record) return false;
  if (record.email !== email.trim().toLowerCase()) return false;
  const calc = Buffer.from(hashPassword(password, record.salt), "hex");
  const expected = Buffer.from(record.hash, "hex");
  return calc.length === expected.length && crypto.timingSafeEqual(calc, expected);
}

/**
 * Sostituisce email e password dell'amministratore, ma SOLO se le credenziali
 * attuali (email + password) coincidono. Usata dal pannello "Impostazioni"
 * della Consolle.
 */
export async function updateAdminCredentials(
  currentEmail: string,
  currentPassword: string,
  newEmail: string,
  newPassword: string
): Promise<{ ok: boolean; error?: string }> {
  const record = await readAdminRecord();
  if (!record) {
    return { ok: false, error: "Amministratore non configurato." };
  }

  // Verifica credenziali attuali.
  if (record.email !== currentEmail.trim().toLowerCase()) {
    return { ok: false, error: "Utente (email) attuale non corretto." };
  }
  const calc = Buffer.from(hashPassword(currentPassword, record.salt), "hex");
  const expected = Buffer.from(record.hash, "hex");
  if (calc.length !== expected.length || !crypto.timingSafeEqual(calc, expected)) {
    return { ok: false, error: "Password attuale non corretta." };
  }

  // Nuovo indirizzo email.
  const email = newEmail.trim().toLowerCase();
  if (email.length < 3 || !email.includes("@")) {
    return { ok: false, error: "Inserisci un nuovo indirizzo email valido." };
  }

  // Nuova password.
  if (newPassword.length < 8) {
    return { ok: false, error: "La nuova password deve avere almeno 8 caratteri." };
  }

  const salt = crypto.randomBytes(16).toString("hex");
  const updated: AdminRecord = {
    email,
    salt,
    hash: hashPassword(newPassword, salt),
    createdAt: record.createdAt,
  };
  try {
    await writeAdminRecord(updated);
  } catch {
    return {
      ok: false,
      error:
        "Impossibile salvare le nuove credenziali (file system non scrivibile o Supabase non raggiungibile).",
    };
  }
  return { ok: true };
}

export function createAdminSessionToken(email: string, key: Buffer): string {
  const encEmail = Buffer.from(email, "utf8").toString("base64url");
  const expiry = Date.now() + ADMIN_SESSION_TTL_MS;
  const payload = `${encEmail}.${expiry}`;
  const sig = crypto.createHmac("sha256", key).update(payload).digest("base64url");
  return `${payload}.${sig}`;
}

export function verifyAdminSessionToken(token: string, key: Buffer): string | null {
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const [encEmail, expiry, sig] = parts;
  const expected = crypto
    .createHmac("sha256", key)
    .update(`${encEmail}.${expiry}`)
    .digest("base64url");
  if (!crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null;
  if (Number(expiry) < Date.now()) return null;
  try {
    return Buffer.from(encEmail, "base64url").toString("utf8");
  } catch {
    return null;
  }
}

