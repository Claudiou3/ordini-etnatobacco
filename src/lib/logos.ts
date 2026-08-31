import { promises as fs } from "node:fs";
import path from "node:path";
import sharp from "sharp";

/**
 * Gestione dei LOGHI della piattaforma (lato amministratore).
 * - Primo logo (logo-1.png): quello in alto, di default e' l'attuale
 *   public/logo-detomaso.png finche' non viene sostituito.
 * - Secondo logo (logo-2.png): compare sotto il primo (opzionale).
 * I file caricati (JPG/PNG) vengono ridimensionati alla misura del logo
 * attuale (max 300x170, senza ingrandire) ed esportati come PNG.
 */

const LOGOS_DIR = path.join(process.cwd(), "public", "logos");
const CONFIG_FILE = path.join(process.cwd(), "data", "logos.json");

/** Misura di riferimento = dimensione intrinseca del logo attuale. */
const MAX_WIDTH = 300;
const MAX_HEIGHT = 170;

export type LogoInfo = {
  /** URL pubblico (con cache-busting) oppure stringa vuota se assente. */
  src: string;
  present: boolean;
};

type LogosConfig = {
  logo1?: { updatedAt: string };
  logo2?: { updatedAt: string };
};

async function readConfig(): Promise<LogosConfig> {
  try {
    return JSON.parse(await fs.readFile(CONFIG_FILE, "utf8")) as LogosConfig;
  } catch {
    return {};
  }
}

async function logoInfo(
  position: 1 | 2,
  config: LogosConfig
): Promise<LogoInfo> {
  const file = path.join(LOGOS_DIR, `logo-${position}.png`);
  try {
    const stat = await fs.stat(file);
    const v =
      config[`logo${position}`]?.updatedAt ??
      String(Math.round(stat.mtimeMs));
    return { src: `/logos/logo-${position}.png?v=${v}`, present: true };
  } catch {
    return { src: "", present: false };
  }
}

/**
 * Elimina il logo caricato nella posizione indicata (1 o 2).
 * Per il primo logo si torna automaticamente a quello originale
 * (public/logo-detomaso.png); per il secondo sparisce del tutto.
 */
export async function deleteUploadedLogo(
  position: 1 | 2
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    await fs.rm(path.join(LOGOS_DIR, `logo-${position}.png`), { force: true });

    const config = await readConfig();
    delete config[`logo${position}`];
    await fs.mkdir(path.dirname(CONFIG_FILE), { recursive: true });
    await fs.writeFile(CONFIG_FILE, JSON.stringify(config, null, 2));

    return { ok: true };
  } catch {
    return { ok: false, error: "Impossibile eliminare il logo." };
  }
}

/** Logo 1 (in alto) + logo 2 (sotto). Logo 1 usa il default finche' non cambia. */
export async function getLogos(): Promise<{
  logo1: LogoInfo;
  logo2: LogoInfo;
}> {
  const config = await readConfig();
  const uploaded = await logoInfo(1, config);
  const logo2 = await logoInfo(2, config);
  return {
    logo1: uploaded.present
      ? uploaded
      : { src: "/logo-detomaso.png", present: true },
    logo2,
  };
}

/**
 * Salva il logo caricato: valida il formato (JPG/PNG), lo ridimensiona alla
 * misura del logo attuale (max 300x170, proporzioni mantenute, nessun
 * ingrandimento) e lo esporta come PNG in public/logos/.
 */
export async function saveUploadedLogo(
  position: 1 | 2,
  input: Buffer
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const image = sharp(input);
    const meta = await image.metadata();
    if (!meta.format || !["png", "jpeg"].includes(meta.format)) {
      return { ok: false, error: "Formato non valido: usa solo JPG o PNG." };
    }

    const output = await image
      .resize({
        width: MAX_WIDTH,
        height: MAX_HEIGHT,
        fit: "inside",
        withoutEnlargement: true,
      })
      .png()
      .toBuffer();

    await fs.mkdir(LOGOS_DIR, { recursive: true });
    await fs.writeFile(path.join(LOGOS_DIR, `logo-${position}.png`), output);

    const config = await readConfig();
    config[`logo${position}`] = { updatedAt: new Date().toISOString() };
    await fs.mkdir(path.dirname(CONFIG_FILE), { recursive: true });
    await fs.writeFile(CONFIG_FILE, JSON.stringify(config, null, 2));

    return { ok: true };
  } catch {
    return { ok: false, error: "Immagine non valida o danneggiata." };
  }
}
