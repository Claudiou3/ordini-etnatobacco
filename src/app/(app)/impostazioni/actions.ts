"use server";

import { revalidatePath } from "next/cache";
import XLSXPopulate from "xlsx-populate";
import { writeStoredSetting, clearStoredSetting } from "@/lib/settings/store";
import { API_KEY_DEFS } from "@/lib/settings/defs";
import { getCurrentAdmin } from "@/lib/supabase/session";
import { getDataClient } from "@/lib/supabase/data";
import { getSetting } from "@/lib/settings/runtime";
import { saveEmailConfig } from "@/lib/email/config";
import {
  deleteUploadedLogo,
  saveUploadedLogo,
  type LogoPosition,
} from "@/lib/logos";
import {
  parseAnagraficaFromWorkbook,
  importAnagrafica,
} from "@/lib/anagrafica/import";
import { mergeAnagraficaExcel } from "@/lib/anagrafica/file";
import {
  saveShippingSettings,
  resetShippingSettings,
} from "@/lib/shipping-settings";
import type { ShippingSettings } from "@/lib/shipping";

export type SettingsActionState = { error?: string; success?: boolean; name?: string };

export async function saveSetting(
  _prev: SettingsActionState,
  formData: FormData
): Promise<SettingsActionState> {
  const admin = await getCurrentAdmin();
  if (!admin || admin.subAdmin)
    return { error: "Operazione riservata all'amministratore." };

  const name = String(formData.get("name") ?? "");
  const value = String(formData.get("value") ?? "").trim();

  const def = API_KEY_DEFS.find((d) => d.name === name);
  if (!def) return { error: "Chiave sconosciuta." };
  if (!value) return { error: "Inserisci il valore." };
  if (def.validate) {
    const err = def.validate(value);
    if (err) return { error: err };
  }

  try {
    await writeStoredSetting(name, value);
  } catch {
    return {
      error:
        "Impossibile salvare (file system in sola lettura). In produzione usa le variabili d'ambiente.",
    };
  }

  revalidatePath("/impostazioni");
  return { success: true, name };
}

export async function clearSetting(formData: FormData): Promise<void> {
  const admin = await getCurrentAdmin();
  if (!admin || admin.subAdmin) return;

  const name = String(formData.get("name") ?? "");
  if (API_KEY_DEFS.some((d) => d.name === name)) {
    await clearStoredSetting(name);
  }
  revalidatePath("/impostazioni");
}

export type EmailConfigActionState = {
  error?: string;
  success?: boolean;
};

/** Salva la configurazione del server email (SMTP/IMAP) dalle Impostazioni. */
export async function saveEmailConfigAction(
  _prev: EmailConfigActionState,
  formData: FormData
): Promise<EmailConfigActionState> {
  const admin = await getCurrentAdmin();
  if (!admin || admin.subAdmin)
    return { error: "Operazione riservata all'amministratore." };

  const str = (key: string) => String(formData.get(key) ?? "").trim();
  const account = str("account");
  if (!account) return { error: "Indica l'indirizzo e-mail dell'account." };

  try {
    await saveEmailConfig(
      {
        displayName: str("displayName"),
        account,
        imapServer: str("imapServer"),
        imapPort: str("imapPort"),
        imapSecure: str("imapSecure"),
        smtpServer: str("smtpServer"),
        smtpPort: str("smtpPort"),
        smtpSecure: str("smtpSecure"),
        username: str("username") || account,
      },
      str("password")
    );
  } catch {
    return {
      error:
        "Impossibile salvare (file system in sola lettura). In produzione usa le variabili d'ambiente.",
    };
  }

  revalidatePath("/impostazioni");
  return { success: true };
}

export type ImportExcelState = {
  error?: string;
  inserted?: number;
  updated?: number;
  skipped?: number;
  note?: string;
};

/**
 * Caricamento/aggiornamento dell'anagrafica clienti da file Excel.
 *
 * Regole (identiche per anagrafica locale e database):
 *  - cliente GIA' PRESENTE (stessa P.IVA OPPURE stesso codice fiscale) ->
 *    AGGIORNATO riscrivendo i dati del file, inclusi CF/P.IVA aggiornati
 *    (es. cambio di gestione padre->figlio). Gli ordini gia' emessi
 *    conservano lo snapshot di CF/P.IVA del momento dell'ordine;
 *  - cliente NUOVO -> INSERITO;
 *  - NESSUN cliente viene mai eliminato.
 */
