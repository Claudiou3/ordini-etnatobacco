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

/** Misura di riferimento = formato in cui vengono normalizzati i loghi. */
const MAX_WIDTH = 200;
const MAX_HEIGHT = 200;

export type LogoInfo = {
  /** URL pubblico (con cache-busting) oppure stringa vuota se assente. */
  src: string;
  present: boolean;
};

type LogosConfig = {
  logo1?: { updatedAt: string };
  logo2?: { updatedAt: string };
};

function logoStorageKey(position: 1 | 2): string {
  return `${LOGOS_PREFIX}/logo-${position}.png`;
}

/** Metadati del logo su Storage, se presente. */
async function storageLogoInfo(
  position: 1 | 2
): Promise<{ updatedAt: string } | null> {
  const supabase = await createAdminClient();
  if (!supabase) return null;
  const { data, error } = await supabase.storage
    .from(ORDERS_BUCKET)
    .list(LOGOS_PREFIX);
  if (error || !data) return null;
  const item = data.find((f) => f.name === `logo-${position}.png`);
  if (!item) return null;
  return { updatedAt: item.updated_at ?? new Date().toISOString() };
}

async function downloadLogoFile(position: 1 | 2): Promise<Buffer | null> {
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

async function uploadLogoFile(position: 1 | 2, buffer: Buffer): Promise<boolean> {
  const supabase = await createAdminClient();
  if (!supabase) return false;
  const { error } = await supabase.storage.from(ORDERS_BUCKET).upload(
    logoStorageKey(position),
    buffer,
    { contentType: "image/png", upsert: true }
  );
  return !error;
}

async function removeLogoFile(position: 1 | 2): Promise<boolean> {
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
  position: 1 | 2,
  config: LogosConfig
): Promise<LogoInfo> {
  const file = path.join(LOGOS_DIR, `logo-${position}.png`);
  try {
    const stat = await fs.stat(file);
    const v =
      config[`logo${position}`]?.updatedAt ??
      String(Math.round(stat.mtimeMs));
    return { src: `/logo-files/logo-${position}.png?v=${v}`, present: true };
  } catch {
    return { src: "", present: false };
  }
}


/** PNG di un logo per la rotta /logo-files/[file]: Storage prima, poi locale. */
export async function readLogoFile(file: string): Promise<Buffer | null> {
  if (!/^logo-[12]\.png$/.test(file)) return null;
  const position: 1 | 2 = file === "logo-1.png" ? 1 : 2;
  const remote = await downloadLogoFile(position);
  if (remote) return remote;
  try {
    return await fs.readFile(path.join(LOGOS_DIR, file));
  } catch {
    return null;
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

/** Logo 1 (in alto) + logo 2 (sotto). Logo 1 usa il default finche' non cambia. */
export async function getLogos(): Promise<{
  logo1: LogoInfo;
  logo2: LogoInfo;
}> {
  const config = await readConfig();
  const storage1 = await storageLogoInfo(1);
  const storage2 = await storageLogoInfo(2);
  const logo1 =
    storage1 !== null
      ? {
          src: `/logo-files/logo-1.png?v=${encodeURIComponent(storage1.updatedAt)}`,
          present: true,
        }
      : await localLogoInfo(1, config);
  const logo2 =
    storage2 !== null
      ? {
          src: `/logo-files/logo-2.png?v=${encodeURIComponent(storage2.updatedAt)}`,
          present: true,
        }
      : await localLogoInfo(2, config);
  return {
    logo1: logo1.present
      ? logo1
      : { src: "/logo-detomaso.png", present: true },
    logo2,
  };
}

/**
 * Salva il logo caricato: valida il formato (JPG/PNG), lo ridimensiona alla
 * misura del logo attuale (max 300x170, proporzioni mantenute, nessun
 * ingrandimento) e lo esporta come PNG. Online viene caricato su Supabase
 * Storage; in locale in public/logos/.
 */
export async function saveUploadedLogo(
  position: 1 | 2,
  input: Buffer
): Promise<{ ok: true } | { ok: false; error: string }> {
  let output: Buffer;
  try {
    const image = sharp(input);
    const meta = await image.metadata();
    if (!meta.format || !["png", "jpeg"].includes(meta.format)) {
      return { ok: false, error: "Formato non valido: usa solo JPG o PNG." };
    }

    // Entrambi i loghi vengono normalizzati allo STESSO formato esatto
    // 200x200 (con trasparenza attorno, se le proporzioni differiscono):
    // cosi' in pagina hanno sempre lo stesso ingombro massimo.
    output = await image
      .resize({
        width: MAX_WIDTH,
        height: MAX_HEIGHT,
        fit: "contain",
        position: "centre",
        background: { r: 0, g: 0, b: 0, alpha: 0 },
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

