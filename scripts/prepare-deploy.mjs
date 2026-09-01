#!/usr/bin/env node
/**
 * Prepara un pacchetto ZIP pronto da caricare su un server con Node.js
 * e filesystem scrivibile (VPS/hosting). Copia l'intera applicazione
 * (compresa la cartella data/ con admin, chiavi, anagrafica, ordini),
 * escludendo node_modules, .next e i file di sviluppo, e genera un
 * .env.local adatto al server (senza DATA_DIR Windows e senza la
 * password in chiaro: sullo store cifrato copiato funziona tutto).
 *
 * Uso: node scripts/prepare-deploy.mjs
 * Output: ../ordini-ioi-DEPLOY.zip  (accanto alla cartella del progetto)
 */
import { promises as fs } from "node:fs";
import path from "node:path";
import JSZip from "jszip";

const root = path.join(import.meta.dirname, "..");
const parent = path.dirname(root);
const outZip = path.join(parent, "ordini-ioi-DEPLOY.zip");
const zipName = "ordini-ioi";

const SKIP_DIRS = new Set([
  "node_modules",
  ".next",
  ".git",
  "backups",
  "deploy-stage",
  "public/logos",
]);
const SKIP_FILES = new Set([
  "build-out.txt",
  "dev-out.txt",
  "dev-server.txt",
  ".DS_Store",
  "curl-test.txt",
]);

async function collectFiles(dir) {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  const out = [];
  for (const e of entries) {
    const abs = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (SKIP_DIRS.has(e.name) || e.name === ".next") continue;
      out.push(...(await collectFiles(abs)));
    } else if (e.isFile()) {
      if (SKIP_FILES.has(e.name)) continue;
      out.push(abs);
    }
  }
  return out;
}

// .env.local per il server: senza DATA_DIR (path Windows) e senza la
// password SMTP in chiaro (viene usata quella cifrata in data/settings.json).
async function serverEnvLocal() {
  const envFile = path.join(root, ".env.local");
  let content = "";
  try {
    content = await fs.readFile(envFile, "utf8");
  } catch {
    content = "";
  }
  const lines = content
    .split(/\r?\n/)
    .filter((line) => {
      const t = line.trim();
      if (/^DATA_DIR=/.test(t)) return false;
      if (/^EMAIL_ACCOUNT_PASSWORD=/.test(t)) return false;
      return true;
    });
  lines.push(
    "",
    "# --- Adattato da scripts/prepare-deploy.mjs per il server ---",
    "# La cartella data/ viene risolta automaticamente da process.cwd().",
    "# Per la password SMTP usa Impostazioni -> Configurazione server email",
    "# (store cifrato copiato insieme al progetto) oppure imposta la",
    "# variabile d'ambiente EMAIL_ACCOUNT_PASSWORD sul server.",
    ""
  );
  return lines.join("\n");
}

const deployReadme = `ORDINI IOI - DEPLOY SU SERVER CON NODE.JS
=================================================

COSA E' QUESTO PACCHETTO
  Copia completa dell'applicazione, incluse le impostazioni e i dati
  (amministratore, chiavi cifrate, anagrafica clienti, ordini, template).
  Estrailo in una cartella sul server e avvia come in locale.

PREREQUISITI DEL SERVER
  1. Node.js 20 o superiore (LTS consigliata):  https://nodejs.org
  2. Un filesystem SCRIVIBILE e permanente (VPS/hosting con disco).
     IMPORTANTE: questo pacchetto NON funziona su piattaforme serverless
     (Vercel, Netlify) perché li' la cartella data/ non e' scrivibile.
  3. Porta aperta (default 3000) e, per l'uso reale, HTTPS tramite un
     reverse proxy (es. nginx/Caddy).

PASSI
  1. Copia il pacchetto sul server ed estrailo, es.
     unzip ordini-ioi-DEPLOY.zip -d /opt/ordini
  2. Installa le dipendenze (NON copiare node_modules da Windows:
     i moduli nativi come sharp devono essere compilati sul server):
       cd /opt/ordini && npm ci
  3. Compila la versione di produzione:
       npm run build
  4. Avvia:
       npm start          (oppure: pm2 start npm --name ordini -- start)
     L'app gira su http://localhost:3000 (reindirizzata da nginx).
  5. Accedi da browser all'indirizzo pubblico, entra come amministratore
     (la tua email) e verifica nelle Impostazioni il pulsante
     "Invia email di prova".

DATI E SICUREZZA
  - La cartella data/ contiene credenziali e dati personali: proteggi il
    server (utente dedicato, permessi 700 sulla cartella data/).
  - Se vuoi cambiare la password email, fallo da Impostazioni -> Config.
    server email (verra' salvata cifrata). In alternativa imposta la
    variabile d'ambiente EMAIL_ACCOUNT_PASSWORD nel processo.
  - I clienti e gli ordini usano Supabase (gia' configurato): anche se il
    server locale cambiasse, i dati restano nel cloud.
`;

const zip = new JSZip();
const files = await collectFiles(root);
for (const abs of files) {
  const rel = path.relative(root, abs).split(path.sep).join("/");
  const buf = await fs.readFile(abs);
  zip.file(zipName + "/" + rel, buf);
}
zip.file(zipName + "/.env.local", await serverEnvLocal());
zip.file(zipName + "/DEPLOY-README.txt", deployReadme);

const out = await zip.generateAsync({
  type: "nodebuffer",
  compression: "DEFLATE",
});
await fs.writeFile(outZip, out);
console.log(`Pacchetto creato: ${outZip}`);
console.log(`File inclusi: ${files.length + 2}`);