export async function importCustomersExcel(
  formData: FormData
): Promise<ImportExcelState> {
  const admin = await getCurrentAdmin();
  if (!admin || admin.subAdmin)
    return { error: "Operazione riservata all'amministratore." };

  const file = formData.get("file");
  if (!(file instanceof File)) return { error: "Seleziona un file Excel (.xlsx)." };
  if (!file.name.toLowerCase().endsWith(".xlsx")) {
    return { error: "Il file deve essere in formato .xlsx." };
  }

  try {
    const buffer = Buffer.from(await file.arrayBuffer());
    const workbook = await XLSXPopulate.fromDataAsync(buffer);
    const records = parseAnagraficaFromWorkbook(workbook);
    if (records.length === 0) {
      return { error: "Nessuna riga valida trovata nel file." };
    }

    // 1) Anagrafica LOCALE (copia di lavoro data/anagrafica_clienti.xlsx):
    //    è la fonte usata da ricerca clienti e modulo ordine. Su Vercel il
    //    file non esiste: il merge locale viene saltato senza bloccare.
    const excelResult = await mergeAnagraficaExcel(records);

    // 2) Database Supabase: solo se c'è la service role (altrimenti la RLS
    //    bloccherebbe l'import e il tentativo sarebbe solo una perdita di tempo).
    let db: Awaited<ReturnType<typeof importAnagrafica>> | null = null;
    const serviceRole = await getSetting("SUPABASE_SERVICE_ROLE_KEY");
    if (serviceRole) {
      try {
        const client = await getDataClient();
        if (client) db = await importAnagrafica(client, records);
      } catch {
        db = null;
      }
    }

    revalidatePath("/clienti");
    revalidatePath("/dashboard");

    const localError = excelResult.error;
    return {
      inserted: excelResult.inserted + (db?.inserted ?? 0),
      updated: excelResult.updated + (db?.updated ?? 0),
      skipped: excelResult.skipped + (db?.skipped ?? 0),
      note:
        db === null
          ? localError
            ? `Database non raggiungibile (service role non configurata): ${localError}`
            : "Anagrafica locale aggiornata; database non raggiungibile (service role non configurata)."
          : localError
            ? `Importati in Supabase; anagrafica locale non aggiornata: ${localError}`
            : undefined,
    };
  } catch (err) {
    return { error: "Errore durante l'importazione: " + (err as Error).message };
  }
}

export type LogoUploadState = { ok?: boolean; error?: string };

/**
 * Carica/sostituisce un logo della piattaforma (1 = primo logo in alto,
 * 2 = secondo logo sotto, 3 = icona app/catalogo da scaricare).
 * Formati ammessi: JPG e PNG; le immagini vengono ridimensionate
 * automaticamente alla misura giusta.
 */
