/**
 * Costanti e tipi condivisi dei sub-amministratori.
 * SENZA import Node.js: usabili anche dai componenti client.
 */

/** Numero massimo di sub-amministratori gestibili. */
export const MAX_SUBADMINS = 6;

/** Riga sub-amministratore esposta alla UI (mai la password/hash). */
export type SubadminView = {
  /** Slot 1..6. */
  slot: number;
  email: string;
  createdAt: string;
};
