#!/usr/bin/env node
/**
 * Aggiorna .env.local con DATA_DIR (percorso assoluto della cartella dati),
 * così l'app trova admin/impostazioni/ordini anche se viene avviata con una
 * working directory diversa dalla root del progetto.
 * La password SMTP NON viene scritta in chiaro: in locale si legge dallo
 * store cifrato; in produzione si imposta EMAIL_ACCOUNT_PASSWORD nelle
 * variabili d'ambiente (vedi VERCEL-SETUP.md).
 *
 * Uso: node scripts/update-env-local.mjs
 */
import { promises as fs } from "node:fs";
import path from "node:path";

const root = path.join(import.meta.dirname, "..");
const dataDir = path.join(root, "data");
const envFile = path.join(root, ".env.local");

let envContent = "";
try {
  envContent = await fs.readFile(envFile, "utf8");
} catch {
  // file non presente
}

// Rimuove eventuali valori esistenti per evitare duplicati.
const keepLines = envContent
  .split(/\r?\n/)
  .filter((line) => {
    const t = line.trim();
    return !/^DATA_DIR=/.test(t) && !/^EMAIL_ACCOUNT_PASSWORD=/.test(t);
  });

const lines = [
  ...keepLines,
  "",
  "# ============================================================",
  "# Inviate dallo script scripts/update-env-local.mjs",
  "# ============================================================",
  "# Percorso assoluto della cartella dati: rende l'app indipendente dalla",
  "# working directory (se sposti il progetto aggiorna questo valore).",
  `DATA_DIR=${path.resolve(dataDir)}`,
  "",
];

await fs.writeFile(envFile, lines.join("\n"));
console.log(".env.local aggiornato (DATA_DIR).");
