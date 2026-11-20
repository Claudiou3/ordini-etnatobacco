import { promises as fs } from "node:fs";
import path from "node:path";
import XLSXPopulate from "xlsx-populate";
import { appDataPath } from "@/lib/data-dir";
import { getAppSetting, setAppSetting } from "@/lib/supabase/app-settings";
import { getDataClient } from "@/lib/supabase/data";
import { downloadOrderExcel, uploadOrderExcel } from "@/lib/orders/storage";
import type { OrderVariant } from "@/lib/catalog/order-catalog";
import { isValidGiftQty, isValidGiftTotal } from "@/lib/catalog/gift-rules";
import {
  calcTrasporto,
  calcIvaTrasporto,
  round2,
  type ShippingSettings,
} from "@/lib/shipping";
import type { OrderItem } from "@/lib/types";
import type { OrderEditInput } from "@/lib/validation";

/**
 * MODIFICA ORDINE (solo amministratore principale): logica isolata.
 *
 * - dati aggiuntivi per ordine (PEC, CMNR, note) salvati a parte, come la
 *   correzione anagrafica: Supabase `app_settings` (nessuna migrazione) con
 *   fallback sul file locale data/orders-edit.json;
 * - registro delle modifiche: prima di ogni salvataggio viene conservata la
 *   fotografia dell'ordine PRIMA della modifica (righe e totali);
 * - ricalcolo di imponibile, IVA, trasporto e totale con le impostazioni di
 *   spedizione attive;
 * - sostituzione righe su Supabase (`order_items`) senza mai lasciare l'ordine
 *   senza righe: prima si inseriscono le nuove, poi si tolgono le vecchie.
 */

const FILE = appDataPath("orders-edit.json");
const EXTRA_PREFIX = "order_extra:";
const LOG_PREFIX = "order_edit_log:";
const LOG_MAX = 20;

/* ------------------------------------------------------------------ */
/* Archivio chiave-valore (Supabase app_settings + file locale)         */
/* ------------------------------------------------------------------ */

async function readLocal(): Promise<Record<string, unknown>> {
  try {
    const raw = JSON.parse(await fs.readFile(FILE, "utf8")) as unknown;
    if (raw && typeof raw === "object") return raw as Record<string, unknown>;
  } catch {
    // file assente o non valido
  }
  return {};
}

async function kvGet<T>(key: string): Promise<T | null> {
  const remote = await getAppSetting<T>(key, { fresh: true });
  if (remote !== null && remote !== undefined) return remote;
  const local = (await readLocal())[key];
  return (local as T) ?? null;
}

async function kvSet(key: string, value: unknown): Promise<boolean> {
  if (await setAppSetting(key, value)) return true;
  try {
    const map = await readLocal();
    map[key] = value;
    await fs.mkdir(path.dirname(FILE), { recursive: true });
    await fs.writeFile(FILE, JSON.stringify(map, null, 2), "utf8");
    return true;
  } catch {
    return false;
  }
}

/* ------------------------------------------------------------------ */
/* PEC / CMNR / note dell'ordine                                        */
/* ------------------------------------------------------------------ */

export type OrderExtra = {
  pec: string;
  cmnr: string;
  note: string;
  updatedAt?: string;
  updatedBy?: string | null;
};

export async function getOrderExtra(orderId: string): Promise<OrderExtra | null> {
  if (!orderId) return null;
  const v = await kvGet<Partial<OrderExtra>>(EXTRA_PREFIX + orderId);
  if (!v || typeof v !== "object") return null;
  return {
    pec: String(v.pec ?? ""),
    cmnr: String(v.cmnr ?? ""),
    note: String(v.note ?? ""),
    updatedAt: v.updatedAt,
    updatedBy: v.updatedBy ?? null,
  };
}

export async function saveOrderExtra(
  orderId: string,
  data: { pec: string; cmnr: string; note: string },
  updatedBy?: string | null
): Promise<boolean> {
  return kvSet(EXTRA_PREFIX + orderId, {
    pec: data.pec.trim(),
    cmnr: data.cmnr.trim(),
    note: data.note.trim(),
    updatedAt: new Date().toISOString(),
    updatedBy: updatedBy ?? null,
  });
}

/* ------------------------------------------------------------------ */
/* Registro modifiche (fotografia "prima")                              */
/* ------------------------------------------------------------------ */

