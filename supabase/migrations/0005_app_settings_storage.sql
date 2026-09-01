-- ============================================================
-- 0005: App settings (configurazione online) + Storage ordini
-- ============================================================
-- Serve a far funzionare su Vercel/online (filesystem in sola lettura)
-- le funzioni che prima usavano la cartella locale data/:
--  - account amministratore (admin.json)
--  - percentuali provvigioni (commissions.json)
--  - impostazioni spedizione (shipping-settings.json)
--  - sub-amministratori (subadmins.json)
--  - override "multiplo di 4" del catalogo (catalog-step4.json)
--  - configurazione loghi e stato lettura ordini
--
-- Esegui questo file nella SQL Editor di Supabase. E' idempotente.
-- ============================================================

-- -----------------------------------------------
-- 1) Tabella chiave-valore (JSON)
-- Solo la service_role key puo' leggere/scrivere.
-- -----------------------------------------------
create table if not exists public.app_settings (
  key text primary key,
  value jsonb not null,
  updated_at timestamptz not null default now()
);

alter table public.app_settings enable row level security;

revoke all on table public.app_settings from anon;
revoke all on table public.app_settings from authenticated;
grant all on table public.app_settings to service_role;

-- -----------------------------------------------
-- 2) Storage bucket "ordini" per i file Excel generati
--    (bucket PRIVATO: i file si leggono solo con service_role)
--    In alternativa crealo dalla dashboard: Storage -> New bucket
--    nome "ordini", Public: NO.
-- -----------------------------------------------
insert into storage.buckets (id, name, public)
values ('ordini', 'ordini', false)
on conflict (id) do nothing;
