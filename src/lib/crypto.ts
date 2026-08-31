import { promises as fs } from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

/**
 * Chiave di cifratura server-side (AES-256-GCM) per impostazioni e sessione admin.
 * - In produzione: impostare la variabile d'ambiente SETTINGS_ENCRYPTION_KEY (64 caratteri hex).
 * - In locale: se assente viene generata e salvata in data/.encryption-key
 *   (cartella data/ in .gitignore, mai versionata).
 */

const KEY_FILE = path.join(process.cwd(), "data", ".encryption-key");

let cachedKey: Buffer | null = null;

export async function getEncryptionKey(): Promise<Buffer> {
  if (cachedKey) return cachedKey;

  const envKey = process.env.SETTINGS_ENCRYPTION_KEY;
  if (envKey && envKey.trim() !== "") {
    const fromHex = Buffer.from(envKey, "hex");
    cachedKey =
      fromHex.length === 32 ? fromHex : crypto.createHash("sha256").update(envKey).digest();
    return cachedKey;
  }

  try {
    const stored = (await fs.readFile(KEY_FILE, "utf8")).trim();
    const buf = Buffer.from(stored, "hex");
    if (buf.length === 32) {
      cachedKey = buf;
      return cachedKey;
    }
  } catch {
    // file non ancora presente
  }

  const newKey = crypto.randomBytes(32);
  try {
    await fs.mkdir(path.dirname(KEY_FILE), { recursive: true });
    await fs.writeFile(KEY_FILE, newKey.toString("hex"), { mode: 0o600 });
  } catch {
    // file system in sola lettura: chiave solo in memoria
  }
  cachedKey = newKey;
  return cachedKey;
}
