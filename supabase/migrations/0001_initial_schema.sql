-- IOI Orders – schema iniziale
-- Esegui questo file nella SQL Editor del progetto Supabase (Database -> SQL Editor)
-- oppure con: npx supabase db push (se configurato).

-- ============================================================
-- AGENTS
-- ============================================================
create table if not exists public.agents (
  id uuid primary key references auth.users (id) on delete cascade,
  email text not null,
  nome text not null,
  ruolo text not null default 'agente' check (ruolo in ('agente', 'admin')),
  stato text not null default 'attivo' check (stato in ('attivo', 'disattivato')),
  created_at timestamptz not null default now()
);

-- ============================================================
-- CUSTOMERS (anagrafica condivisa)
-- ============================================================
create table if not exists public.customers (
  id uuid primary key default gen_random_uuid(),
  ragione_sociale text not null,
  indirizzo text,
  cap text,
  citta text,
  provincia text,
  partita_iva text,
  codice_fiscale text,
  sdi text,
  cellulare text,
  email text,
  updated_at timestamptz not null default now(),
  updated_by uuid references public.agents (id) on delete set null,
  created_at timestamptz not null default now()
);

-- Un cliente e' identificato da P.IVA oppure da codice fiscale (se presenti).
create unique index if not exists customers_partita_iva_key
  on public.customers (lower(partita_iva))
  where partita_iva is not null and partita_iva <> '';

create unique index if not exists customers_codice_fiscale_key
  on public.customers (lower(codice_fiscale))
  where codice_fiscale is not null and codice_fiscale <> '';

create index if not exists customers_ragione_sociale_idx
  on public.customers (lower(ragione_sociale));

-- ============================================================
-- ORDERS
-- ============================================================
create table if not exists public.orders (
  id uuid primary key default gen_random_uuid(),
  agent_id uuid not null references public.agents (id) on delete cascade,
  customer_id uuid references public.customers (id) on delete set null,
  numero_ordine text not null,
  data_ordine date not null default current_date,
  pagamento text,
  imponibile numeric(12, 2) not null default 0,
  trasporto numeric(12, 2) not null default 0,
  iva numeric(12, 2) not null default 0,
  totale numeric(12, 2) not null default 0,
  file_url text,
  created_at timestamptz not null default now()
);

create index if not exists orders_agent_created_idx
  on public.orders (agent_id, created_at desc);

-- Snapshot CF/P.IVA al momento dell'ordine: le modifiche anagrafiche successive
-- NON toccano gli ordini gia' emessi (restano quelli di allora).
alter table public.orders add column if not exists partita_iva text;
alter table public.orders add column if not exists codice_fiscale text;

-- ============================================================
-- ORDER_ITEMS
-- ============================================================
create table if not exists public.order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders (id) on delete cascade,
  product_row integer,
  descrizione text not null,
  diottria text,
  prezzo numeric(12, 2) not null default 0,
  sconto numeric(12, 2) not null default 0,
  iva numeric(5, 2) not null default 22,
  quantita integer not null default 1,
  subtotale numeric(12, 2) not null default 0
);

create index if not exists order_items_order_idx
  on public.order_items (order_id);

-- ============================================================
-- TRIGGER: aggiorna automaticamente updated_at
-- ============================================================
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists customers_set_updated_at on public.customers;
create trigger customers_set_updated_at
  before update on public.customers
  for each row execute function public.set_updated_at();

-- ============================================================
-- TRIGGER: crea la riga in agents alla registrazione (auth.signUp)
-- ============================================================
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.agents (id, email, nome, ruolo)
  values (
    new.id,
    coalesce(new.email, ''),
    coalesce(new.raw_user_meta_data ->> 'nome', ''),
    coalesce(new.raw_user_meta_data ->> 'ruolo', 'agente')
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ============================================================
-- ROW LEVEL SECURITY
-- ============================================================
alter table public.agents enable row level security;
alter table public.customers enable row level security;
alter table public.orders enable row level security;
alter table public.order_items enable row level security;

-- Agenti: ciascun agente legge e modifica solo il proprio profilo.
drop policy if exists "agents read own" on public.agents;
create policy "agents read own" on public.agents
  for select using (auth.uid() = id);

drop policy if exists "agents update own" on public.agents;
create policy "agents update own" on public.agents
  for update using (auth.uid() = id);

-- Clienti: database condiviso tra tutti gli agenti autenticati.
drop policy if exists "customers shared read" on public.customers;
create policy "customers shared read" on public.customers
  for select using (auth.role() = 'authenticated');

drop policy if exists "customers shared insert" on public.customers;
create policy "customers shared insert" on public.customers
  for insert with check (auth.role() = 'authenticated');

drop policy if exists "customers shared update" on public.customers;
create policy "customers shared update" on public.customers
  for update using (auth.role() = 'authenticated');

drop policy if exists "customers shared delete" on public.customers;
create policy "customers shared delete" on public.customers
  for delete using (auth.role() = 'authenticated');

-- Ordini: ogni agente gestisce i propri ordini.
drop policy if exists "orders read own" on public.orders;
create policy "orders read own" on public.orders
  for select using (auth.uid() = agent_id);

drop policy if exists "orders insert own" on public.orders;
create policy "orders insert own" on public.orders
  for insert with check (auth.uid() = agent_id);

drop policy if exists "orders update own" on public.orders;
create policy "orders update own" on public.orders
  for update using (auth.uid() = agent_id);

drop policy if exists "orders delete own" on public.orders;
create policy "orders delete own" on public.orders
  for delete using (auth.uid() = agent_id);

-- Articoli: accessibili solo tramite un ordine dell'agente.
drop policy if exists "order_items read own" on public.order_items;
create policy "order_items read own" on public.order_items
  for select using (
    exists (
      select 1 from public.orders o
      where o.id = order_id and o.agent_id = auth.uid()
    )
  );

drop policy if exists "order_items insert own" on public.order_items;
create policy "order_items insert own" on public.order_items
  for insert with check (
    exists (
      select 1 from public.orders o
      where o.id = order_id and o.agent_id = auth.uid()
    )
  );

drop policy if exists "order_items update own" on public.order_items;
create policy "order_items update own" on public.order_items
  for update using (
    exists (
      select 1 from public.orders o
      where o.id = order_id and o.agent_id = auth.uid()
    )
  );

drop policy if exists "order_items delete own" on public.order_items;
create policy "order_items delete own" on public.order_items
  for delete using (
    exists (
      select 1 from public.orders o
      where o.id = order_id and o.agent_id = auth.uid()
    )
  );

-- ============================================================
-- GRANT
-- ============================================================
grant usage on schema public to authenticated, service_role;

grant all on table public.agents to authenticated, service_role;
grant all on table public.customers to authenticated, service_role;
grant all on table public.orders to authenticated, service_role;
grant all on table public.order_items to authenticated, service_role;