export type OrderEditLogEntry = {
  at: string;
  by: string | null;
  before: {
    imponibile: number;
    trasporto: number;
    iva: number;
    totale: number;
    file_url: string | null;
    items: Omit<OrderItem, "order_id">[];
  };
};

export async function appendOrderEditLog(
  orderId: string,
  entry: OrderEditLogEntry
): Promise<boolean> {
  const current = (await kvGet<OrderEditLogEntry[]>(LOG_PREFIX + orderId)) ?? [];
  const list = Array.isArray(current) ? current : [];
  list.push(entry);
  return kvSet(LOG_PREFIX + orderId, list.slice(-LOG_MAX));
}

/* ------------------------------------------------------------------ */
/* Lettura note/agente dal modulo Excel esistente (SOLA LETTURA)        */
/* ------------------------------------------------------------------ */

function fileNameFromRef(fileRef: string | null | undefined): string {
  let raw = String(fileRef ?? "").split("/").filter(Boolean).pop() ?? "";
  const q = raw.indexOf("?");
  if (q >= 0) raw = raw.slice(0, q);
  try {
    raw = decodeURIComponent(raw);
  } catch {
    // nome gia' leggibile
  }
  return path.basename(raw);
}

async function readExcelBuffer(fileName: string): Promise<Buffer | null> {
  try {
    const remote = await downloadOrderExcel(fileName);
    if (remote) return remote;
  } catch {
    // si prova il file locale
  }
  try {
    return await fs.readFile(appDataPath("orders", fileName));
  } catch {
    return null;
  }
}

/** Buffer del modulo Excel dell'ordine (Storage o data/orders), se esiste. */
export async function readOrderExcelBuffer(
  fileRef: string | null | undefined
): Promise<{ fileName: string; buffer: Buffer } | null> {
  const fileName = fileNameFromRef(fileRef);
  if (!fileName || !/\.xlsx$/i.test(fileName)) return null;
  const buffer = await readExcelBuffer(fileName);
  return buffer ? { fileName, buffer } : null;
}

/** Testo "AGENTE" (I6) e note (I8, senza il blocco OMAGGI) del modulo Excel. */
export async function readExcelAgentAndNote(
  fileRef: string | null | undefined
): Promise<{ agente: string; note: string } | null> {
  const found = await readOrderExcelBuffer(fileRef);
  if (!found) return null;
  try {
    const wb = await XLSXPopulate.fromDataAsync(found.buffer);
    const sheet = wb.sheet(0);
    const asText = (v: unknown) =>
      typeof v === "string" ? v : v == null ? "" : String(v);
    const agente = asText(sheet.cell(6, 9).value()).trim();
    let note = asText(sheet.cell(8, 9).value());
    const idx = note.search(/(^|\n)\s*OMAGGI:/);
    if (idx >= 0) note = note.slice(0, idx);
    return { agente, note: note.trim() };
  } catch {
    return null;
  }
}

/**
 * Sovrascrive il modulo Excel mantenendo lo STESSO nome file (il link gia'
 * inviato resta valido). Lancia un errore se non riesce a scrivere.
 */
export async function overwriteOrderWorkbook(
  fileRef: string,
  buffer: Buffer
): Promise<string> {
  const fileName = fileNameFromRef(fileRef);
  if (!fileName || !/\.xlsx$/i.test(fileName)) {
    throw new Error("Nome del file Excel non valido.");
  }
  const uploaded = await uploadOrderExcel(fileName, buffer);
  if (!uploaded) {
    const dir = appDataPath("orders");
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(path.join(dir, fileName), buffer);
  }
  return `/ordini-files/${encodeURIComponent(fileName)}`;
}

/* ------------------------------------------------------------------ */
/* Ricalcolo righe e totali                                             */
/* ------------------------------------------------------------------ */

export type EditedLine = Omit<OrderItem, "id" | "order_id">;

export type ExcelLineForEdit = {
  row: number;
  quantita: number;
  totaleEscl: number;
  totaleIncl: number;
};

export type OrderEditComputation = {
  lines: EditedLine[];
  imponibile: number;
  iva: number;
  trasporto: number;
  ivaTrasporto: number;
  totale: number;
  excelItems: ExcelLineForEdit[];
  omaggi: { descrizione: string; quantita: number }[];
};

const GIFT_SUFFIX = / — OMAGGIO\s*$/;

export function isGiftLine(item: Pick<OrderItem, "descrizione">): boolean {
  return GIFT_SUFFIX.test(item.descrizione ?? "");
}

