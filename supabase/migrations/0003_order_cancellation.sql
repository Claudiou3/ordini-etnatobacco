-- ============================================================
-- 0003: Annullamento ordini (lato amministratore)
-- ============================================================
-- L'amministratore può ANNULLARE un ordine (es. cliente che rifiuta
-- la merce) inserendo una motivazione. L'ordine resta visibile ma
-- viene mostrato in grigio scuro all'agente con la motivazione e
-- NON genera provvigioni.
--
-- Esegui questo file nella SQL Editor di Supabase (Database -> SQL Editor).
-- E' idempotente: puoi rieseguirlo senza danni.

alter table public.orders add column if not exists stato text not null default 'attivo';
alter table public.orders add column if not exists annullamento_motivo text;
alter table public.orders add column if not exists annullato_at timestamptz;
