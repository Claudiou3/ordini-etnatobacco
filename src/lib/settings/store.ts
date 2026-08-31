import { promises as fs } from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { getEncryptionKey } from "@/lib/crypto";

/**
 * Archivio impostazioni crittografate (AES-256-GCM).
 * I valori NON vengono mai restituiti in chiaro alle pagine:
 * viene esposto solo lo stato (configurata / non configurata).
 */

const DATA_DIR = path.join(process.cwd(), "data");
const SETTINGS_FILE = path.join(DATA_DIR, "settings.json");

type StoredEntry = { cipher: string; iv: string; tag: string; updatedAt: string };
type SettingsMap = Record<string, StoredEntry>;

async function readMap(): Promise<SettingsMap> {
  try {
    return JSON.parse(await fs.readFile(SETTINGS_FILE, "utf8")) as SettingsMap;
  } catch {
    return {};
  }
}

async function writeMap(map: SettingsMap): Promise<void> {
  await fs.mkdir(DATA_DIR, { recursive: true });
  await fs.writeFile(SETTINGS_FILE, JSON.stringify(map, null, 2), { mode: 0o600 });
}

function encrypt(plain: string, key: Buffer): StoredEntry {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const enc = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  return {
    cipher: enc.toString("base64"),
    iv: iv.toString("base64"),
    tag: cipher.getAuthTag().toString("base64"),
    updatedAt: new Date().toISOString(),
  };
}

function decrypt(entry: StoredEntry, key: Buffer): string {
  const decipher = crypto.createDecipheriv(
    "aes-256-gcm",
    key,
    Buffer.from(entry.iv, "base64")
  );
  decipher.setAuthTag(Buffer.from(entry.tag, "base64"));
  return Buffer.concat([
    decipher.update(Buffer.from(entry.cipher, "base64")),
    decipher.final(),
  ]).toString("utf8");
}

export async function readStoredSetting(name: string): Promise<string | null> {
  const map = await readMap();
  const entry = map[name];
  if (!entry) return null;
  try {
    return decrypt(entry, await getEncryptionKey());
  } catch {
    return null;
  }
}

export async function writeStoredSetting(name: string, value: string): Promise<void> {
  const map = await readMap();
  map[name] = encrypt(value, await getEncryptionKey());
  await writeMap(map);
}

export async function clearStoredSetting(name: string): Promise<void> {
  const map = await readMap();
  if (map[name]) {
    delete map[name];
    await writeMap(map);
  }
}

export async function listStoredSettings(): Promise<
  Record<string, { updatedAt: string }>
> {
  const map = await readMap();
  const out: Record<string, { updatedAt: string }> = {};
  for (const [name, entry] of Object.entries(map)) {
    out[name] = { updatedAt: entry.updatedAt };
  }
  return out;
}
