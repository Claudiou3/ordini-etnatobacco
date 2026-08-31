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
