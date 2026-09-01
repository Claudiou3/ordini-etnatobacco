# Deploy su Vercel — istruzioni complete

Questa guida spiega come rendere la piattaforma **perfettamente funzionante
online** su Vercel (il deploy collegato a GitHub `Claudiou3/ordini-etnatobacco`).

> **Perché questa guida esiste**: su Vercel il filesystem è in sola lettura e
> NON esiste la cartella `data/` (è esclusa da `.gitignore`). L'app è stata
> adattata per usare **Supabase** per tutte le configurazioni che prima
> vivevano su file: admin, provvigioni, spedizioni, sub-admin, catalogo e
> file Excel degli ordini.

---

## 1) Supabase — esegui la migrazione (UNA volta)

Nella dashboard Supabase → **SQL Editor** → esegui il contenuto di
`supabase/migrations/0005_app_settings_storage.sql`.

Crea:
- la tabella `app_settings` (solo service_role può leggere/scrivere);
- il bucket di Storage **`ordini`** (PRIVATO) per i file Excel degli ordini
  e il template di lavoro del catalogo.

> Se il bucket non viene creato dall'SQL (alcuni progetti richiedono il
> permesso `service_role`), crealo a mano: **Storage → New bucket**,
> nome `ordini`, **Public: NO**.

Verifica: **Storage → Buckets** deve comparire `ordini`.

---

## 2) Vercel — variabili d'ambiente (Environment Variables)

Progetto Vercel (collegato al repo `ordini-etnatobacco`) → **Settings →
Environment Variables** → aggiungi per Production/Preview/Development:

| Variabile | Valore |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | https://xxxx.supabase.co (Settings → API) |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | anon/publishable key |
| `SUPABASE_SERVICE_ROLE_KEY` | service_role/secret key |
| `ORDER_EMAIL_TO` | `ordinidetomaso@etnatobacco.com` |
| `EMAIL_ACCOUNT_PASSWORD` | password SMTP dell'account (Aruba) |
| `EMAIL_ACCOUNT` | `ordinidetomaso@etnatobacco.com` (facoltativo) |
| `EMAIL_SMTP_SERVER` | `smtps.aruba.it` (facoltativo, è il default) |
| `EMAIL_SMTP_PORT` | `465` (facoltativo) |
| `EMAIL_SMTP_SECURE` | `SSL/TLS` (facoltativo) |
| `EMAIL_FROM` | eventuale mittente per il fallback Resend |

**Importante**
- `SUPABASE_SERVICE_ROLE_KEY` è **segreta**: serve all'app per leggere/scrivere
  admin, provvigioni, spedizioni e i file ordine (viene usata solo lato server).
- `EMAIL_ACCOUNT_PASSWORD` è necessaria per l'invio email via SMTP.
- La chiave **Resend** salvata in precedenza è invalida: se non la sostituisci
  con una valida, **rimuovila** dalle Impostazioni (il canale SMTP è quello
  principale).

---

## 3) Primo accesso amministratore (online)

Dopo il deploy:
1. Apri l'URL di Vercel → `/login`.
2. Se `admin` non esiste ancora su Supabase comparirà **"Primo accesso /
   Configurazione amministratore"**: crea la password. **Ora funziona** perché
   l'account viene salvato su Supabase (non più su file).
3. Se invece lo hai già creato, accedi con la tua email e password.

> La sessione amministratore viene firmata con una chiave derivata dalla
> service role key: resta valida tra i riavvii di Vercel senza configurare
> nient'altro.

---

## 4) Dopo il primo accesso

- **Impostazioni → "Invia email di prova"**: verifica che l'email arrivi.
- **Agenti → provvigioni**: i valori (10%) si possono modificare e vengono
  salvati su Supabase.
- **Impostazioni → Spese di spedizione**: salvate su Supabase e sincronizzate
  nel template su Storage.
- **Catalogo → sconti/prezzi**: salvati nel template su Supabase Storage;
  gli ordini nuovi usano quel template.
- **Ordini**: i file Excel generati vengono caricati su Storage; il link
  "Scarica" della pagina ordini li scarica da lì.

### Cosa resta "solo locale"
- **Loghi personalizzati** e **API key dalle Impostazioni**: su Vercel usano le
  variabili d'ambiente (non il file). I loghi restano quelli di default online.
- Se usi l'app anche in locale, la cartella `data/` continua a funzionare come
  prima (la versione locale e quella online sono indipendenti).

---

## 5) Flusso di aggiornamento

1. Fai le modifiche (anche alle impostazioni online).
2. `git add . && git commit -m "..." && git push` dalla cartella
   `standalone-order-app` → Vercel ricompila e pubblica da solo.

> Non serve caricare la cartella `data/`: online tutti i dati vivono in
> Supabase.
