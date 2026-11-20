import { z } from "zod";

/** Campo di testo facoltativo: accetta stringa vuota o undefined. */
const optionalText = (max: number) =>
  z.string().trim().max(max).optional().or(z.literal(""));

export const customerSchema = z.object({
  ragione_sociale: z.string().trim().min(1).max(200),
  indirizzo: optionalText(255),
  cap: optionalText(10),
  citta: optionalText(100),
  provincia: optionalText(2),
  partita_iva: optionalText(20),
  codice_fiscale: optionalText(20),
  sdi: optionalText(7),
  cellulare: optionalText(30),
  email: z.email().optional().or(z.literal("")),
});

export type CustomerInput = z.infer<typeof customerSchema>;

/**
 * Anagrafica di UN ordine (correzione dell'amministratore).
 * Intenzionalmente piu' permissiva di customerSchema: i valori originali
 * dell'ordine potrebbero avere lunghezze diverse dall'anagrafica condivisa
 * (es. provincia scritta per esteso). Non deve mai bloccare la correzione di un
 * altro campo. La ragione sociale resta obbligatoria e l'email, se presente,
 * deve essere valida.
 */
export const orderAnagraficaSchema = z.object({
  ragione_sociale: z.string().trim().min(1).max(200),
  indirizzo: optionalText(255),
  cap: optionalText(20),
  citta: optionalText(120),
  provincia: optionalText(120),
  partita_iva: optionalText(30),
  codice_fiscale: optionalText(30),
  sdi: optionalText(20),
  cellulare: optionalText(40),
  email: z.email().optional().or(z.literal("")),
});

export type OrderAnagraficaInput = z.infer<typeof orderAnagraficaSchema>;

/**
 * MODIFICA COMPLETA di un ordine (solo amministratore principale): anagrafica
 * dell'ordine, PEC/CMNR/note, righe articolo (quantita' e sconto %) e omaggi.
 */
export const orderEditSchema = z.object({
  order_id: z.string().trim().min(1).max(100),
  anagrafica: orderAnagraficaSchema,
  pec: z.string().trim().max(200),
  cmnr: z.string().trim().max(100),
  note: z.string().trim().max(2000),
  items: z
    .array(
      z.object({
        id: z.string().trim().max(100).optional(),
        row: z.number().int().min(1).max(100000),
        qty: z.number().int().min(1).max(999),
        pct: z.number().min(0).max(100),
      })
    )
    .max(300),
  gifts: z
    .array(
      z.object({
        id: z.string().trim().max(100).optional(),
        row: z.number().int().min(1).max(100000),
        qty: z.number().int().min(1).max(100),
      })
    )
    .max(50),
});

export type OrderEditInput = z.infer<typeof orderEditSchema>;
