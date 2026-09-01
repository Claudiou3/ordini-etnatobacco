import { promises as fs } from "node:fs";
import path from "node:path";
import { existsSync } from "node:fs";
import XLSXPopulate from "xlsx-populate";
import JSZip from "jszip";
import { appDataDir, appDataPath, appRootPath } from "@/lib/data-dir";
import { uploadOrderExcel, downloadWorkingTemplate } from "./storage";

/**
 * Generazione del MODULO ORDINE Excel.
 *
 * Parte da ordine_template.xlsx (copia di lavoro in data/ se presente,
 * altrimenti il file in root) e compila:
 *  - intestazione cliente e ordine (righe 4-12);
 *  - quantita' e totali per le righe articolo del catalogo (col P/Q/R);
 *  - totali (trasporto, IVA trasporto, totale ordine).
 *
 * I totali vengono scritti come VALORI (non formule) così il file e'
 * correttamente leggibile ovunque anche senza ricalcolo.
 */

const DATA_DIR = appDataDir();
const WORKING_TEMPLATE = appDataPath("ordine_template.xlsx");
const ROOT_TEMPLATE = appRootPath("ordine_template.xlsx");

export type OrderExcelCliente = {
  ragione_sociale: string;
  indirizzo: string;
  cap: string;
  citta: string;
  provincia: string;
  partita_iva: string;
  codice_fiscale: string;
  sdi: string;
  cellulare: string;
  email: string;
};

export type OrderExcelItem = {
  row: number; // riga 1-based nel catalogo/template
  quantita: number;
  totaleEscl: number; // TOTALE IVA ESCL.
  totaleIncl: number; // TOTALE IVA INCL.
};

export type OrderExcelOmaggio = {
  descrizione: string;
  quantita: number;
};

export type OrderExcelTotali = {
  imponibile: number;
  iva: number;
  trasporto: number;
  ivaTrasporto: number;
  totale: number;
};

export type OrderExcelInput = {
  numero_ordine: string;
  data_ordine: string;
  agente: string;
  pagamento: string;
  note: string;
  cliente: OrderExcelCliente;
  items: OrderExcelItem[];
  /** Omaggi: NON diventano righe articolo ma vengono riportati nel campo note. */
  omaggi?: OrderExcelOmaggio[];
  totali: OrderExcelTotali;
};

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

/**
 * Inserisce il valore in cache <v> dentro una cella formula <c...><f>...</f></c>.
 * Le formule restano (Excel/altri ricalcolano se necessario), ma il valore
 * salvato rende l'importo subito visibile anche nei programmi che NON
 * ricalcolano all'apertura (xlsx-populate di default non emette <v> con le
 * formule, quindi le celle "TOTALE" delle righe articolo risulterebbero vuote).
 */
function injectFormulaValue(xml: string, cellRef: string, value: number): string {
  const esc = cellRef.replace(/[$]/g, "\\$&");
  const re = new RegExp(
    `(<c[^>]*r=["']${esc}["'][^>]*>)(<f[^>]*>[\\s\\S]*?<\\/f>)(<\\/c>)`
  );
  if (!re.test(xml)) return xml;
  return xml.replace(re, `$1$2<v>${value}</v>$3`);
}

/** Aggiunge i valori in cache alle celle formula Q/R delle righe ordinate. */
async function injectCachedValues(
  buffer: Buffer,
  values: Map<number, { totaleEscl: number; totaleIncl: number }>
): Promise<Buffer> {
  if (values.size === 0) return buffer;
  try {
    const zip = await JSZip.loadAsync(buffer);
    const entry = zip.file("xl/worksheets/sheet1.xml");
    if (!entry) return buffer;
    let xml = await entry.async("string");
    for (const [row, item] of values) {
      xml = injectFormulaValue(xml, `Q${row}`, round2(item.totaleEscl));
      xml = injectFormulaValue(xml, `R${row}`, round2(item.totaleIncl));
    }
    zip.file("xl/worksheets/sheet1.xml", xml);
    return (await zip.generateAsync({ type: "nodebuffer" })) as Buffer;
  } catch {
    // Se l'iniezione fallisce il file resta comunque valido (formule senza cache).
    return buffer;
  }
}

function templateFile(): string {
  return existsSync(WORKING_TEMPLATE) ? WORKING_TEMPLATE : ROOT_TEMPLATE;
}

/**
 * Fonte del template per generare l'ordine:
 * 1) template di lavoro su Supabase Storage (sconti/prezzi gestiti dal Catalogo);
 * 2) file locale data/ordine_template.xlsx;
 * 3) template originale in root (committato nel repo).
 */
async function openTemplate(): Promise<{ buffer?: Buffer; file?: string }> {
  const remote = await downloadWorkingTemplate();
  if (remote) return { buffer: remote };
  if (existsSync(WORKING_TEMPLATE)) return { file: WORKING_TEMPLATE };
  if (existsSync(ROOT_TEMPLATE)) return { file: ROOT_TEMPLATE };
  throw new Error("File ordine_template.xlsx non trovato.");
}