/** Sconto % effettivo di una riga salvata (2 decimali). */
export function storedDiscountPct(
  item: Pick<OrderItem, "prezzo" | "sconto" | "quantita">
): number {
  if (!(item.prezzo > 0) || !(item.quantita > 0)) return 0;
  return round2((item.sconto / (item.prezzo * item.quantita)) * 100);
}

/**
 * Ricalcola l'ordine. I prezzi delle righe GIA' presenti restano quelli
 * dell'ordine (il listino potrebbe essere cambiato dopo); solo le righe nuove
 * prendono prezzo e IVA dal catalogo attuale.
 */
export function computeOrderEdit(args: {
  input: OrderEditInput;
  stored: OrderItem[];
  catalog: Map<number, OrderVariant>;
  giftCatalog: Map<number, OrderVariant>;
  shipping: ShippingSettings;
}): OrderEditComputation | { error: string } {
  const { input, stored, catalog, giftCatalog, shipping } = args;
  const storedMap = new Map(stored.map((s) => [s.id, s]));
  const lines: EditedLine[] = [];
  const excelItems: ExcelLineForEdit[] = [];

  for (const it of input.items) {
    const old = it.id ? storedMap.get(it.id) : undefined;
    if (it.id && (!old || isGiftLine(old))) {
      return { error: "Una riga dell'ordine non è più valida: riapri la modifica." };
    }
    const row = old?.product_row ?? it.row;
    const cat = catalog.get(row);

    let base: Pick<EditedLine, "product_row" | "descrizione" | "diottria" | "prezzo" | "iva">;
    if (old) {
      base = {
        product_row: old.product_row,
        descrizione: old.descrizione,
        diottria: old.diottria,
        prezzo: old.prezzo,
        iva: old.iva,
      };
    } else {
      if (!cat) return { error: "Articolo non trovato nel catalogo." };
      base = {
        product_row: cat.row,
        descrizione: cat.descrizione,
        diottria: cat.diottria || null,
        prezzo: round2(cat.prezzo),
        iva: cat.iva,
      };
    }

    const pct = round2(it.pct);
    const unchanged =
      Boolean(old) &&
      it.qty === old!.quantita &&
      Math.abs(pct - storedDiscountPct(old!)) < 0.0051;

    if (cat?.step4 && !unchanged && it.qty % 4 !== 0) {
      return {
        error: `La quantità di "${base.descrizione}" deve essere un multiplo di 4.`,
      };
    }

    let line: EditedLine;
    if (unchanged && old) {
      line = {
        ...base,
        sconto: old.sconto,
        quantita: old.quantita,
        subtotale: old.subtotale,
      };
    } else {
      // Sconto del catalogo (stesso valore) -> netto esatto del catalogo;
      // altrimenti sconto manuale applicato al prezzo della riga.
      const netto =
        cat &&
        round2(cat.prezzo) === base.prezzo &&
        Math.abs(cat.sconto * 100 - pct) < 0.0051
          ? cat.netto
          : base.prezzo * (1 - pct / 100);
      line = {
        ...base,
        sconto: round2((base.prezzo - netto) * it.qty),
        quantita: it.qty,
        subtotale: round2(netto * it.qty),
      };
    }
    lines.push(line);
  }

  // Omaggi: righe a importo 0 marcate "— OMAGGIO".
  let giftTotal = 0;
  const omaggi: { descrizione: string; quantita: number }[] = [];
  for (const g of input.gifts) {
    const old = g.id ? storedMap.get(g.id) : undefined;
    if (g.id && (!old || !isGiftLine(old))) {
      return { error: "Una riga omaggio non è più valida: riapri la modifica." };
    }
    if (!isValidGiftQty(g.qty)) {
      return { error: "Quantità omaggio non valida (da 1 a 10 pezzi)." };
    }
    giftTotal += g.qty;
    if (old) {
      lines.push({
        product_row: old.product_row,
        descrizione: old.descrizione,
        diottria: old.diottria,
        prezzo: old.prezzo,
        sconto: round2(old.prezzo * g.qty),
        iva: old.iva,
        quantita: g.qty,
        subtotale: 0,
      });
      omaggi.push({
        descrizione: old.descrizione.replace(GIFT_SUFFIX, ""),
        quantita: g.qty,
      });
    } else {
      const v = giftCatalog.get(g.row);
      if (!v) return { error: "Articolo omaggio non ammesso." };
      lines.push({
        product_row: v.row,
        descrizione: `${v.descrizione} — OMAGGIO`,
        diottria: v.diottria || null,
        prezzo: round2(v.prezzo),
        sconto: round2(v.prezzo * g.qty),
        iva: v.iva,
        quantita: g.qty,
        subtotale: 0,
      });
      omaggi.push({ descrizione: v.descrizione, quantita: g.qty });
    }
  }
  if (input.gifts.length > 0 && !isValidGiftTotal(giftTotal)) {
    return { error: "Totale omaggi non valido: massimo 10 pezzi." };
  }

  if (lines.length === 0) {
    return { error: "L'ordine deve contenere almeno un articolo." };
  }

  let imponibile = 0;
  let iva = 0;
  for (const l of lines) {
    if (isGiftLine(l)) continue;
    imponibile += l.subtotale;
    iva += round2(l.subtotale * (l.iva / 100));
    if (l.product_row != null) {
      excelItems.push({
        row: l.product_row,
        quantita: l.quantita,
        totaleEscl: l.subtotale,
        totaleIncl: round2(l.subtotale * (1 + l.iva / 100)),
      });
    }
  }
  imponibile = round2(imponibile);
  iva = round2(iva);
  const trasporto = round2(calcTrasporto(imponibile, shipping));
  const ivaTrasporto = round2(calcIvaTrasporto(imponibile, shipping));
  const totale = round2(imponibile + iva + trasporto + ivaTrasporto);

  return {
    lines,
    imponibile,
    iva,
    trasporto,
    ivaTrasporto,
    totale,
    excelItems,
    omaggi,
  };
}

