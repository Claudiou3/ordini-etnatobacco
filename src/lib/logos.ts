import { promises as fs } from "node:fs";
import path from "node:path";
import sharp from "sharp";
import { appDataPath, appRootPath } from "@/lib/data-dir";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAppSetting, setAppSetting } from "@/lib/supabase/app-settings";
import { ORDERS_BUCKET } from "@/lib/orders/storage";

/**
 * Gestione dei LOGHI della piattaforma (lato amministratore).
 * - Primo logo (logo-1.png): quello in alto, di default e' l'attuale
 *   public/logo-detomaso.png finche' non viene sostituito.
 * - Secondo logo (logo-2.png): compare sotto il primo (opzionale).
 *
 * ONLINE (Vercel): il filesystem e' in sola lettura, quindi i PNG caricati
 * vengono salvati in Supabase Storage (bucket "ordini", cartella "logos/")
 * e serviti dalla rotta /logo-files/logo-<n>.png (pubblica).
 * LOCALE: cartella public/logos/ (come prima).
 * La configurazione (timestamp per il cache-busting) vive in app_settings
 * (chiave "logos_config") online, altrimenti in data/logos.json.
 */

const LOGOS_DIR = path.join(appRootPath("public"), "logos");
const CONFIG_FILE = appDataPath("logos.json");
const LOGOS_PREFIX = "logos";
const LOGOS_CONFIG_SETTING_KEY = "logos_config";

/** Misura standard: loghi pagina normalizzati a 200x200, icona app 512x512. */

export type LogoInfo = {
  /** URL pubblico (con cache-busting) oppure stringa vuota se assente. */
  src: string;
  present: boolean;
  /**
   * Misura di RIFERIMENTO (px) del logo scelta dall'amministratore:
   * corrisponde alla dimensione nella barra laterale; login/registrazione
   * e anteprime ne derivano proporzionalmente via CSS.
   */
  size: number;
};

/** Posizioni logo: 1 e 2 = loghi della piattaforma, 3 = icona app (catalogo). */
export type LogoPosition = 1 | 2 | 3;

type LogosConfig = {
  logo1?: { updatedAt?: string; size?: number };
  logo2?: { updatedAt?: string; size?: number };
  logo3?: { updatedAt?: string; size?: number };
};

/**
 * Misura di RIFERIMENTO (px) di ciascun logo (== 80 px in sidebar).
 * 80 px * 1.875 = 150 px su login/registrazione (desktop),
 * 80 px * 0.625 = 50 px in anteprima mobile, ecc. (vedi globals.css).
 */
export const DEFAULT_LOGO_SIZE: Record<LogoPosition, number> = {
  1: 80,
  2: 80,
  3: 80,
};

/** Misura valida impostata dall'amministratore, altrimenti il default. */
function logoDisplaySize(
  config: LogosConfig,
  position: LogoPosition
): number {
  const size = config[`logo${position}`]?.size;
  return typeof size === "number" && Number.isFinite(size) && size > 0
    ? Math.round(size)
    : DEFAULT_LOGO_SIZE[position];
}

function logoStorageKey(position: LogoPosition): string {
  return `${LOGOS_PREFIX}/logo-${position}.png`;
}

/** Metadati del logo su Storage, se presente. */
async function storageLogoInfo(
  position: LogoPosition,
  config: LogosConfig
): Promise<string | null> {
  const supabase = await createAdminClient();
  if (!supabase) return null;
  const { data, error } = await supabase.storage
    .from(ORDERS_BUCKET)
    .list(LOGOS_PREFIX);
  if (error || !data) return null;
  const item = data.find((f) => f.name === `logo-${position}.png`);
  if (!item) return null;
  // Versione per il cache-busting (?v=...): usa l'updated_at dello Storage,
  // altrimenti il timestamp salvato al momento del caricamento, altrimenti 1.
  // Mai "adesso": un timestamp che cambia a ogni richiesta renderebbe l'URL
  // (e quindi il manifest) sempre diverso e annullerebbe la cache del browser.
  return (
    item.updated_at ??
    config[`logo${position}`]?.updatedAt ??
    "1"
  );
}

