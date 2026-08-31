"use server";

import { revalidatePath } from "next/cache";
import { getDataClient } from "@/lib/supabase/data";
import { getCurrentAdmin } from "@/lib/supabase/session";
import { isSupabaseConfigured } from "@/lib/settings/runtime";
import {
  demoUpdateCustomer,
  demoDeleteCustomer,
  demoUpsertCustomer,
} from "@/lib/demo/store";
import { upsertAnagraficaExcel } from "@/lib/anagrafica/file";
import { customerSchema, type CustomerInput } from "@/lib/validation";

export type CustomerActionState = { error?: string; success?: boolean };

function readCustomerPayload(formData: FormData): CustomerInput {
  return {
    ragione_sociale: String(formData.get("ragione_sociale") ?? ""),
    indirizzo: String(formData.get("indirizzo") ?? ""),
    cap: String(formData.get("cap") ?? ""),
    citta: String(formData.get("citta") ?? ""),
    provincia: String(formData.get("provincia") ?? ""),
    partita_iva: String(formData.get("partita_iva") ?? ""),
    codice_fiscale: String(formData.get("codice_fiscale") ?? ""),
    sdi: String(formData.get("sdi") ?? ""),
    cellulare: String(formData.get("cellulare") ?? ""),
    email: String(formData.get("email") ?? ""),
  };
}

function emptyToNull(value: string | undefined): string | null {
  return value ? value : null;
}

function toCustomerRow(data: CustomerInput, updatedBy: string | null) {
  return {
    ragione_sociale: data.ragione_sociale,
    indirizzo: emptyToNull(data.indirizzo),
    cap: emptyToNull(data.cap),
    citta: emptyToNull(data.citta),
    provincia: emptyToNull(data.provincia),
    partita_iva: emptyToNull(data.partita_iva),
    codice_fiscale: emptyToNull(data.codice_fiscale),
    sdi: emptyToNull(data.sdi),
    cellulare: emptyToNull(data.cellulare),
    email: emptyToNull(data.email),
    updated_by: updatedBy,
  };
}

export async function createCustomer(
  _prev: CustomerActionState,
  formData: FormData
): Promise<CustomerActionState> {
  const parsed = customerSchema.safeParse(readCustomerPayload(formData));
  if (!parsed.success) {
    return { error: "Controlla i dati inseriti (ragione sociale obbligatoria)." };
  }

  if (!(await isSupabaseConfigured())) {
    const excelRes = await upsertAnagraficaExcel({
      ragione_sociale: parsed.data.ragione_sociale,
      indirizzo: parsed.data.indirizzo ?? "",
      cap: parsed.data.cap ?? "",
      citta: parsed.data.citta ?? "",
      provincia: parsed.data.provincia ?? "",
      partita_iva: parsed.data.partita_iva ?? "",
      codice_fiscale: parsed.data.codice_fiscale ?? "",
      sdi: parsed.data.sdi ?? "",
      cellulare: parsed.data.cellulare ?? "",
      email: parsed.data.email ?? "",
    });
    if (excelRes.error) return { error: excelRes.error };

    const demoRes = demoUpsertCustomer(parsed.data);
    if (demoRes.error) return { error: demoRes.error };

    revalidatePath("/clienti");
    return { success: true };
  }

  const supabase = await getDataClient();
  if (!supabase) return { error: "Database non disponibile." };

  const admin = await getCurrentAdmin();
  // I sub-amministratori sono in sola lettura: niente modifiche ai clienti.
  if (admin?.subAdmin) {
    return { error: "Operazione riservata all'amministratore." };
  }
  let updatedBy: string | null = null;
  if (!admin) {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { error: "Sessione scaduta. Accedi di nuovo." };
    updatedBy = user.id;
  }

  const { error } = await supabase
    .from("customers")
    .insert(toCustomerRow(parsed.data, updatedBy));
  if (error) {
    return { error: "Errore salvataggio: " + error.message };
  }

  revalidatePath("/clienti");
  return { success: true };
}

export async function updateCustomer(
  _prev: CustomerActionState,
  formData: FormData
): Promise<CustomerActionState> {
  const id = String(formData.get("id") ?? "");
  if (!id) return { error: "Cliente non specificato." };

  const parsed = customerSchema.safeParse(readCustomerPayload(formData));
  if (!parsed.success) {
    return { error: "Controlla i dati inseriti (ragione sociale obbligatoria)." };
  }

  if (!(await isSupabaseConfigured())) {
    const excelRes = await upsertAnagraficaExcel({
      ragione_sociale: parsed.data.ragione_sociale,
      indirizzo: parsed.data.indirizzo ?? "",
      cap: parsed.data.cap ?? "",
      citta: parsed.data.citta ?? "",
      provincia: parsed.data.provincia ?? "",
      partita_iva: parsed.data.partita_iva ?? "",
      codice_fiscale: parsed.data.codice_fiscale ?? "",
      sdi: parsed.data.sdi ?? "",
      cellulare: parsed.data.cellulare ?? "",
      email: parsed.data.email ?? "",
    });
    if (excelRes.error) return { error: excelRes.error };

    const demoRes = demoUpdateCustomer(id, parsed.data);
    if (demoRes.error) return { error: demoRes.error };

    revalidatePath("/clienti");
    return { success: true };
  }

  const supabase = await getDataClient();
  if (!supabase) return { error: "Database non disponibile." };

  const admin = await getCurrentAdmin();
  // I sub-amministratori sono in sola lettura: niente modifiche ai clienti.
  if (admin?.subAdmin) {
    return { error: "Operazione riservata all'amministratore." };
  }
  let updatedBy: string | null = null;
  if (!admin) {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { error: "Sessione scaduta. Accedi di nuovo." };
    updatedBy = user.id;
  }

  const { error } = await supabase
    .from("customers")
    .update(toCustomerRow(parsed.data, updatedBy))
    .eq("id", id);
  if (error) {
    return { error: "Errore salvataggio: " + error.message };
  }

  revalidatePath("/clienti");
  return { success: true };
}

export async function deleteCustomer(formData: FormData): Promise<void> {
  const id = String(formData.get("id") ?? "");
  if (!id) return;

  if (!(await isSupabaseConfigured())) {
    demoDeleteCustomer(id);
    revalidatePath("/clienti");
    return;
  }

  const supabase = await getDataClient();
  if (!supabase) return;

  await supabase.from("customers").delete().eq("id", id);
  revalidatePath("/clienti");
}
