export type Agent = {
  id: string;
  email: string;
  nome: string;
  ruolo: string;
  stato: string;
  created_at: string;
};

export type Customer = {
  id: string;
  ragione_sociale: string;
  indirizzo: string | null;
  cap: string | null;
  citta: string | null;
  provincia: string | null;
  partita_iva: string | null;
  codice_fiscale: string | null;
  sdi: string | null;
  cellulare: string | null;
  email: string | null;
  updated_at: string;
  updated_by: string | null;
  created_at: string;
};

export type Order = {
  id: string;
  agent_id: string;
  customer_id: string | null;
  numero_ordine: string;
  data_ordine: string;
  pagamento: string | null;
  imponibile: number;
  trasporto: number;
  iva: number;
  totale: number;
  file_url: string | null;
  /** Snapshot dell'anagrafica al momento dell'ordine: anche se la P.IVA/CF
   *  del cliente cambia in seguito, gli ordini precedenti mantengono i valori
   *  di allora. */
  partita_iva?: string | null;
  codice_fiscale?: string | null;
  created_at: string;
  /** Stato dell'ordine: "attivo" (predefinito) oppure "annullato"
   *  (annullato dall'amministratore, es. cliente che rifiuta la merce).
   *  Gli ordini annullati NON generano provvigioni per l'agente. */
  stato?: "attivo" | "annullato" | null;
  /** Motivazione dell'annullamento inserita dall'amministratore. */
  annullamento_motivo?: string | null;
  /** Data/ora dell'annullamento. */
  annullato_at?: string | null;
};

export type OrderItem = {
  id: string;
  order_id: string;
  product_row: number | null;
  descrizione: string;
  diottria: string | null;
  prezzo: number;
  sconto: number;
  iva: number;
  quantita: number;
  subtotale: number;
};

/** Riga di elenco ordini (colonne selezionate dal server). */
export type OrderListItem = {
  id: string;
  /** Id dell'agente: presente sugli ordini da file (per filtrare "I miei ordini"). */
  agent_id?: string;
  numero_ordine: string;
  data_ordine: string;
  /** Timestamp di trasmissione/arrivo: usato per l'ordinamento (piu' recente in alto). */
  created_at?: string;
  totale: number;
  pagamento: string | null;
  file_url: string | null;
  customers: Pick<Customer, "ragione_sociale"> | null;
  /** Snapshot P.IVA/CF al momento dell'ordine (per il filtro "I miei ordini"). */
  partita_iva?: string | null;
  codice_fiscale?: string | null;
  /** Letto/non letto dall'amministratore (solo lista admin). */
  read?: boolean;
  /** Stato ordine ("attivo" / "annullato"). Gli annullati non generano provvigioni. */
  stato?: "attivo" | "annullato" | null;
  /** Motivazione dell'annullamento (visibile all'agente). */
  annullamento_motivo?: string | null;
  /** Data/ora dell'annullamento. */
  annullato_at?: string | null;
};

/** Cliente del dettaglio: può contenere l'ANAGRAFICA COMPLETA quando il DB
 * la restituisce (indirizzo, CAP, città, provincia, SDI, cellulare, email). */
export type OrderCustomerDetail = Pick<Customer, "ragione_sociale"> &
  Partial<
    Pick<
      Customer,
      | "indirizzo"
      | "cap"
      | "citta"
      | "provincia"
      | "partita_iva"
      | "codice_fiscale"
      | "sdi"
      | "cellulare"
      | "email"
    >
  >;

export type OrderDetail = {
  order: Order & { customers: OrderCustomerDetail | null };
  items: OrderItem[];
};