async function downloadLogoFile(position: LogoPosition): Promise<Buffer | null> {
  const supabase = await createAdminClient();
  if (!supabase) return null;
  const { data, error } = await supabase.storage
    .from(ORDERS_BUCKET)
    .download(logoStorageKey(position));
  if (error || !data) return null;
  try {
    return Buffer.from(await data.arrayBuffer());
  } catch {
    return null;
  }
}

async function uploadLogoFile(position: LogoPosition, buffer: Buffer): Promise<boolean> {
  const supabase = await createAdminClient();
  if (!supabase) return false;
  const { error } = await supabase.storage.from(ORDERS_BUCKET).upload(
    logoStorageKey(position),
    buffer,
    { contentType: "image/png", upsert: true }
  );
  return !error;
}

async function removeLogoFile(position: LogoPosition): Promise<boolean> {
  const supabase = await createAdminClient();
  if (!supabase) return false;
  const { error } = await supabase.storage
    .from(ORDERS_BUCKET)
    .remove([logoStorageKey(position)]);
  return !error;
}

async function readConfig(): Promise<LogosConfig> {
  const remote = await getAppSetting<LogosConfig>(LOGOS_CONFIG_SETTING_KEY);
  if (remote) return remote;
  try {
    return JSON.parse(await fs.readFile(CONFIG_FILE, "utf8")) as LogosConfig;
  } catch {
    return {};
  }
}

async function writeConfig(config: LogosConfig): Promise<void> {
  const saved = await setAppSetting(LOGOS_CONFIG_SETTING_KEY, config);
  if (!saved) {
    await fs.mkdir(path.dirname(CONFIG_FILE), { recursive: true });
    await fs.writeFile(CONFIG_FILE, JSON.stringify(config, null, 2));
  }
}

async function localLogoInfo(
  position: LogoPosition,
  config: LogosConfig
): Promise<LogoInfo> {
  const file = path.join(LOGOS_DIR, `logo-${position}.png`);
  try {
    const stat = await fs.stat(file);
    const v =
      config[`logo${position}`]?.updatedAt ??
      String(Math.round(stat.mtimeMs));
    return {
      src: `/logo-files/logo-${position}.png?v=${v}`,
      present: true,
      size: logoDisplaySize(config, position),
    };
  } catch {
    return {
      src: "",
      present: false,
      size: logoDisplaySize(config, position),
    };
  }
}


/** PNG di un logo per la rotta /logo-files/[file]: Storage prima, poi locale. */
export async function readLogoFile(file: string): Promise<Buffer | null> {
  if (!/^logo-[123]\.png$/.test(file)) return null;
  const position: LogoPosition =
    file === "logo-1.png" ? 1 : file === "logo-2.png" ? 2 : 3;
  const remote = await downloadLogoFile(position);
  if (remote) return remote;
  try {
    return await fs.readFile(path.join(LOGOS_DIR, file));
  } catch {
    return null;
  }
}

/**
 * Elimina il logo caricato nella posizione indicata (1, 2 o 3).
 * Per il primo logo si torna automaticamente a quello originale
 * (public/logo-detomaso.png); per il secondo/terzo sparisce del tutto.
 */
export async function deleteUploadedLogo(
  position: LogoPosition
): Promise<{ ok: true } | { ok: false; error: string }> {
  const removed = await removeLogoFile(position);
  if (removed) {
    const config = await readConfig();
    delete config[`logo${position}`];
    await writeConfig(config);
    return { ok: true };
  }
  try {
    await fs.rm(path.join(LOGOS_DIR, `logo-${position}.png`), { force: true });
    const config = await readConfig();
    delete config[`logo${position}`];
    await writeConfig(config);
    return { ok: true };
  } catch {
    return { ok: false, error: "Impossibile eliminare il logo." };
  }
}

