import path from "node:path";
import fs from "node:fs";

/**
 * Risoluzione robusta della cartella dati dell'applicazione.
 *
 * Tutti i file di configurazione/dati (admin, impostazioni cifrate, ordini,
 * provvigioni, template, email-config) vivono in `data/`. In passato la cartella
 * veniva risolta con `path.join(process.cwd(), "data")`: se l'app veniva avviata
 * con una working directory diversa dalla root del progetto (scorciatoia, servizio
 * Windows, ecc.) ogni lettura/scrittura falliva silenziosamente (email non inviate,
 * "file system non scrivibile", provvigioni a zero...).
 *
 * Priorita':
 *  1. Variabile d'ambiente `DATA_DIR` (es. su un server dove i file sono altrove).
 *  2. `process.cwd()/data` se contiene gia' un file dell'app.
 *  3. Ricerca verso l'alto a partire da `process.cwd()` per trovare la root del
 *     progetto (funziona anche se avviato da una sottocartella).
 *  4. Fallback: `process.cwd()/data`.
 */

const APP_DATA_MARKERS = [
  "settings.json",
  "admin.json",
  "email-config.json",
  "orders.json",
];

function looksLikeDataDir(dir: string): boolean {
  try {
    return APP_DATA_MARKERS.some((marker) =>
      fs.existsSync(path.join(dir, marker))
    );
  } catch {
    return false;
  }
}

export function appDataDir(): string {
  const envDir = process.env.DATA_DIR;
  if (envDir && envDir.trim() !== "") return envDir.trim();

  const cwdData = path.join(process.cwd(), "data");
  if (looksLikeDataDir(cwdData)) return cwdData;

  // Risali le directory fino alla root del filesystem (max 8 livelli).
  let dir = process.cwd();
  for (let i = 0; i < 8; i++) {
    const candidate = path.join(dir, "data");
    if (looksLikeDataDir(candidate)) return candidate;
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }

  return cwdData;
}

/** Path assoluto dentro la cartella dati. */
export function appDataPath(...parts: string[]): string {
  return path.join(appDataDir(), ...parts);
}

/**
 * Radice del progetto. Usata per i file che vivono nella root e NON in
 * data/ (es. `ordine_template.xlsx`, `anagrafica_clienti.xlsx` originali).
 */
export function appRootDir(): string {
  if (process.env.DATA_DIR && process.env.DATA_DIR.trim() !== "") {
    return process.cwd();
  }
  const data = appDataDir();
  if (path.basename(data) === "data") return path.dirname(data);
  return process.cwd();
}

/** Path assoluto dentro la radice del progetto. */
export function appRootPath(...parts: string[]): string {
  return path.join(appRootDir(), ...parts);
}

