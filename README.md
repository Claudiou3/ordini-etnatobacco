# IOI Orders

Applicazione standalone per la gestione ordini IOI. Il vecchio modulo WordPress resta intatto nella cartella padre.

## Stato attuale

- **Amministratore**: al primo accesso viene chiesta la creazione della password per l'account amministratore (email `claudiocalabrese77@gmail.com`). Da lì si accede alla sezione **Impostazioni** per inserire le API key necessarie (Supabase, Resend, email ordini) e **caricare/aggiornare l'anagrafica clienti** dal file Excel: i clienti già presenti (stessa P.IVA o codice fiscale) vengono riscritti con i dati del file — **inclusi CF/P.IVA aggiornati** (es. cambio di gestione padre→figlio) — mentre gli **ordini già emessi mantengono** la P.IVA/CF di allora (snapshot sull'ordine); i nuovi vengono inseriti, **nessun cliente viene mai eliminato**. Nella sezione **Catalogo** l'amministratore gestisce gli **sconti** del catalogo `ordine_template.xlsx` (singolarmente o in massa sulla selezione). I valori delle chiavi vengono **crittografati** (AES-256-GCM) e **mai più mostrati**. L'amministratore vede tutta l'applicazione.
- **Spedizione**: calcolo come da template `ordine_template.xlsx` e vecchio modulo WordPress — trasporto = 2,9% dell'imponibile (min €9,50, max €99,00), IVA trasporto 22% (modulo `src/lib/shipping.ts`). L'amministratore può gestire le **spese di spedizione** dalle Impostazioni (due sezioni: **metodo percentuale attuale** con i valori estrapolati dal file Excel, modificabili e riscritti anche in `data/ordine_template.xlsx`, e **importo fisso** sul quale il sistema calcola l'IVA con la formula attuale; un selettore decide quale metodo applicare agli ordini nuovi — `src/lib/shipping-settings.ts`).
- **Autenticazione agenti**: registrazione e login via Supabase Auth (email + password), logout, protezione delle route tramite `src/proxy.ts` (Next.js 16) e verifica server-side.
- **Modalità demo**: se Supabase **non è configurato**, dalla pagina di login puoi entrare con **"Entra in modalità demo"** per provare tutta l'app (dashboard, clienti con CRUD, ordini) con dati di esempio in memoria.
- **Database condiviso clienti**: schema PostgreSQL in `supabase/migrations/0001_initial_schema.sql` (agenti, clienti, ordini, articoli) con Row Level Security: i clienti sono visibili e modificabili da **tutti** gli agenti; gli ordini sono **per agente**.
- **Dashboard autenticata**: `/dashboard` con riepilogo ordini/clienti del mese e ultimi ordini; `/clienti` con ricerca per ragione sociale / P.IVA / codice fiscale e CRUD; `/ordini` con elenco e dettaglio ordine (articoli, prezzi, sconti, IVA, totali).
- **Tracciamento modifiche**: `customers.updated_at` (trigger automatico) e `customers.updated_by` (agente che ha modificato).
- **Annullamento ordini**: l'amministratore può **annullare un ordine** (dall'elenco ordini o dal dettaglio) inserendo la **motivazione** (es. cliente che rifiuta la merce). L'ordine resta visibile ma per l'agente compare **in grigio scuro con la motivazione**, e **non genera provvigioni**. Se l'annullamento avviene per errore è possibile **ripristinare** l'ordine (torna attivo e le provvigioni tornano valide). Colonne sul database: `stato`, `annullamento_motivo`, `annullato_at` (`supabase/migrations/0003_order_cancellation.sql`); gli ordini salvati su file usano `data/orders.json`.
- **Importazione anagrafica**: script `scripts/import-anagrafica.mjs` che legge `anagrafica_clienti.xlsx` e carica i clienti nel database lato server. Il file Excel **non viene servito** dalla cartella `public` e non va versionato.

## Come usare l'amministratore

1. Avvia l'app e apri `/login`.
2. Al primo accesso comparirà il pannello **"Configurazione amministratore"**: crea la password.
3. Verrai portato in **Impostazioni** (`/impostazioni`): inserisci le API key richieste.
4. Le chiavi salvate vengono cifrate e usate dall'app (le variabili d'ambiente, se presenti, hanno priorità).

I dati dell'amministratore e le chiavi cifrate vivono nella cartella `data/` (in `.gitignore`, mai versionata). Per la produzione impostare `SETTINGS_ENCRYPTION_KEY` come variabile d'ambiente (64 caratteri hex).

## Setup

1. Crea un progetto [Supabase](https://supabase.com) e copia URL e chiavi.
2. Copia `.env.example` in `.env.local` e compila le variabili:

   ```env
   NEXT_PUBLIC_SUPABASE_URL=https://tuo-progetto.supabase.co
   NEXT_PUBLIC_SUPABASE_ANON_KEY=...
   SUPABASE_SERVICE_ROLE_KEY=...
   ```

3. Esegui `supabase/migrations/0001_initial_schema.sql` e poi
   `supabase/migrations/0002_order_snapshot_columns.sql` nella SQL Editor di
   Supabase (Database → SQL Editor).
   - Il trigger `handle_new_user` crea automaticamente la riga in `agents` a ogni registrazione.
   - `0002` aggiunge a `orders` le colonne `partita_iva` e `codice_fiscale`
     (snapshot al momento dell'ordine: le modifiche anagrafiche successive non
     toccano gli ordini già emessi).
4. (Facoltativo) Importa l'anagrafica Excel in `data/anagrafica_clienti.xlsx`:

   ```bash
   npm run import:anagrafica -- --dry-run
   npm run import:anagrafica
   ```

   Lo script legge la connessione dal file locale `db.txt` (nella root o in `data/`), nel formato:
   ```
   postgresql://postgres.xxxx:[PASSWORD]@aws-0-....pooler.supabase.com:5432/postgres
   password database
   <password>
   ```
   La stringa con `pooler.supabase.com` è quella di **Settings → Database → Connection string → Session pooler**. Dopo l'importazione il file `db.txt` va eliminato (è già in `.gitignore`). In alternativa, su ambienti serverless si può usare `SUPABASE_SERVICE_ROLE_KEY` via REST.

5. Avvia l'app:

   ```bash
   npm install
   npm run dev
   ```

   Apri http://localhost:3000. Crea la password amministratore, registra un agente (dopo aver confermato l'email, se abilitata) e accedi.

## Flusso dati previsto

1. L'agente si autentica (Supabase Auth).
2. La ricerca cliente usa il database condiviso, importato dal vecchio file Excel (11.813 clienti importati).
3. Il browser invia dati strutturati; prezzi, sconti, IVA, trasporto e validazioni saranno ricalcolati/verificati **sul server** (passo successivo).
4. Una route server valida l'ordine, compila il modello Excel (`xlsx-populate`), lo salva nello storage e lo invia all'email aziendale fissa (`ORDER_EMAIL_TO`).
5. L'ordine e gli articoli restano disponibili nella dashboard dell'agente.

## Sicurezza

- `anagrafica_clienti.xlsx` contiene dati personali: **mai** nella cartella `public`, mai versionato (vive in `data/`).
- `db.txt` (password del database) è locale e in `.gitignore`; va eliminato dopo l'uso.
- Il destinatario email è definito solo lato server (`ORDER_EMAIL_TO`), non modificabile dal browser.
- RLS attiva su tutte le tabelle.


## Verifica

```bash
npm run lint
npm run build
npm audit --omit=dev
```

