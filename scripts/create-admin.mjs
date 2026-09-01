#!/usr/bin/env node
/**
 * Crea l'account amministratore da terminale (alternativa al form di login).
 *
 * Uso:
 *   node --env-file-if-exists=.env.local scripts/create-admin.mjs --email=<email> --password=<password>
 *
 * Opzioni:
 *   --token   stampa anche un SESSION_TOKEN valido (per test/verifiche)
 *   --help
 *
 * Nota: per il primo accesso dall'interfaccia usa semplicemente la pagina
 * di login, che mostra il pannello "Configurazione amministratore".
 */

import { promises as fs } from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

const args = { email: null, password: null, token: false };
for (const arg of process.argv.slice(2)) {
  if (arg === "--help") {
    console.log(
      "Uso: node --env-file-if-exists=.env.local scripts/create-admin.mjs --email=<email> --password=<password> [--token]"
    );
    process.exit(0);
  }
  if (arg.startsWith("--email=")) args.email = arg.slice("--email=".length);
  if (arg.startsWith("--password=")) args.password = arg.slice("--password=".length);
  if (arg === "--token") args.token = true;
}

const DATA_DIR = process.env.DATA_DIR && process.env.DATA_DIR.trim() !== ""
  ? process.env.DATA_DIR.trim()
  : path.join(process.cwd(), "data");
const ADMIN_FILE = path.join(DATA_DIR, "admin.json");
const KEY_FILE = path.join(DATA_DIR, ".encryption-key");

if (!args.email || !args.password) {
  console.error(
    "Uso: node --env-file-if-exists=.env.local scripts/create-admin.mjs --email=<email> --password=<password> [--token]"
  );
  process.exit(1);
}
if (args.password.length < 8) {
  console.error("ERRORE: la password deve avere almeno 8 caratteri.");
  process.exit(1);
}

async function getKey() {
  const envKey = process.env.SETTINGS_ENCRYPTION_KEY;
  if (envKey && envKey.trim() !== "") {
    const fromHex = Buffer.from(envKey, "hex");
    return fromHex.length === 32
      ? fromHex
      : crypto.createHash("sha256").update(envKey).digest();
  }
  try {
    const stored = (await fs.readFile(KEY_FILE, "utf8")).trim();
    const buf = Buffer.from(stored, "hex");
    if (buf.length === 32) return buf;
  } catch {
    // chiave non ancora generata
  }
  const newKey = crypto.randomBytes(32);
  await fs.mkdir(DATA_DIR, { recursive: true });
  await fs.writeFile(KEY_FILE, newKey.toString("hex"), { mode: 0o600 });
  return newKey;
}

async function main() {
  try {
    const existing = JSON.parse(await fs.readFile(ADMIN_FILE, "utf8"));
    console.error(
      `ERRORE: esiste già un amministratore (${existing.email}). Per sostituirlo elimina data/admin.json.`
    );
    process.exit(1);
  } catch {
    // nessun admin presente
  }

  const email = args.email.trim().toLowerCase();
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = crypto
    .scryptSync(args.password, salt, 64, { N: 16384, r: 8, p: 1 })
    .toString("hex");

  await fs.mkdir(DATA_DIR, { recursive: true });
  await fs.writeFile(
    ADMIN_FILE,
    JSON.stringify({ email, salt, hash, createdAt: new Date().toISOString() }, null, 2),
    { mode: 0o600 }
  );
  console.log(`Amministratore creato: ${email}`);

  if (args.token) {
    const key = await getKey();
    const encEmail = Buffer.from(email, "utf8").toString("base64url");
    const expiry = Date.now() + 7 * 24 * 60 * 60 * 1000;
    const payload = `${encEmail}.${expiry}`;
    const sig = crypto.createHmac("sha256", key).update(payload).digest("base64url");
    console.log(`SESSION_TOKEN=${payload}.${sig}`);
  }
}

main().catch((err) => {
  console.error("Errore imprevisto:", err);
  process.exit(1);
});
