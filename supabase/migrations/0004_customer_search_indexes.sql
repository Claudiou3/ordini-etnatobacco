-- ============================================================
-- 0004: Indici per la ricerca clienti veloce (pg_trgm)
-- ============================================================
-- La ricerca usa `ilike '%testo%'` su ragione sociale, P.IVA, CF e città.
-- Senza indici appositi Postgres fa una scansione completa della tabella
-- (11.813+ righe) e la ricerca risulta lenta. Gli indici TRIGRAM (GIN)
-- rendono istantanea la ricerca parziale (bastano 3+ caratteri).
--
-- Esegui questo file nella SQL Editor di Supabase. E' idempotente.

create extension if not exists pg_trgm;

create index if not exists customers_ragione_sociale_trgm
  on public.customers using gin (ragione_sociale gin_trgm_ops);

create index if not exists customers_partita_iva_trgm
  on public.customers using gin (partita_iva gin_trgm_ops);

create index if not exists customers_codice_fiscale_trgm
  on public.customers using gin (codice_fiscale gin_trgm_ops);

create index if not exists customers_citta_trgm
  on public.customers using gin (citta gin_trgm_ops);