/** Logo 1 (in alto) + logo 2 (sotto) + logo 3 (icona app catalogo). */
export async function getLogos(): Promise<{
  logo1: LogoInfo;
  logo2: LogoInfo;
  logo3: LogoInfo;
}> {
  const config = await readConfig();
  const storage1 = await storageLogoInfo(1, config);
  const storage2 = await storageLogoInfo(2, config);
  const storage3 = await storageLogoInfo(3, config);
  const logo1 =
    storage1 !== null
      ? {
          src: `/logo-files/logo-1.png?v=${encodeURIComponent(storage1)}`,
          present: true,
          size: logoDisplaySize(config, 1),
        }
      : await localLogoInfo(1, config);
  const logo2 =
    storage2 !== null
      ? {
          src: `/logo-files/logo-2.png?v=${encodeURIComponent(storage2)}`,
          present: true,
          size: logoDisplaySize(config, 2),
        }
      : await localLogoInfo(2, config);
  const logo3 =
    storage3 !== null
      ? {
          src: `/logo-files/logo-3.png?v=${encodeURIComponent(storage3)}`,
          present: true,
          size: logoDisplaySize(config, 3),
        }
      : await localLogoInfo(3, config);
  return {
    logo1: logo1.present
      ? logo1
      : {
          src: "/logo-detomaso.png",
          present: true,
          size: logoDisplaySize(config, 1),
        },
    logo2,
    logo3,
  };
}

/**
 * Imposta la misura (px) di visualizzazione di un logo (1, 2 o 3).
 * Il valore è la misura di RIFERIMENTO in piattaforma (barra laterale);
 * le altre viste (login/registrazione, anteprime) la scalano via CSS.
 * Salvata nella configurazione loghi (Impostazioni remote o file locale).
 */
export async function setLogoSize(
  position: LogoPosition,
  size: number
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!Number.isInteger(size) || size < 20 || size > 400) {
    return {
      ok: false,
      error: "La misura deve essere un numero intero tra 20 e 400 px.",
    };
  }
  try {
    const config = await readConfig();
    config[`logo${position}`] = {
      ...config[`logo${position}`],
      size: Math.round(size),
    };
    await writeConfig(config);
    return { ok: true };
  } catch {
    return {
      ok: false,
      error:
        "Impossibile salvare la misura (file system in sola lettura e Impostazioni remote non raggiungibili).",
    };
  }
}

/**
 * Salva il logo caricato: valida il formato (JPG/PNG), lo ridimensiona alla
 * misura del logo attuale (max 300x170, proporzioni mantenute, nessun
 * ingrandimento) e lo esporta come PNG. Online viene caricato su Supabase
 * Storage; in locale in public/logos/.
 */
export async function saveUploadedLogo(
  position: LogoPosition,
  input: Buffer
): Promise<{ ok: true } | { ok: false; error: string }> {
  let output: Buffer;
  try {
    const image = sharp(input);
    const meta = await image.metadata();
    if (!meta.format || !["png", "jpeg"].includes(meta.format)) {
      return { ok: false, error: "Formato non valido: usa solo JPG o PNG." };
    }

    // Loghi 1 e 2: normalizzati a 200x200 (stesso ingombro in pagina).
    // Logo 3 (icona app/catalogo): normalizzato a 512x512 quadrato.
    const isIcon = position === 3;
    const size = isIcon ? 512 : 200;
    output = await image
      .resize({
        width: size,
        height: size,
        fit: isIcon ? "cover" : "contain",
        position: "centre",
        background: { r: 255, g: 255, b: 255, alpha: isIcon ? 1 : 0 },
      })
      .png()
      .toBuffer();
  } catch {
    return { ok: false, error: "Immagine non valida o danneggiata." };
  }

  const config = await readConfig();
  config[`logo${position}`] = { updatedAt: new Date().toISOString() };

  // 1) Storage (online/Vercel).
  const uploaded = await uploadLogoFile(position, output);
  if (uploaded) {
    await writeConfig(config);
    return { ok: true };
  }

  // 2) File locale (o filesystem scrivibile).
  try {
    await fs.mkdir(LOGOS_DIR, { recursive: true });
    await fs.writeFile(path.join(LOGOS_DIR, `logo-${position}.png`), output);
    await writeConfig(config);
    return { ok: true };
  } catch {
    return {
      ok: false,
      error:
        "Impossibile salvare il logo: il file system è in sola lettura e lo Storage non è raggiungibile.",
    };
  }
}