export async function generateOrderWorkbook(
  input: OrderExcelInput
): Promise<Buffer> {
  const source = await openTemplate();
  const workbook = source.buffer
    ? await XLSXPopulate.fromDataAsync(source.buffer)
    : await XLSXPopulate.fromFileAsync(source.file!);
  const sheet = workbook.sheet(0);

  const { cliente, items, totali } = input;

  // Intestazione (righe 1-based del template).
  // Le etichette occupano le celle unite A:C, quindi i VALORI vanno in
  // colonna D (D4:D12) e NON in B (altrimenti finirebbero dentro il label).
  sheet.cell(4, 4).value(cliente.ragione_sociale);
  sheet.cell(4, 9).value(input.data_ordine);
  sheet.cell(5, 4).value(cliente.indirizzo);
  sheet.cell(5, 9).value(input.numero_ordine);
  sheet.cell(6, 4).value(cliente.cap);
  sheet.cell(6, 9).value(input.agente);
  sheet.cell(7, 4).value(cliente.citta);
  sheet.cell(7, 9).value(input.pagamento);
  sheet.cell(8, 4).value(cliente.provincia);
  // Note: gli OMAGGI richiesti compaiono nel campo note del modulo Excel.
  let noteText = input.note.trim();
  if (input.omaggi && input.omaggi.length > 0) {
    const lines = input.omaggi
      .map((g) => `- ${g.descrizione} x${g.quantita}`)
      .join("\n");
    noteText = noteText
      ? `${noteText}\n\nOMAGGI:\n${lines}`
      : `OMAGGI:\n${lines}`;
  }
  sheet.cell(8, 9).value(noteText);
  // Testo a capo per visualizzare note e omaggi su piu' righe.
  try {
    sheet.cell(8, 9).style("wrapText", true);
  } catch {
    // stile non applicabile: il contenuto resta comunque nel campo note
  }

  const pivaCf = [cliente.partita_iva, cliente.codice_fiscale]
    .filter(Boolean)
    .join(" / ");
  sheet.cell(9, 4).value(pivaCf);
  sheet.cell(10, 4).value(cliente.sdi);
  sheet.cell(11, 4).value(cliente.cellulare);
  sheet.cell(12, 4).value(cliente.email);

  // Righe articolo: P=QUANTITA'. Le colonne Q (TOTALE IVA ESCL.) e R (TOTALE
  // IVA INCL.) contengono le FORMULE del template (Q=N*P, R=O*P): le
  // RISCRIVIAMO per ogni articolo ordinato così il file conserva tutti i
  // collegamenti e i totali si ricalcolano come nel modulo cartaceo.
  const merged = new Map<
    number,
    { quantita: number; totaleEscl: number; totaleIncl: number }
  >();
  for (const item of items) {
    if (item.quantita <= 0) continue;
    const prev = merged.get(item.row) ?? {
      quantita: 0,
      totaleEscl: 0,
      totaleIncl: 0,
    };
    merged.set(item.row, {
      quantita: prev.quantita + item.quantita,
      totaleEscl: prev.totaleEscl + item.totaleEscl,
      totaleIncl: prev.totaleIncl + item.totaleIncl,
    });
  }
  for (const [row, item] of merged) {
    sheet.cell(row, 16).value(item.quantita);
    // Formula collegata all'articolo (come nel template originale).
    sheet.cell(row, 17).formula(`N${row}*P${row}`);
    sheet.cell(row, 18).formula(`O${row}*P${row}`);
  }

  // Totali (valori espliciti al posto delle formule)
  sheet.cell(288, 17).value(round2(totali.imponibile)); // Q: imponibile articoli
  sheet.cell(288, 18).value(round2(totali.imponibile + totali.iva)); // R: + IVA
  sheet.cell(291, 15).value(round2(totali.trasporto)); // O: trasporto
  sheet.cell(293, 15).value(round2(totali.ivaTrasporto)); // O: IVA trasporto
  // N: trasporto + IVA trasporto (come da formula template N294 = O291+O293)
  sheet.cell(294, 14).value(round2(totali.trasporto + totali.ivaTrasporto));
  sheet.cell(290, 18).value(round2(totali.totale)); // R: totale ordine

  // Genera il file e aggiunge i valori in cache alle celle formula Q/R delle
  // righe ordinate: formule presenti + importi subito visibili.
  const rawBuffer = (await workbook.outputAsync()) as Buffer;
  const values = new Map<number, { totaleEscl: number; totaleIncl: number }>();
  for (const [row, item] of merged) {
    values.set(row, {
      totaleEscl: item.totaleEscl,
      totaleIncl: item.totaleIncl,
    });
  }
  return injectCachedValues(rawBuffer, values);
}

/** Salva un ordine Excel (Supabase Storage se disponibile, altrimenti data/orders/) e ritorna l'URL pubblico. */
export async function saveOrderWorkbook(
  numero_ordine: string,
  buffer: Buffer
): Promise<string> {
  const fileName = `${numero_ordine}.xlsx`;
  const uploaded = await uploadOrderExcel(fileName, buffer);
  if (uploaded) {
    return `/ordini-files/${encodeURIComponent(fileName)}`;
  }
  const dir = path.join(DATA_DIR, "orders");
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(path.join(dir, fileName), buffer);
  return `/ordini-files/${encodeURIComponent(fileName)}`;
}
