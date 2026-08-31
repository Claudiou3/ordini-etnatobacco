#!/usr/bin/env node
/**
 * Esegue la migrazione SQL (creazione tabelle) sul database Supabase.
 *
 * Legge data/db.txt (oppure db.txt nella root del progetto) con formato:
 *   <label qualsiasi>
 *   https://<ref>.supabase.co
 *   ...
 *   password database
 *   <password>
 *
 * MAI stampa la password in output.
 */

import { readFileSync, existsSync } from "node:fs";
import path from "node:path";
import pg from "pg";

const { Client } = pg;

const DB_FILE_CANDIDATES = [
  path.join(process.cwd(), "data", "db.txt"),
  path.join(process.cwd(), "db.txt"),
];

const MIGRATION_FILE = path.join(
  process.cwd(),
  "supabase",
  "migrations",
  "0001_initial_schema.sql"
);

const dbFile = DB_FILE_CANDIDATES.find((f) => existsSync(f));
if (!dbFile) {
  console.error("ERRORE: db.txt non trovato (cerca data/db.txt o db.txt).");
  process.exit(1);
}
if (!existsSync(MIGRATION_FILE)) {
  console.error("ERRORE: file di migrazione non trovato.");
  process.exit(1);
}

const lines = readFileSync(dbFile, "utf8").split(/\r?\n/).map((l) => l.trim());

const urlMatch = lines.find((l) => /^https:\/\/[a-z0-9]+\.supabase\.co/i.test(l));
const ref = urlMatch ? urlMatch.match(/^https:\/\/([a-z0-9]+)\.supabase\.co/i)[1] : null;

let password = null;
for (let i = 0; i < lines.length; i++) {
  if (/password/i.test(lines[i])) {
    for (let j = i + 1; j < lines.length; j++) {
      if (lines[j]) {
        password = lines[j];
        break;
      }
    }
    break;
  }
}

if (!ref && !lines.some((l) => /^postgresql:\/\//i.test(l))) {
  console.error(
    "ERRORE: non trovo ne' l'indirizzo https://...supabase.co ne' una stringa postgresql:// nel file."
  );
  process.exit(1);
}

// Raccoglie TUTTE le stringhe di connessione postgresql:// presenti nel file
// e le prova in ordine (il pooler è spesso l'unica raggiungibile).
const explicitConfigs = [];
const uriLines = lines.filter((l) => /^postgresql:\/\//i.test(l));
for (const uriLine of uriLines) {
  try {
    const u = new URL(uriLine);
    const uriPass = u.password ? decodeURIComponent(u.password) : "";
    const isPlaceholder =
      /\[.*PASSWORD.*\]/i.test(u.password) || /^\[.*\]$/.test(u.password);
    explicitConfigs.push({
      host: u.hostname,
      port: Number(u.port || 5432),
      user: decodeURIComponent(u.username || "postgres"),
      database: (u.pathname || "/postgres").replace(/^\//, ""),
      password: password || (isPlaceholder ? "" : uriPass),
      label: uriLine.includes("pooler")
        ? "session/transaction pooler"
        : "stringa di connessione",
    });
  } catch {
    // stringa non valida: ignora
  }
}

const REGIONS = [
  "eu-central-1",
  "eu-west-1",
  "eu-west-2",
  "eu-west-3",
  "eu-north-1",
  "us-east-1",
  "us-east-2",
  "us-west-1",
  "us-west-2",
  "ap-southeast-1",
  "ap-southeast-2",
];

const HOSTS = ref
  ? [
      { host: `db.${ref}.supabase.co`, port: 5432, user: "postgres", label: "connessione diretta" },
      { host: `${ref}.supabase.co`, port: 5432, user: "postgres", label: "host progetto (.co)" },
      { host: `${ref}.supabase.com`, port: 5432, user: "postgres", label: "host progetto (.com)" },
      { host: `${ref}.supabase.com`, port: 5432, user: `postgres.${ref}`, label: "host progetto pooler (.com)" },
      { host: `${ref}.supabase.com`, port: 6543, user: `postgres.${ref}`, label: "host progetto pooler (.com 6543)" },
      ...REGIONS.flatMap((region) => [
        {
          host: `aws-0-${region}.pooler.supabase.com`,
          port: 5432,
          user: `postgres.${ref}`,
          label: `session pooler (${region})`,
        },
        {
          host: `aws-0-${region}.pooler.supabase.com`,
          port: 6543,
          user: `postgres.${ref}`,
          label: `transaction pooler (${region})`,
        },
      ]),
    ]
  : [];

async function tryConnect(cfg) {
  const client = new Client({
    host: cfg.host,
    port: cfg.port,
    user: cfg.user,
    database: cfg.database || "postgres",
    password: cfg.password,
    ssl: { rejectUnauthorized: false },
    connectionTimeoutMillis: 20000,
  });
  try {
    await client.connect();
    return client;
  } catch (err) {
    console.error(`Connessione ${cfg.label} fallita (${cfg.user}@${cfg.host}:${cfg.port}):`, err.message);
    try {
      await client.end();
    } catch {
      // ignora
    }
    return null;
  }
}

async function main() {
  if (ref) {
    console.log(`Progetto rilevato: ${ref}.supabase.co`);
  }

  let client = null;
  for (const cfg of explicitConfigs) {
    client = await tryConnect(cfg);
    if (client) {
      console.log(`Connessione riuscita via ${cfg.label}.`);
      break;
    }
  }
  if (!client) {
    for (const h of HOSTS) {
      client = await tryConnect(h);
      if (client) {
        console.log(`Connessione riuscita via ${h.label}.`);
        break;
      }
    }
  }
  if (!client) {
    console.error(
      "Impossibile connettersi. Controlla la stringa di connessione, la password e che il progetto permetta connessioni esterne."
    );
    process.exit(1);
  }
  console.log("Connesso al database.");

  const sql = readFileSync(MIGRATION_FILE, "utf8");
  console.log("Eseguo la migrazione...");
  try {
    await client.query(sql);
  } catch (err) {
    console.error("Errore durante la migrazione:", err.message);
    await client.end();
    process.exit(1);
  }

  const tables = ["agents", "customers", "orders", "order_items"];
  for (const t of tables) {
    const { rows } = await client.query(
      "select to_regclass($1) as rel",
      [`public.${t}`]
    );
    console.log(`${t}: ${rows[0]?.rel ? "OK ✓" : "NON creata ✗"}`);
  }

  console.log("Migrazione completata.");
  await client.end();
}

main().catch((err) => {
  console.error("Errore imprevisto:", err);
  process.exit(1);
});
