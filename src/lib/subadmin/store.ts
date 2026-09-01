import { promises as fs } from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { MAX_SUBADMINS, type SubadminView } from "./types";
import { appDataPath } from "@/lib/data-dir";
import { getAppSetting, setAppSetting } from "@/lib/supabase/app-settings";

/**
 * Sub-amministratori: 6 slot (1..6) creati dall'amministratore principale.
 * Livello inferiore: possono SOLO VISUALIZZARE la piattaforma, non
 * modificano le Impostazioni (e non vedono il pulsante "Impostazioni"
 * nella Consolle). La password viene salvata come hash scrypt con salt.
 */

const SUBADMIN_FILE = appDataPath("subadmins.json");
const SUBADMIN_SETTING_KEY = "subadmins";

export { MAX_SUBADMINS, type SubadminView } from "./types";

export type SubadminRecord = {
  email: string;
  salt: string;
  hash: string;
  createdAt: string;
};

type Stored = { version: 1; slots: (SubadminRecord | null)[] };

const EMPTY_STORED: Stored = {
  version: 1,
  slots: Array.from({ length: MAX_SUBADMINS }, () => null),
};

function isValidStored(raw: unknown): raw is Stored {
  const s = raw as Stored;
  return Boolean(s && s.version === 1 && Array.isArray(s.slots));
}

async function load(): Promise<Stored> {
  // 1) Supabase (online, filesystem in sola lettura).
  const remote = await getAppSetting<Stored>(SUBADMIN_SETTING_KEY);
  if (isValidStored(remote)) return remote;
  // 2) File locale.
  try {
    const raw = JSON.parse(await fs.readFile(SUBADMIN_FILE, "utf8")) as Stored;
    if (isValidStored(raw)) return raw;
  } catch {
    // file assente o non valido
  }
  return EMPTY_STORED;
}

async function save(stored: Stored): Promise<void> {
  const saved = await setAppSetting(SUBADMIN_SETTING_KEY, stored);
  if (!saved) {
    await fs.mkdir(path.dirname(SUBADMIN_FILE), { recursive: true });
    await fs.writeFile(SUBADMIN_FILE, JSON.stringify(stored, null, 2));
  }
}

function hashPassword(password: string, salt: string): string {
  return crypto
    .scryptSync(password, salt, 64, { N: 16384, r: 8, p: 1 })
    .toString("hex");
}

/** Elenco degli slot ATTIVI (mai la password/hash): per la UI dell'admin. */
export async function listSubadmins(): Promise<SubadminView[]> {
  const stored = await load();
  return stored.slots.flatMap((slot, index) =>
    slot ? [{ slot: index + 1, email: slot.email, createdAt: slot.createdAt }] : []
  );
}

export async function verifySubadmin(
  email: string,
  password: string
): Promise<boolean> {
  const stored = await load();
  const record = stored.slots.find(
    (s) => s && s.email === email.trim().toLowerCase()
  );
  if (!record) return false;
  const calc = Buffer.from(hashPassword(password, record.salt), "hex");
  const expected = Buffer.from(record.hash, "hex");
  return calc.length === expected.length && crypto.timingSafeEqual(calc, expected);
}

export async function subadminExists(): Promise<boolean> {
  return (await listSubadmins()).length > 0;
}

/**
 * Crea o aggiorna lo slot 1..6. Se `password` e' vuota conserva quella
 * attuale (utile per modificare solo l'email). L'email non puo' essere
 * usata in due slot diversi.
 */
export async function upsertSubadmin(
  slot: number,
  email: string,
  password: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!Number.isInteger(slot) || slot < 1 || slot > MAX_SUBADMINS) {
    return { ok: false, error: "Slot sub-amministratore non valido." };
  }
  const clean = email.trim().toLowerCase();
  if (!clean || clean.length < 3 || !clean.includes("@")) {
    return { ok: false, error: "Inserisci un indirizzo email valido." };
  }
  if (password && password.length < 8) {
    return { ok: false, error: "La password deve avere almeno 8 caratteri." };
  }

  const stored = await load();
  const slots = [...stored.slots];
  while (slots.length < MAX_SUBADMINS) slots.push(null);
  const current = slots[slot - 1] ?? null;

  // Email gia' usata in un altro slot -> rifiuta.
  const duplicate = slots.some(
    (s, i) => i !== slot - 1 && s && s.email === clean
  );
  if (duplicate) {
    return { ok: false, error: "Questa email e' gia' assegnata a un altro slot." };
  }

  if (!password && !current) {
    return { ok: false, error: "Inserisci una password (min. 8 caratteri)." };
  }

  if (password) {
    const salt = crypto.randomBytes(16).toString("hex");
    slots[slot - 1] = {
      email: clean,
      salt,
      hash: hashPassword(password, salt),
      createdAt: current?.createdAt ?? new Date().toISOString(),
    };
  } else if (current) {
    slots[slot - 1] = { ...current, email: clean };
  }

  await save({ version: 1, slots });
  return { ok: true };
}

/** Revoca (elimina) lo slot 1..6. */
export async function deleteSubadmin(slot: number): Promise<void> {
  if (!Number.isInteger(slot) || slot < 1 || slot > MAX_SUBADMINS) return;
  const stored = await load();
  const slots = [...stored.slots];
  slots[slot - 1] = null;
  await save({ version: 1, slots });
}
