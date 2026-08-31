-- ============================================================
-- 0002: Colonne snapshot CF/P.IVA sugli ordini
-- ============================================================
-- Gli ordini conservano la P.IVA e il codice fiscale del cliente
-- AL MOMENTO DELL'ORDINE. Se in seguito l'anagrafica viene riscritta
-- con CF/P.IVA aggiornati (es. cambio di gestione padre->figlio),
-- gli ordini gia' emessi mantengono i valori di allora.
--
-- Esegui questo file nella SQL Editor di Supabase (Database -> SQL Editor),
-- OPPURE insieme alla migrazione 0001 su un progetto nuovo.
-- E' idempotente: puoi rieseguirlo senza danni.

alter table public.orders add column if not exists partita_iva text;
alter table public.orders add column if not exists codice_fiscale text;
