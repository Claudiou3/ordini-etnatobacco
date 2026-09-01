import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Archiviazione dei file Excel degli ordini.
 * - Online (Vercel): bucket privato "ordini" di Supabase Storage.
 * - Locale: cartella data/orders/.
 * L'URL pubblico resta lo stesso: /ordini-files/<nome-file>.
 */

export const ORDERS_BUCKET = "ordini";

const XLSX_CONTENT_TYPE =
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

export async function uploadOrderExcel(
  fileName: string,
  buffer: Buffer
): Promise<boolean> {
  const supabase = await createAdminClient();
  if (!supabase) return false;
  const { error } = await supabase.storage.from(ORDERS_BUCKET).upload(
    fileName,
    buffer,
    {
      contentType: XLSX_CONTENT_TYPE,
      upsert: true,
    }
  );
  return !error;
}

export async function downloadOrderExcel(
  fileName: string
): Promise<Buffer | null> {
  const supabase = await createAdminClient();
  if (!supabase) return null;
  const { data, error } = await supabase.storage
    .from(ORDERS_BUCKET)
    .download(fileName);
  if (error || !data) return null;
  try {
    return Buffer.from(await data.arrayBuffer());
  } catch {
    return null;
  }
}

/**
 * Template di lavoro ordine_template.xlsx (con sconti/prezzi gestiti dal
 * Catalogo). Su Vercel non c'è data/ordine_template.xlsx: il file aggiornato
 * vive qui nello Storage e viene usato sia dal Catalogo sia dalla generazione
 * dei moduli ordine.
 */
export const WORKING_TEMPLATE_KEY = "ordine_template.xlsx";

export async function downloadWorkingTemplate(): Promise<Buffer | null> {
  const supabase = await createAdminClient();
  if (!supabase) return null;
  const { data, error } = await supabase.storage
    .from(ORDERS_BUCKET)
    .download(WORKING_TEMPLATE_KEY);
  if (error || !data) return null;
  try {
    return Buffer.from(await data.arrayBuffer());
  } catch {
    return null;
  }
}

export async function uploadWorkingTemplate(buffer: Buffer): Promise<boolean> {
  const supabase = await createAdminClient();
  if (!supabase) return false;
  const { error } = await supabase.storage.from(ORDERS_BUCKET).upload(
    WORKING_TEMPLATE_KEY,
    buffer,
    {
      contentType: XLSX_CONTENT_TYPE,
      upsert: true,
    }
  );
  return !error;
}

