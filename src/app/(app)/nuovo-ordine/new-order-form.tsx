"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
} from "react";
import {
  saveCustomerAnagraficaAction,
  searchCustomersAction,
  submitOrder,
  type CustomerSearchResult,
  type SaveAnagraficaResult,
  type SubmitOrderResult,
} from "./actions";
import type { OrderGroup, OrderVariant } from "@/lib/catalog/order-catalog";
import {
  GIFT_MAX_QTY,
  isKit,
  isMix,
  isMultipleOf4,
  isValidGiftQty,
  isValidGiftTotal,
} from "@/lib/catalog/gift-rules";
import { calcTrasporto, calcIvaTrasporto } from "@/lib/shipping";
import type { ShippingSettings } from "@/lib/shipping";
import { formatEur } from "@/lib/format";

// Metodi di pagamento (stesso ordine del modulo cartaceo).
const PAYMENT_OPTIONS = [
  "CONTRASSEGNO",
  "CONTRASSEGNO 30 gg",
  "CONTRASSEGNO 60 gg",
  "CONTRASSEGNO 90 gg",
  "BONIFICO ANTICIPATO",
] as const;

export function NewOrderForm({
  groups,
  giftArticles,
  shippingSettings,
}: {
  groups: OrderGroup[];
  giftArticles: OrderVariant[];
  shippingSettings: ShippingSettings;
}) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<CustomerSearchResult[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState<CustomerSearchResult | null>(null);
  const [, startTransition] = useTransition();
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const resultsRef = useRef<HTMLUListElement | null>(null);
  // Indica se l'utente ha gia' selezionato un cliente: evita che una
  // ricerca ancora in corso riapra il dropdown dopo la selezione.
  const selectedRef = useRef(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  // Dropdown omaggi: quali righe hanno il menu aperto (stile catalogo).
  const [giftOpen, setGiftOpen] = useState<Record<number, boolean>>({});
  // Ref ai <details> degli omaggi per forzare la chiusura dopo la scelta
  // (React non sempre rimuove l'attributo "open" sui details controllati).
  const giftPickerRefs = useRef<Record<number, HTMLDetailsElement | null>>({});

  // Campi ordine (la citta' NON viene valorizzata dal cliente: e' la citta' di consegna)
  const [fields, setFields] = useState({
    ragione_sociale: "",
    indirizzo: "",
    cap: "",
    citta: "",
    provincia: "",
    partita_iva: "",
    codice_fiscale: "",
    sdi: "",
    cellulare: "",
    email: "",
    pagamento: PAYMENT_OPTIONS[0],
    note: "",
  });
  const [dataOrdine, setDataOrdine] = useState(
    () => new Date().toISOString().slice(0, 10)
  );

  // ----- CARRELLO ARTICOLI -----
  const [quantities, setQuantities] = useState<Record<number, number>>({});
  // ----- RICERCA ARTICOLI CATALOGO -----
  const [catalogQuery, setCatalogQuery] = useState("");
  // ----- OMAGGIO (piu' righe, totale massimo GIFT_MAX_QTY) -----
  const [giftLines, setGiftLines] = useState<{ row: number; qty: number }[]>([]);

  // ----- INVIO -----
  const [orderResult, setOrderResult] = useState<SubmitOrderResult | null>(null);
  const [sending, setSending] = useState(false);
  // ----- SALVATAGGIO ANANAGRAFICA CLIENTE -----
  const [savingAnagrafica, setSavingAnagrafica] = useState(false);
  const [anagraficaMsg, setAnagraficaMsg] = useState<{
    type: "ok" | "err";
    text: string;
  } | null>(null);

  function canSubmit(): boolean {
    const hasItems = selectedLines.length > 0;
    const hasGifts = giftLines.length > 0 && giftLinesValid && giftTotalValid;
    const step4Ok = selectedLines.every(
      (line) => !line.step4 || isMultipleOf4(line.qty)
    );
    const identityOk =
      fields.partita_iva.trim().length > 0 || fields.codice_fiscale.trim().length > 0;
    const addressOk =
      fields.indirizzo.trim().length > 0 &&
      fields.cap.trim().length > 0 &&
      fields.citta.trim().length > 0 &&
      fields.provincia.trim().length > 0;
    return (
      fields.ragione_sociale.trim().length > 0 &&
      identityOk &&
      addressOk &&
      (hasItems || hasGifts) &&
      step4Ok &&
      !sending
    );
  }

  /** Elenca i motivi che impediscono l'invio (per un messaggio chiaro). */
  function buildValidationReasons(): string[] {
    const reasons: string[] = [];
    if (fields.ragione_sociale.trim().length === 0) {
      reasons.push("la ragione sociale");
    }
    const identityOk =
      fields.partita_iva.trim().length > 0 || fields.codice_fiscale.trim().length > 0;
    if (!identityOk) {
      reasons.push("la P.IVA o il codice fiscale");
    }
    const addressOk =
      fields.indirizzo.trim().length > 0 &&
      fields.cap.trim().length > 0 &&
      fields.citta.trim().length > 0 &&
      fields.provincia.trim().length > 0;
    if (!addressOk) {
      reasons.push("indirizzo, CAP, città e provincia del cliente");
    }
    const hasItems = selectedLines.length > 0;
    const hasGifts = giftLines.length > 0 && giftLinesValid && giftTotalValid;
    if (!hasItems && !hasGifts) {
      reasons.push("almeno un articolo dal catalogo");
    }
    const bad = selectedLines.filter((l) => l.step4 && !isMultipleOf4(l.qty));
    if (bad.length > 0) {
      const names = bad
        .slice(0, 2)
        .map((l) => `"${l.desc}"`)
        .join(", ");
      const extra = bad.length > 2 ? ` e altri ${bad.length - 2}` : "";
      reasons.push(
        `quantità multipla di 4 per ${names}${extra} (usare 4, 8, 12…)`
      );
    }
    return reasons;
  }

  function missingHint(): string {
    const reasons = buildValidationReasons();
    if (reasons.length === 0) {
      return "Attendi il termine dell'invio in corso.";
    }
    return `Per inviare serve: ${reasons.join("; ")}.`;
  }

  function handleSubmit() {
    if (!canSubmit()) return;
    setSending(true);
    setOrderResult(null);
    startTransition(async () => {
      try {
        const res = await submitOrder({
          cliente: {
            ragione_sociale: fields.ragione_sociale,
            indirizzo: fields.indirizzo,
            cap: fields.cap,
            citta: fields.citta,
            provincia: fields.provincia,
            partita_iva: fields.partita_iva,
            codice_fiscale: fields.codice_fiscale,
            sdi: fields.sdi,
            cellulare: fields.cellulare,
            email: fields.email,
          },
          data_ordine: dataOrdine,
          pagamento: fields.pagamento,
          note: fields.note,
          items: Object.entries(quantities)
            .filter(([, qty]) => (qty ?? 0) > 0)
            .map(([row, qty]) => ({ row: Number(row), qty })),
          gift: giftLines
            .filter((l) => l.row > 0 && isValidGiftQty(l.qty))
            .map((l) => ({ row: l.row, qty: l.qty })),
        });
        setOrderResult(res);
      } catch (err) {
        // Imprevisti lato rete/server: non lasciare mai l'invio "appeso".
        setOrderResult({
          error:
            "Errore imprevisto durante l'invio: " +
            (err instanceof Error ? err.message : String(err)),
        });
      } finally {
        setSending(false);
      }
    });
  }

  async function handleSaveAnagrafica() {
    if (!selected) return;
    setSavingAnagrafica(true);
    setAnagraficaMsg(null);
    try {
      const payload: CustomerSearchResult = {
        id: selected.id,
        ragione_sociale: fields.ragione_sociale.trim(),
        indirizzo: fields.indirizzo.trim() || null,
        cap: fields.cap.trim() || null,
        citta: fields.citta.trim() || null,
        provincia: fields.provincia.trim() || null,
        partita_iva: fields.partita_iva.trim() || null,
        codice_fiscale: fields.codice_fiscale.trim() || null,
        sdi: fields.sdi.trim() || null,
        cellulare: fields.cellulare.trim() || null,
        email: fields.email.trim() || null,
      };
      const res: SaveAnagraficaResult = await saveCustomerAnagraficaAction(
        payload
      );
      if (res.error) {
        setAnagraficaMsg({ type: "err", text: res.error });
      } else {
        setAnagraficaMsg({
          type: "ok",
          text:
            "Anagrafica del cliente salvata. Al prossimo ordine la ricerca mostrerà i dati aggiornati.",
        });
      }
    } catch (err) {
      setAnagraficaMsg({
        type: "err",
        text:
          "Errore durante il salvataggio: " +
          (err instanceof Error ? err.message : String(err)),
      });
    } finally {
      setSavingAnagrafica(false);
    }
  }

  function setQty(row: number, value: number) {
    setQuantities((prev) => {
      const next = { ...prev };
      if (value > 0) next[row] = Math.min(value, 999);
      else delete next[row];
      return next;
    });
  }

  function setQtyFromInput(row: number, raw: string) {
    const value = Math.max(0, Math.min(999, Math.floor(Number(raw) || 0)));
    setQty(row, value);
  }

  // ----- HELPERS OMAGGIO -----
  function addGiftLine() {
    setGiftLines((prev) => {
      const total = prev.reduce((s, l) => s + (l.qty || 0), 0);
      if (total >= GIFT_MAX_QTY) return prev;
      return [...prev, { row: 0, qty: 1 }];
    });
  }
  function updateGiftLine(
    index: number,
    patch: { row?: number; qty?: number }
  ) {
    setGiftLines((prev) =>
      prev.map((l, i) => (i === index ? { ...l, ...patch } : l))
    );
  }
  function removeGiftLine(index: number) {
    setGiftLines((prev) => prev.filter((_, i) => i !== index));
  }

  // Articoli omaggio raggruppati per ARTICOLO (stessa logica del catalogo):
  // le diverse DIOTTRIE dello stesso articolo vengono raccolte nel menu a
  // tendina dell'articolo. Copre sia gli occhiali (diottria in fondo al nome:
  // "... +1,00") sia le ricariche ammesse (diottria prima del "4pz":
  // "... Ricarica 501 +1,00 4pz" -> articolo "Ricarica 501").
  const giftGroups = useMemo(() => {
    const map = new Map<string, OrderVariant[]>();
    const order: string[] = [];
    for (const g of giftArticles) {
      let base = g.descrizione.replace(/\s+\+[\d,]+$/, "").trim();
      if (g.descrizione.includes("Ricarica")) {
        const match = g.descrizione.match(/Ricarica\s+(\d+)/);
        if (match) base = `Ricarica ${match[1]}`;
      }
      if (!map.has(base)) {
        map.set(base, []);
        order.push(base);
      }
      map.get(base)!.push(g);
    }
    return order.map((name) => ({ name, variants: map.get(name)! }));
  }, [giftArticles]);

  // Numero di righe nel carrello (per il riepilogo)
  const cartCount = useMemo(() => {
    let count = 0;
    for (const group of groups) {
      for (const v of group.variants) {
        if ((quantities[v.row] ?? 0) > 0) count += 1;
      }
    }
    return count;
  }, [groups, quantities]);

  // ----- CALCOLO TOTALI (stesse regole lato client per anteprima;
  // il server ricalcolera' tutto al momento dell'invio) -----
  const totals = useMemo(() => {
    let imponibile = 0;
    let iva = 0;
    for (const group of groups) {
      for (const v of group.variants) {
        const qty = quantities[v.row] ?? 0;
        if (qty > 0) {
          imponibile += v.netto * qty;
          iva += v.netto * qty * (v.iva / 100);
        }
      }
    }
    const trasporto = calcTrasporto(imponibile, shippingSettings);
    const ivaTrasporto = calcIvaTrasporto(imponibile, shippingSettings);
    return {
      imponibile,
      iva,
      trasporto,
      ivaTrasporto,
      totale: imponibile + iva + trasporto + ivaTrasporto,
    };
  }, [groups, quantities, shippingSettings]);

  const giftTotal = giftLines.reduce((sum, l) => sum + (l.qty || 0), 0);
  const giftTotalValid = isValidGiftTotal(giftTotal);
  const giftLinesValid = giftLines.every((l) => l.row === 0 || isValidGiftQty(l.qty));

  // ----- FILTRO ARTICOLI DEL CATALOGO (per codice o descrizione) -----
  const catalogQ = catalogQuery.trim().toLowerCase();
  const filteredGroups = useMemo(() => {
    if (!catalogQ) return groups;
    return groups
      .map((g) => ({
        ...g,
        variants: g.variants.filter(
          (v) =>
            v.codice.toLowerCase().includes(catalogQ) ||
            v.descrizione.toLowerCase().includes(catalogQ)
        ),
      }))
      .filter((g) => g.variants.length > 0);
  }, [groups, catalogQ]);

  // Righe selezionate per il riepilogo
  const selectedLines: {
    desc: string;
    qty: number;
    netto: number;
    sub: number;
    step4: boolean;
  }[] = [];
  for (const group of groups) {
    for (const v of group.variants) {
      const qty = quantities[v.row] ?? 0;
      if (qty > 0) {
        selectedLines.push({
          desc: v.descrizione,
          qty,
          netto: v.netto,
          sub: v.netto * qty,
          step4: v.step4,
        });
      }
    }
  }

  // Esegue la ricerca immediatamente (usata dal pulsante "Cerca" e dal debounce).
  const runSearch = useCallback((rawQuery: string) => {
    const q = rawQuery.trim();
    if (q.length < 2) {
      setResults([]);
      setLoading(false);
      setOpen(false);
      setActiveIndex(-1);
      return;
    }
    setLoading(true);
    startTransition(async () => {
      try {
        const res = await searchCustomersAction(q);
        // Se nel frattempo l'utente ha gia' selezionato un cliente, non
        // riaprire il dropdown e non sovrascrivere la selezione.
        if (selectedRef.current) return;
        setResults(res);
        setLoading(false);
        setOpen(true);
        setActiveIndex(res.length > 0 ? 0 : -1);
        // Su smartphone la tastiera virtuale puo' coprire i risultati:
        // porta il dropdown in vista (se serve).
        requestAnimationFrame(() => {
          resultsRef.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
        });
      } catch {
        // Errore di rete/azione: mostra lo stato vuoto invece di restare
        // bloccato con lo spinner.
        setResults([]);
        setLoading(false);
        setOpen(true);
        setActiveIndex(-1);
      }
    });
  }, []);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    const q = query.trim();
    if (q.length < 2) return;
    debounceRef.current = setTimeout(() => runSearch(q), 300);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query, runSearch]);

  function selectCustomer(customer: CustomerSearchResult) {
    selectedRef.current = true;
    setSelected(customer);
    setFields({
      ragione_sociale: customer.ragione_sociale,
      indirizzo: customer.indirizzo ?? "",
      cap: customer.cap ?? "",
      // Citta' dell'anagrafica del cliente (modificabile come citta' di consegna).
      citta: customer.citta ?? "",
      provincia: customer.provincia ?? "",
      partita_iva: customer.partita_iva ?? "",
      codice_fiscale: customer.codice_fiscale ?? "",
      sdi: customer.sdi ?? "",
      cellulare: customer.cellulare ?? "",
      email: customer.email ?? "",
      pagamento: PAYMENT_OPTIONS[0],
      note: "",
    });
    setOpen(false);
    setResults([]);
    setActiveIndex(-1);
  }

  function setField(name: keyof typeof fields, value: string) {
    setFields((prev) => ({ ...prev, [name]: value }));
  }

  return (
    <>
      <section className="content-panel">
        <div className="panel-heading">
          <div>
            <p className="eyebrow">Passo 1 — Cliente</p>
            <h2>Cerca il cliente</h2>
            <p className="settings-help">
              Cerca per codice fiscale, partita IVA oppure ragione sociale.
              A fianco del nome viene mostrata la città per distinguere i clienti
              con nomi simili.
            </p>
          </div>
        </div>

        <div className="customer-search">
          <div className="search-row">
            <label className="search-field">
              <span aria-hidden="true">/</span>
              <input
                type="search"
                value={query}
                onChange={(e) => {
                  const value = e.target.value;
                  setQuery(value);
                  setSelected(null);
                  selectedRef.current = false;
                  if (value.trim().length < 2) {
                    setResults([]);
                    setLoading(false);
                    setOpen(false);
                    setActiveIndex(-1);
                  }
                }}
                onKeyDown={(e) => {
                  if (e.key === "ArrowDown") {
                    e.preventDefault();
                    setActiveIndex((i) => Math.min(i + 1, results.length - 1));
                  } else if (e.key === "ArrowUp") {
                    e.preventDefault();
                    setActiveIndex((i) => Math.max(i - 1, 0));
                  } else if (e.key === "Enter" && activeIndex >= 0 && results[activeIndex]) {
                    e.preventDefault();
                    selectCustomer(results[activeIndex]);
                  } else if (e.key === "Enter") {
                    e.preventDefault();
                    runSearch(query);
                  } else if (e.key === "Escape") {
                    setOpen(false);
                  }
                }}
                placeholder="Codice fiscale, P.IVA o ragione sociale…"
              />
              {loading && <span className="search-spinner" aria-hidden="true" />}
            </label>
            <button
              type="button"
              className="primary-button"
              onClick={() => {
                if (debounceRef.current) clearTimeout(debounceRef.current);
                // Su smartphone chiudi la tastiera virtuale cosi' i risultati
                // non restano nascosti sotto la tastiera.
                if (document.activeElement instanceof HTMLElement) {
                  document.activeElement.blur();
                }
                runSearch(query);
              }}
              disabled={loading}
            >
              {loading ? "Ricerca…" : "Cerca"}
            </button>
          </div>

          {open && results.length > 0 && (
            <ul
              ref={resultsRef}
              className="search-results"
              role="listbox"
              aria-label="Risultati clienti"
            >
              {results.map((customer, index) => (
                <li key={customer.id}>
                  <button
                    type="button"
                    className={`search-result${index === activeIndex ? " is-active" : ""}`}
                    onMouseDown={(e) => {
                      // preventDefault evita il blur dell'input e la corsa
                      // focus/touch che su desktop e telefono "mangia" il click.
                      e.preventDefault();
                      selectCustomer(customer);
                    }}
                  >
                    <span className="search-result-main">
                      <strong>{customer.ragione_sociale}</strong>
                      <span className="search-result-city">
                        {customer.citta ?? "—"}
                        {customer.provincia ? ` (${customer.provincia})` : ""}
                      </span>
                    </span>
                    <span className="search-result-ids">
                      {customer.partita_iva && <small>P.IVA {customer.partita_iva}</small>}
                      {customer.codice_fiscale && <small>CF {customer.codice_fiscale}</small>}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
          {open && results.length === 0 && !loading && (
            <p className="search-empty">
              Nessun cliente trovato. Puoi compilare i dati a mano qui sotto:
              verrà inserito nell&apos;anagrafica al salvataggio.
            </p>
          )}
        </div>

        {selected && (
          <p className="form-note" role="status">
            Cliente selezionato: <strong>{selected.ragione_sociale}</strong>. La
            città è stata inserita dall&apos;anagrafica (puoi modificarla come
            città di consegna).
          </p>
        )}
      </section>

      <section className="content-panel">
        <div className="panel-heading">
          <div>
            <p className="eyebrow">Passo 2 — Dati ordine</p>
            <h2>Intestazione ordine</h2>
            <p className="settings-help">
              I campi si compilano dal cliente selezionato. La{" "}
              <strong>Città</strong> è la città di <em>consegna</em>: non viene
              precompilata (struttura del file Excel).
            </p>
          </div>
        </div>

        <div className="form-grid">
          <label className="form-field span-2">
            <span className="form-label">Ragione sociale cliente *</span>
            <input
              className="form-input"
              value={fields.ragione_sociale}
              onChange={(e) => setField("ragione_sociale", e.target.value)}
            />
          </label>

          <label className="form-field span-2">
            <span className="form-label">Indirizzo di consegna</span>
            <input
              className="form-input"
              value={fields.indirizzo}
              onChange={(e) => setField("indirizzo", e.target.value)}
            />
          </label>

          <label className="form-field">
            <span className="form-label">CAP</span>
            <input
              className="form-input"
              value={fields.cap}
              onChange={(e) => setField("cap", e.target.value)}
            />
          </label>

          <label className="form-field">
            <span className="form-label">Città di consegna *</span>
            <input
              className="form-input"
              value={fields.citta}
              onChange={(e) => setField("citta", e.target.value)}
              placeholder="Scrivi la città di consegna"
            />
          </label>

          <label className="form-field">
            <span className="form-label">Provincia</span>
            <input
              className="form-input"
              value={fields.provincia}
              onChange={(e) => setField("provincia", e.target.value)}
              maxLength={2}
            />
          </label>

          <label className="form-field">
            <span className="form-label">Data ordine</span>
            <input
              className="form-input"
              type="date"
              value={dataOrdine}
              onChange={(e) => setDataOrdine(e.target.value)}
            />
          </label>

          <label className="form-field">
            <span className="form-label">P.IVA</span>
            <input
              className="form-input"
              value={fields.partita_iva}
              onChange={(e) => setField("partita_iva", e.target.value)}
            />
          </label>

          <label className="form-field">
            <span className="form-label">Codice fiscale</span>
            <input
              className="form-input"
              value={fields.codice_fiscale}
              onChange={(e) => setField("codice_fiscale", e.target.value)}
            />
          </label>

          <label className="form-field">
            <span className="form-label">SDI</span>
            <input
              className="form-input"
              value={fields.sdi}
              onChange={(e) => setField("sdi", e.target.value)}
            />
          </label>

          <label className="form-field">
            <span className="form-label">Cellulare</span>
            <input
              className="form-input"
              value={fields.cellulare}
              onChange={(e) => setField("cellulare", e.target.value)}
            />
          </label>

          <label className="form-field span-2">
            <span className="form-label">Email</span>
            <input
              className="form-input"
              type="email"
              value={fields.email}
              onChange={(e) => setField("email", e.target.value)}
            />
          </label>

          <label className="form-field">
            <span className="form-label">Pagamento</span>
            <select
              className="form-input"
              value={fields.pagamento}
              onChange={(e) => setField("pagamento", e.target.value)}
            >
              <option>{PAYMENT_OPTIONS[0]}</option>
              <option>{PAYMENT_OPTIONS[1]}</option>
              <option>{PAYMENT_OPTIONS[2]}</option>
              <option>{PAYMENT_OPTIONS[3]}</option>
              <option>{PAYMENT_OPTIONS[4]}</option>
            </select>
          </label>

          <label className="form-field span-3">
            <span className="form-label">Note</span>
            <input
              className="form-input"
              value={fields.note}
              onChange={(e) => setField("note", e.target.value)}
            />
          </label>
        </div>

        {selected && (
          <div className="anagrafica-save">
            <button
              type="button"
              className="primary-button"
              onClick={() => void handleSaveAnagrafica()}
              disabled={savingAnagrafica || sending}
            >
              {savingAnagrafica
                ? "Salvataggio in corso…"
                : "Salva anagrafica aggiornata"}
            </button>
            <p className="settings-help">
              Se hai compilato dati mancanti (telefono, email, indirizzo…), il
              pulsante aggiorna la scheda del cliente: alle prossime ricerche
              compariranno i dati corretti.
            </p>
          </div>
        )}

        {anagraficaMsg && (
          <p
            className={anagraficaMsg.type === "ok" ? "form-note" : "form-error"}
            role="status"
          >
            {anagraficaMsg.text}
          </p>
        )}
      </section>

      <section className="content-panel">
        <div className="panel-heading">
          <div>
            <p className="eyebrow">Passo 3 — Articoli</p>
            <h2>Scegli gli articoli dal catalogo</h2>
            <p className="settings-help">
              Cerca per <strong>codice</strong> o <strong>descrizione</strong>{" "}
              (es. 501, 103, Astuccio…). Gli articoli con l&apos;avviso{" "}
              <strong>&quot;multipli di 4&quot;</strong> richiedono quantità
              multiple di 4 (decide l&apos;amministratore): se digiti una
              quantità non multipla il campo diventa <strong>rosso</strong>. I
              prodotti <strong>KIT</strong> e <strong>MIX</strong> hanno lo
              sfondo e i pulsanti <strong>verdi</strong>.
            </p>
          </div>
          <span className="count-badge">
            {cartCount === 0 ? "vuoto" : `${cartCount} righe`}
          </span>
        </div>

        <div className="catalog-search">
          <label className="search-field">
            <span aria-hidden="true">🔍</span>
            <input
              type="search"
              value={catalogQuery}
              onChange={(e) => setCatalogQuery(e.target.value)}
              placeholder="Cerca articolo per codice o descrizione…"
            />
            {catalogQuery && (
              <button
                type="button"
                className="search-clear"
                onClick={() => setCatalogQuery("")}
                aria-label="Azzera ricerca"
              >
                ×
              </button>
            )}
          </label>
        </div>

        {filteredGroups.length === 0 ? (
          <p className="empty-state">
            Nessun articolo trovato per &quot;{catalogQuery}&quot;.
          </p>
        ) : (
          <div className="catalog-groups">
          {filteredGroups.map((group) => {
            const groupQty = group.variants.reduce(
              (sum, v) => sum + (quantities[v.row] ?? 0),
              0
            );
            return (
              <details key={group.name} className="catalog-group">
                <summary
                  className={`catalog-group-head${
                    group.variants.some(
                      (v) => isKit(v.descrizione) || isMix(v.descrizione)
                    )
                      ? " is-green"
                      : ""
                  }`}
                >
                  <span>
                    {group.name}
                    {groupQty > 0 && (
                      <span className="catalog-group-qty">{groupQty} pz</span>
                    )}
                  </span>
                  <span className="catalog-group-caret" aria-hidden="true">
                    ▾
                  </span>
                </summary>
                <div className="catalog-variants">
                  {group.variants.map((v) => {
                    const qty = quantities[v.row] ?? 0;
                    const step4 = v.step4;
                    const kit = isKit(v.descrizione);
                    const mix = isMix(v.descrizione);
                    // Pulsanti verdi per gli articoli KIT e MIX.
                    const greenCta = kit || mix;
                    const invalidQty = step4 && qty > 0 && !isMultipleOf4(qty);
                    const classes = [
                      "catalog-item",
                      qty > 0 ? "is-active" : "",
                      kit ? "is-kit" : "",
                      invalidQty ? "has-invalid-qty" : "",
                    ]
                      .filter(Boolean)
                      .join(" ");
                    return (
                      <div key={v.row} className={classes}>
                        <div className="catalog-item-info">
                          <span className="catalog-item-name">
                            {v.descrizione}
                            {greenCta && (
                              <span className="catalog-kit-badge">
                                {mix ? "MIX" : "KIT"}
                              </span>
                            )}
                          </span>
                          <span className="catalog-item-meta">
                            {v.diottria ? `${v.diottria} · ` : ""}prezzo{" "}
                            {formatEur(v.prezzo)}
                            {v.sconto > 0 && (
                              <>
                                {" "}
                                · sconto {(v.sconto * 100).toFixed(0)}% →{" "}
                                <strong>{formatEur(v.netto)}</strong>
                              </>
                            )}
                            {step4 && (
                              <span className="catalog-step-note">
                                · multipli di 4
                              </span>
                            )}
                          </span>
                        </div>
                        <div className="qty-control">
                          <button
                            type="button"
                            className={`qty-btn qty-minus${greenCta ? " is-green" : ""}`}
                            onClick={() => setQty(v.row, qty - (step4 ? 4 : 1))}
                            disabled={qty === 0}
                            aria-label={`Riduci quantità ${v.descrizione}`}
                          >
                            −
                          </button>
                          <input
                            type="number"
                            min={0}
                            max={999}
                            value={qty}
                            onChange={(e) =>
                              setQtyFromInput(v.row, e.target.value)
                            }
                            className={`qty-input${invalidQty ? " is-invalid" : ""}`}
                            aria-label={`Quantità ${v.descrizione}`}
                          />
                          <button
                            type="button"
                            className={`qty-btn qty-plus${greenCta ? " is-green" : ""}`}
                            onClick={() => setQty(v.row, qty + (step4 ? 4 : 1))}
                            aria-label={`Aumenta quantità ${v.descrizione}`}
                          >
                            +
                          </button>
                        </div>
                        {qty > 0 && (
                          <div className="catalog-item-total">
                            {formatEur(v.netto * qty)}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </details>
            );
          })}
          </div>
        )}
      </section>

      <section className="content-panel">
        <div className="panel-heading">
          <div>
            <p className="eyebrow">Passo 4 — Omaggio</p>
            <h2>Articoli in omaggio</h2>
            <p className="settings-help">
              Solo articoli presenti nel catalogo: occhiali singoli e ricariche
              (confezioni 4pz). Sono esclusi kit, espositori (precaricati e
              non), astucci e le altre ricariche. Puoi aggiungere più articoli
              con diottrie diverse, per un totale massimo di {GIFT_MAX_QTY}{" "}
              pezzi.
            </p>
          </div>
          <span className="count-badge">
            {giftTotal} / {GIFT_MAX_QTY} pezzi
          </span>
        </div>

        {giftLines.length === 0 ? (
          <p className="empty-state">
            Nessun omaggio selezionato. Usa &quot;Aggiungi omaggio&quot; qui
            sotto.
          </p>
        ) : (
          <div className="gift-lines">
            {giftLines.map((line, index) => {
              const variant =
                giftArticles.find((g) => g.row === line.row) ?? null;
              // Nome del modello scelto (senza la diottria): es. "De Tomaso 100-1 Blu-Giallo".
              const selectedGroup =
                giftGroups.find((grp) =>
                  grp.variants.some((g) => g.row === line.row)
                ) ?? null;
              // Ogni articolo con la diottria selezionata vale SEMPRE 1 pezzo:
              // l'eventuale errore quantità non esiste più (nessun input Qtà).
              return (
                <div key={index} className="gift-line">
                  <div className="form-field gift-select">
                    <span className="form-label">Articolo</span>
                    <details
                      className={`gift-picker${variant ? " is-selected" : ""}`}
                      open={giftOpen[index] ?? false}
                      ref={(el) => {
                        giftPickerRefs.current[index] = el;
                      }}
                      onToggle={(e) =>
                        setGiftOpen((prev) => ({
                          ...prev,
                          [index]: (e.target as HTMLDetailsElement).open,
                        }))
                      }
                    >
                      <summary className="catalog-group-head is-green">
                        <span>
                          {variant && selectedGroup
                            ? selectedGroup.name
                            : "— Scegli articolo —"}
                        </span>
                        <span className="catalog-group-caret" aria-hidden="true">
                          ▾
                        </span>
                      </summary>
                      <div className="catalog-variants gift-picker-list">
                        {giftGroups.map((grp) => {
                          const modelSelected =
                            line.row > 0 &&
                            grp.variants.some((g) => g.row === line.row);
                          return (
                            <details
                              key={grp.name}
                              className={`gift-model${
                                modelSelected ? " is-selected" : ""
                              }`}
                            >
                              <summary className="gift-model-head">
                                <span>{grp.name}</span>
                                <span
                                  className="catalog-group-caret"
                                  aria-hidden="true"
                                >
                                  ▾
                                </span>
                              </summary>
                              <div className="gift-model-variants">
                                {grp.variants.map((g) => (
                                  <button
                                    type="button"
                                    key={g.row}
                                    className={`gift-picker-item${
                                      line.row === g.row ? " is-active" : ""
                                    }`}
                                    onClick={() => {
                                      updateGiftLine(index, { row: g.row });
                                      setGiftOpen((prev) => ({
                                        ...prev,
                                        [index]: false,
                                      }));
                                      // Chiude subito il menu (nome articolo in alto).
                                      const el =
                                        giftPickerRefs.current[index];
                                      if (el && el.open) el.open = false;
                                    }}
                                  >
                                    <span className="catalog-item-name">
                                      {g.diottria || "1 pezzo"}
                                    </span>
                                    <span className="catalog-item-meta">
                                      <strong>{formatEur(g.netto)}</strong>
                                    </span>
                                  </button>
                                ))}
                              </div>
                            </details>
                          );
                        })}
                      </div>
                    </details>
                  </div>

                  <div className="gift-line-row">
                    <span className="gift-qty-fixed" aria-label="Quantità">
                      Qtà · 1 pezzo
                    </span>

                    <button
                      type="button"
                      className="danger-button"
                      onClick={() => removeGiftLine(index)}
                    >
                      Rimuovi
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        <div className="form-actions">
          <button
            type="button"
            className="green-button"
            onClick={addGiftLine}
            disabled={giftTotal >= GIFT_MAX_QTY}
          >
            + Aggiungi omaggio
          </button>
        </div>

        {giftLines.length > 0 && !giftTotalValid && (
          <p className="form-error" role="alert">
            Totale omaggi non valido: massimo {GIFT_MAX_QTY} pezzi.
          </p>
        )}
        {giftLines.some((l) => !isValidGiftQty(l.qty)) && (
          <p className="form-error" role="alert">
            Controlla le quantità degli omaggi (tra 1 e {GIFT_MAX_QTY}).
          </p>
        )}
      </section>

      <section className="content-panel">
        <div className="panel-heading">
          <div>
            <p className="eyebrow">Passo 5 — Riepilogo</p>
            <h2>Totali ordine</h2>
            <p className="settings-help">
              Trasporto 2,9% sull&apos;imponibile (min €9,50, max €99,00) con
              IVA 22%. In questa fase l&apos;anteprima è calcolata nel
              browser; al salvataggio il server ricalcola tutto con gli stessi
              valori del catalogo.
            </p>
          </div>
        </div>

        {selectedLines.length === 0 && giftLines.filter((l) => l.row > 0).length === 0 ? (
          <p className="empty-state">
            Nessun articolo selezionato. Scegli almeno un articolo dal catalogo.
          </p>
        ) : (
          <div className="order-summary">
            {selectedLines.length > 0 && (
              <div className="summary-lines">
                {selectedLines.map((line, i) => (
                  <div key={i} className="summary-line">
                    <span>
                      {line.qty} × {line.desc}
                    </span>
                    <span>{formatEur(line.sub)}</span>
                  </div>
                ))}
              </div>
            )}

            {giftLines
              .filter((l) => l.row > 0)
              .map((line, i) => {
                const g = giftArticles.find((x) => x.row === line.row);
                if (!g) return null;
                return (
                  <div key={i} className="summary-line summary-gift">
                    <span>
                      🎁 {line.qty} × {g.descrizione}
                      {g.diottria ? ` (${g.diottria})` : ""}
                    </span>
                    <span>omaggio</span>
                  </div>
                );
              })}

            <div className="summary-totals">
              <div className="summary-line">
                <span>Imponibile</span>
                <span>{formatEur(totals.imponibile)}</span>
              </div>
              <div className="summary-line">
                <span>IVA</span>
                <span>{formatEur(totals.iva)}</span>
              </div>
              <div className="summary-line">
                <span>Trasporto</span>
                <span>{formatEur(totals.trasporto)}</span>
              </div>
              <div className="summary-line">
                <span>IVA su trasporto (22%)</span>
                <span>{formatEur(totals.ivaTrasporto)}</span>
              </div>
              <div className="summary-line summary-grand">
                <span>Totale</span>
                <span>{formatEur(totals.totale)}</span>
              </div>
            </div>
          </div>
        )}
      </section>

      <section className="content-panel">
        <div className="panel-heading">
          <div>
            <p className="eyebrow">Passo 6 — Invia ordine</p>
            <h2>Trasmissione ordine</h2>
            <p className="settings-help">
              Al salvataggio viene generato automaticamente il file Excel del
              modulo d&apos;ordine compilato (allegato all&apos;email per
              l&apos;ufficio) e il cliente viene aggiornato nell&apos;anagrafica.
            </p>
          </div>
        </div>

        {!canSubmit() && (
          <p className="form-error" role="alert">
            {missingHint()}
          </p>
        )}

        <div className="form-actions">
          <button
            className="primary-button"
            type="button"
            onClick={handleSubmit}
            disabled={!canSubmit()}
          >
            {sending
              ? "Invio in corso…"
              : `Invia ordine${totals.totale > 0 ? ` · ${formatEur(totals.totale)}` : ""}`}
          </button>
        </div>

        {orderResult?.error && (
          <p className="form-error" role="alert">
            {orderResult.error}
          </p>
        )}

        {orderResult?.success && (
          <div className="form-note" role="status">
            <p>
              ✅ Ordine <strong>{orderResult.numero_ordine}</strong> salvato e
              cliente aggiornato nell&apos;anagrafica.
            </p>
            <p>
              {orderResult.emailSent ? (
                <>📧 Email con il modulo Excel inviata all&apos;ufficio.</>
              ) : (
                <>
                  ⚠️ {orderResult.emailError ?? "Email non inviata."}{" "}
                  {orderResult.fileUrl && (
                    <>
                      Puoi comunque{" "}
                      <a href={orderResult.fileUrl} download>
                        scaricare il file Excel generato
                      </a>
                      .
                    </>
                  )}
                </>
              )}
            </p>
          </div>
        )}
      </section>
    </>
  );
}