export async function uploadLogoAction(
  position: LogoPosition,
  formData: FormData
): Promise<LogoUploadState> {
  const admin = await getCurrentAdmin();
  if (!admin || admin.subAdmin) {
    return { error: "Operazione riservata all'amministratore." };
  }
  if (position !== 1 && position !== 2 && position !== 3) {
    return { error: "Posizione logo non valida." };
  }

  const file = formData.get("file");
  if (!(file instanceof File)) {
    return { error: "Seleziona un file immagine (JPG o PNG)." };
  }
  if (file.size <= 0) return { error: "Il file selezionato è vuoto." };
  if (file.size > 8 * 1024 * 1024) {
    return { error: "File troppo grande: massimo 8 MB." };
  }
  if (
    file.type &&
    !["image/png", "image/jpeg"].includes(file.type.toLowerCase())
  ) {
    return { error: "Formato non valido: usa solo JPG o PNG." };
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const result = await saveUploadedLogo(position, buffer);
  if (!result.ok) return { error: result.error };
  return { ok: true };
}



/**
 * Elimina un logo della piattaforma (1 = primo logo in alto, 2 = secondo,
 * 3 = icona app). Per il primo logo si torna al logo originale; gli altri
 * spariscono.
 */
export async function deleteLogoAction(
  position: LogoPosition
): Promise<LogoUploadState> {
  const admin = await getCurrentAdmin();
  if (!admin || admin.subAdmin) {
    return { error: "Operazione riservata all'amministratore." };
  }
  if (position !== 1 && position !== 2 && position !== 3) {
    return { error: "Posizione logo non valida." };
  }

  const result = await deleteUploadedLogo(position);
  if (!result.ok) return { error: result.error };
  return { ok: true };
}

export type ShippingSettingsActionState = {
  error?: string;
  success?: boolean;
  excelWarning?: string;
};

/**
 * Salva le impostazioni "Spese di spedizione" dall'area Impostazioni:
 * sezione 1 (metodo percentuale attuale, valori estrapolati da Excel e
 * modificabili) e sezione 2 (importo fisso con IVA calcolata dal sistema).
 * Solo l'amministratore principale puo' operare.
 */
export async function saveShippingSettingsAction(
  _prev: ShippingSettingsActionState,
  formData: FormData
): Promise<ShippingSettingsActionState> {
  const admin = await getCurrentAdmin();
  if (!admin || admin.subAdmin) {
    return { error: "Operazione riservata all'amministratore." };
  }

  const method = String(formData.get("method") ?? "percentuale");
  const num = (key: string): number =>
    parseFloat(String(formData.get(key) ?? "").replace(",", "."));

  const percent = num("percentuale_percent");
  const min = num("percentuale_min");
  const max = num("percentuale_max");
  const iva = num("iva");
  const amount = num("fisso_amount");

  if (method !== "percentuale" && method !== "fisso") {
    return { error: "Metodo di calcolo non valido." };
  }
  if (!Number.isFinite(percent) || percent < 0 || percent > 100) {
    return { error: "Percentuale non valida (deve essere tra 0 e 100)." };
  }
  if (!Number.isFinite(min) || min < 0) {
    return { error: "Importo minimo non valido (deve essere ≥ 0)." };
  }
  if (!Number.isFinite(max) || max < min) {
    return {
      error:
        "Importo massimo non valido (deve essere maggiore o uguale al minimo).",
    };
  }
  if (!Number.isFinite(iva) || iva < 0 || iva > 100) {
    return { error: "IVA sul trasporto non valida (deve essere tra 0 e 100)." };
  }
  if (method === "fisso" && (!Number.isFinite(amount) || amount <= 0)) {
    return {
      error:
        "Con il metodo 'importo fisso' inserisci un costo di spedizione maggiore di zero.",
    };
  }

  const result = await saveShippingSettings({
    method,
    percentuale: { percent, min, max },
    fisso: { amount: Number.isFinite(amount) && amount > 0 ? amount : 0 },
    iva,
  });

  if (!result.ok) return { error: result.error };
  revalidatePath("/impostazioni");
  revalidatePath("/nuovo-ordine");
  return { success: true, excelWarning: result.excelWarning };
}

export type ShippingResetActionState = {
  error?: string;
  success?: boolean;
  excelWarning?: string;
  settings?: ShippingSettings;
};

/**
 * Ripristina le spese di spedizione ORIGINALI (template Excel in root:
 * percentuale 2,9% / min €9,50 / max €99,00 / IVA 22%, metodo percentuale,
 * importo fisso azzerato). Solo l'amministratore principale puo' operare.
 */
export async function resetShippingSettingsAction(
  _prev: ShippingResetActionState,
  _formData: FormData
): Promise<ShippingResetActionState> {
  // Parametri richiesti da useActionState ma non usati da questa azione.
  void _prev;
  void _formData;

  const admin = await getCurrentAdmin();
  if (!admin || admin.subAdmin) {
    return { error: "Operazione riservata all'amministratore." };
  }

  const result = await resetShippingSettings();
  if (!result.ok) return { error: result.error };

  revalidatePath("/impostazioni");
  revalidatePath("/nuovo-ordine");
  return {
    success: true,
    excelWarning: result.excelWarning,
    settings: result.settings,
  };
}