/* ------------------------------------------------------------------ */
/* Scrittura su Supabase                                                */
/* ------------------------------------------------------------------ */

/**
 * Applica righe e totali all'ordine su Supabase.
 * Ritorna "absent" se l'ordine non e' nel database (ordine su file locale).
 */
export async function applyOrderEditToDb(
  orderId: string,
  header: {
    imponibile: number;
    trasporto: number;
    iva: number;
    totale: number;
    file_url?: string | null;
  },
  previousHeader: {
    imponibile: number;
    trasporto: number;
    iva: number;
    totale: number;
  },
  lines: EditedLine[],
  oldItemIds: string[]
): Promise<"ok" | "absent" | { error: string }> {
  const supabase = await getDataClient();
  if (!supabase) return "absent";

  const { data: exists, error: existsErr } = await supabase
    .from("orders")
    .select("id")
    .eq("id", orderId)
    .maybeSingle();
  if (existsErr) return { error: "Database non raggiungibile. Riprova." };
  if (!exists) return "absent";

  // 1) nuove righe (se fallisce non si tocca nulla)
  const rows = lines.map((l) => ({
    order_id: orderId,
    product_row: l.product_row,
    descrizione: l.descrizione,
    diottria: l.diottria,
    prezzo: l.prezzo,
    sconto: l.sconto,
    iva: l.iva,
    quantita: l.quantita,
    subtotale: l.subtotale,
  }));
  const { data: inserted, error: insErr } = await supabase
    .from("order_items")
    .insert(rows)
    .select("id");
  if (insErr || !inserted) {
    return { error: "Salvataggio righe non riuscito: l'ordine non è stato modificato." };
  }
  const newIds = inserted.map((r: { id: string }) => r.id);

  const rollback = async () => {
    try {
      await supabase.from("order_items").delete().in("id", newIds);
    } catch {
      // best effort
    }
  };

  // 2) testata
  const patch: Record<string, unknown> = {
    imponibile: header.imponibile,
    trasporto: header.trasporto,
    iva: header.iva,
    totale: header.totale,
  };
  if (header.file_url) patch.file_url = header.file_url;
  const { error: updErr } = await supabase
    .from("orders")
    .update(patch)
    .eq("id", orderId);
  if (updErr) {
    await rollback();
    return { error: "Salvataggio totali non riuscito: l'ordine non è stato modificato." };
  }

  // 3) vecchie righe
  if (oldItemIds.length > 0) {
    const { error: delErr } = await supabase
      .from("order_items")
      .delete()
      .in("id", oldItemIds);
    if (delErr) {
      await rollback();
      await supabase.from("orders").update(previousHeader).eq("id", orderId);
      return { error: "Sostituzione righe non riuscita: l'ordine non è stato modificato." };
    }
  }
  return "ok";
}
