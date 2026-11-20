"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  getOrderEditDataAction,
  saveOrderEditAction,
  resendOrderEmailAction,
  type EditCatalogItem,
  type OrderEditData,
} from "./edit-actions";
import { calcTrasporto, calcIvaTrasporto, round2 } from "@/lib/shipping";
import { formatEur } from "@/lib/format";
import type { OrderAnagrafica } from "@/lib/orders/order-anagrafica";

type Line = {
  key: string;
  id?: string;
  row: number;
  descrizione: string;
  diottria: string;
  prezzo: number;
  iva: number;
  qty: string;
  pct: string;
  catPct: number | null;
  step4: boolean;
  orig?: { qty: number; pct: number; subtotale: number };
};

type GiftLine = {
  key: string;
  id?: string;
  row: number;
  descrizione: string;
  qty: string;
};

const ANAGRAFICA_FIELDS: { name: keyof OrderAnagrafica; label: string; span2?: boolean }[] = [
  { name: "ragione_sociale", label: "Ragione sociale *", span2: true },
  { name: "indirizzo", label: "Indirizzo", span2: true },
  { name: "cap", label: "CAP" },
  { name: "citta", label: "Città" },
  { name: "provincia", label: "Provincia" },
  { name: "partita_iva", label: "P.IVA" },
  { name: "codice_fiscale", label: "Codice fiscale" },
  { name: "sdi", label: "SDI" },
  { name: "cellulare", label: "Telefono / cellulare" },
  { name: "email", label: "Email", span2: true },
];

function num(value: string): number {
  const n = Number(String(value).replace(",", "."));
  return Number.isFinite(n) ? n : 0;
}

function matches(item: EditCatalogItem, query: string): boolean {
  const hay = `${item.descrizione} ${item.diottria}`.toLowerCase();
  return query
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .every((t) => hay.includes(t));
}

/**
 * «Modifica ordine» e «Reinvia email» (SOLO amministratore principale).
 * La modifica ricalcola i totali, aggiorna l'ordine e rigenera il modulo
 * Excel. Nessun invio email automatico: l'invio e' un pulsante manuale.
 */
export function OrderEditControl({
  orderId,
  numeroOrdine,
  isCancelled,
}: {
  orderId: string;
  numeroOrdine: string;
  isCancelled: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<OrderEditData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const [anagrafica, setAnagrafica] = useState<OrderAnagrafica | null>(null);
  const [pec, setPec] = useState("");
  const [cmnr, setCmnr] = useState("");
  const [note, setNote] = useState("");
  const [lines, setLines] = useState<Line[]>([]);
  const [gifts, setGifts] = useState<GiftLine[]>([]);
  const [search, setSearch] = useState("");
  const [giftSearch, setGiftSearch] = useState("");

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape" && !pending) setOpen(false);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, pending]);

  async function openEditor() {
    setOpen(true);
    setLoading(true);
    setError(null);
    setData(null);
    const res = await getOrderEditDataAction(orderId);
    setLoading(false);
    if ("error" in res) {
      setError(res.error);
      return;
    }
    const d = res.data;
    setData(d);
    setAnagrafica(d.anagrafica);
    setPec(d.pec);
    setCmnr(d.cmnr);
    setNote(d.note);
    setSearch("");
    setGiftSearch("");
    setLines(
      d.items.map((i) => ({
        key: i.id,
        id: i.id,
        row: i.row,
        descrizione: i.descrizione,
        diottria: i.diottria,
        prezzo: i.prezzo,
        iva: i.iva,
        qty: String(i.qty),
        pct: String(i.pct),
        catPct: i.catPct,
        step4: i.step4,
        orig: { qty: i.qty, pct: i.pct, subtotale: i.subtotale },
      }))
    );
    setGifts(
      d.gifts.map((g) => ({
        key: g.id,
        id: g.id,
        row: g.row,
        descrizione: g.descrizione,
        qty: String(g.qty),
      }))
    );
  }

  const totals = useMemo(() => {
    if (!data) return null;
    let imponibile = 0;
    let iva = 0;
    for (const l of lines) {
      const qty = Math.floor(num(l.qty));
      const pct = num(l.pct);
      const unchanged =
        l.orig && l.orig.qty === qty && Math.abs(l.orig.pct - round2(pct)) < 0.0051;
      const sub = unchanged
        ? l.orig!.subtotale
        : round2(l.prezzo * (1 - pct / 100) * qty);
      imponibile += sub;
      iva += round2(sub * (l.iva / 100));
    }
    imponibile = round2(imponibile);
    iva = round2(iva);
    const trasporto = round2(calcTrasporto(imponibile, data.shipping));
    const ivaTrasporto = round2(calcIvaTrasporto(imponibile, data.shipping));
    return {
      imponibile,
      iva,
      trasporto,
      ivaTrasporto,
      totale: round2(imponibile + iva + trasporto + ivaTrasporto),
    };
  }, [data, lines]);

  const found = useMemo(
    () =>
      data && search.trim().length >= 2
        ? data.catalog.filter((c) => matches(c, search)).slice(0, 12)
        : [],
    [data, search]
  );
  const foundGifts = useMemo(
    () =>
      data && giftSearch.trim().length >= 2
        ? data.giftCatalog.filter((c) => matches(c, giftSearch)).slice(0, 12)
        : [],
    [data, giftSearch]
  );

  function updateLine(key: string, patch: Partial<Line>) {
    setLines((prev) => prev.map((l) => (l.key === key ? { ...l, ...patch } : l)));
  }

  function addArticle(c: EditCatalogItem) {
    setLines((prev) => [
      ...prev,
      {
        key: `new-${Date.now()}-${c.row}`,
        row: c.row,
        descrizione: c.descrizione,
        diottria: c.diottria,
        prezzo: c.prezzo,
        iva: c.iva,
        qty: c.step4 ? "4" : "1",
        pct: String(c.pct),
        catPct: c.pct,
        step4: c.step4,
      },
    ]);
    setSearch("");
  }

  function addGift(c: EditCatalogItem) {
    setGifts((prev) => [
      ...prev,
      {
        key: `newg-${Date.now()}-${c.row}`,
        row: c.row,
        descrizione: c.descrizione + (c.diottria ? ` ${c.diottria}` : ""),
        qty: "1",
      },
    ]);
    setGiftSearch("");
  }

  function handleSave() {
    if (!anagrafica) return;
    setError(null);
    for (const l of lines) {
      const q = num(l.qty);
      if (!Number.isInteger(q) || q < 1) {
        setError(`Quantità non valida per "${l.descrizione}".`);
        return;
      }
      const p = num(l.pct);
      if (p < 0 || p > 100) {
        setError(`Sconto % non valido per "${l.descrizione}" (0-100).`);
        return;
      }
    }
    startTransition(async () => {
      const res = await saveOrderEditAction({
        order_id: orderId,
        anagrafica,
        pec,
        cmnr,
        note,
        items: lines.map((l) => ({
          id: l.id,
          row: l.row,
          qty: Math.floor(num(l.qty)),
          pct: round2(num(l.pct)),
        })),
        gifts: gifts.map((g) => ({
          id: g.id,
          row: g.row,
          qty: Math.floor(num(g.qty)),
        })),
      });
      if (res.error) {
        setError(res.error);
        return;
      }
      setOpen(false);
      setNotice(res.warning ?? "Ordine aggiornato e file Excel rigenerato.");
      router.refresh();
    });
  }

  function handleResend() {
    if (
      !window.confirm(
        `Rispedire all'ufficio l'email con il modulo Excel aggiornato dell'ordine ${numeroOrdine}?`
      )
    ) {
      return;
    }
    setNotice(null);
    setError(null);
    startTransition(async () => {
      const res = await resendOrderEmailAction(orderId);
      if (res.error) setNotice("⚠️ " + res.error);
      else setNotice(`📧 Email inviata${res.recipient ? ` a ${res.recipient}` : ""}.`);
    });
  }

  return (
    <div className="print-hide">
      <button
        type="button"
        className="outline-button"
        onClick={() => void openEditor()}
        disabled={pending || isCancelled}
        title={
          isCancelled
            ? "Ordine annullato: ripristinalo per poterlo modificare"
            : undefined
        }
      >
        🛠️ Modifica ordine
      </button>{" "}
      <button
        type="button"
        className="outline-button"
        onClick={handleResend}
        disabled={pending}
      >
        📧 Reinvia email
      </button>
      {notice && (
        <p className="form-note" role="status">
          {notice}
        </p>
      )}

      {open && (
        <div
          className="modal-overlay"
          onClick={(e) => {
            if (e.target === e.currentTarget && !pending) setOpen(false);
          }}
        >
          <div
            className="modal-panel"
            role="dialog"
            aria-modal="true"
            aria-label="Modifica ordine"
            style={{ maxWidth: 1000, width: "100%" }}
          >
            <div className="modal-head">
              <h3>Modifica ordine {numeroOrdine}</h3>
              <button
                type="button"
                className="modal-close"
                onClick={() => setOpen(false)}
                disabled={pending}
                aria-label="Chiudi"
              >
                ×
              </button>
            </div>

            {loading && <p className="list-meta">Caricamento…</p>}
            {!loading && error && !data && (
              <p className="form-error" role="alert">
                {error}
              </p>
            )}

            {data && anagrafica && totals && (
              <>
                <p className="list-meta">
                  Salvando si <strong>ricalcolano</strong> imponibile, IVA,
                  trasporto e totale e si <strong>rigenera il file Excel</strong>.
                  Non viene inviata nessuna email. Prima del salvataggio la
                  versione attuale viene conservata nel registro modifiche.
                </p>

                <h4>Anagrafica dell&apos;ordine</h4>
                <div className="form-grid">
                  {ANAGRAFICA_FIELDS.map((f) => (
                    <label
                      key={f.name}
                      className={`form-field${f.span2 ? " span-2" : ""}`}
                    >
                      <span className="form-label">{f.label}</span>
                      <input
                        className="form-input"
                        type={f.name === "email" ? "email" : "text"}
                        value={anagrafica[f.name]}
                        onChange={(e) =>
                          setAnagrafica({ ...anagrafica, [f.name]: e.target.value })
                        }
                        maxLength={255}
                      />
                    </label>
                  ))}
                  <label className="form-field">
                    <span className="form-label">PEC</span>
                    <input
                      className="form-input"
                      value={pec}
                      onChange={(e) => setPec(e.target.value)}
                      maxLength={200}
                    />
                  </label>
                  <label className="form-field">
                    <span className="form-label">CMNR</span>
                    <input
                      className="form-input"
                      value={cmnr}
                      onChange={(e) => setCmnr(e.target.value)}
                      maxLength={100}
                    />
                  </label>
                  <label className="form-field span-2">
                    <span className="form-label">Note</span>
                    <textarea
                      className="form-input"
                      rows={3}
                      value={note}
                      onChange={(e) => setNote(e.target.value)}
                      maxLength={2000}
                    />
                  </label>
                </div>
                <p className="list-meta">
                  PEC e CMNR non hanno una cella dedicata nel modulo Excel:
                  vengono scritte nel campo note.
                </p>

                <h4>Articoli</h4>
                <div className="table-wrap">
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>Descrizione</th>
                        <th>Prezzo</th>
                        <th>Sconto %</th>
                        <th>IVA</th>
                        <th>Qtà</th>
                        <th />
                      </tr>
                    </thead>
                    <tbody>
                      {lines.map((l) => (
                        <tr key={l.key}>
                          <td>
                            {l.descrizione}
                            {l.diottria ? ` ${l.diottria}` : ""}
                            {l.step4 && (
                              <small> (multipli di 4)</small>
                            )}
                          </td>
                          <td>{formatEur(l.prezzo)}</td>
                          <td>
                            <input
                              className="form-input"
                              style={{ width: 80 }}
                              inputMode="decimal"
                              value={l.pct}
                              onChange={(e) => updateLine(l.key, { pct: e.target.value })}
                            />
                            {l.catPct !== null && String(l.catPct) !== l.pct && (
                              <button
                                type="button"
                                className="outline-button table-button"
                                title={`Ripristina lo sconto del catalogo (${l.catPct}%)`}
                                onClick={() =>
                                  updateLine(l.key, { pct: String(l.catPct) })
                                }
                              >
                                catalogo
                              </button>
                            )}
                          </td>
                          <td>{l.iva}%</td>
                          <td>
                            <input
                              className="form-input"
                              style={{ width: 70 }}
                              inputMode="numeric"
                              value={l.qty}
                              onChange={(e) => updateLine(l.key, { qty: e.target.value })}
                            />
                          </td>
                          <td>
                            <button
                              type="button"
                              className="danger-button table-button"
                              onClick={() =>
                                setLines((prev) => prev.filter((x) => x.key !== l.key))
                              }
                            >
                              Rimuovi
                            </button>
                          </td>
                        </tr>
                      ))}
                      {lines.length === 0 && (
                        <tr>
                          <td colSpan={6}>Nessun articolo.</td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>

                <label className="form-field">
                  <span className="form-label">Aggiungi articolo dal catalogo</span>
                  <input
                    className="form-input"
                    placeholder="Cerca per descrizione o diottria (min. 2 lettere)…"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                  />
                </label>
                {found.length > 0 && (
                  <ul className="settings-help">
                    {found.map((c) => (
                      <li key={c.row}>
                        <button
                          type="button"
                          className="outline-button table-button"
                          onClick={() => addArticle(c)}
                        >
                          + {c.descrizione}
                          {c.diottria ? ` ${c.diottria}` : ""} — {formatEur(c.prezzo)}{" "}
                          (sconto {c.pct}%)
                        </button>
                      </li>
                    ))}
                  </ul>
                )}

                <h4>Omaggi</h4>
                {gifts.length === 0 && <p className="list-meta">Nessun omaggio.</p>}
                {gifts.map((g) => (
                  <div key={g.key} className="settings-row">
                    <span>{g.descrizione}</span>
                    <input
                      className="form-input"
                      style={{ width: 70 }}
                      inputMode="numeric"
                      value={g.qty}
                      onChange={(e) =>
                        setGifts((prev) =>
                          prev.map((x) =>
                            x.key === g.key ? { ...x, qty: e.target.value } : x
                          )
                        )
                      }
                    />
                    <button
                      type="button"
                      className="danger-button table-button"
                      onClick={() =>
                        setGifts((prev) => prev.filter((x) => x.key !== g.key))
                      }
                    >
                      Rimuovi
                    </button>
                  </div>
                ))}
                <label className="form-field">
                  <span className="form-label">Aggiungi omaggio (max 10 pezzi totali)</span>
                  <input
                    className="form-input"
                    placeholder="Cerca occhiale singolo…"
                    value={giftSearch}
                    onChange={(e) => setGiftSearch(e.target.value)}
                  />
                </label>
                {foundGifts.length > 0 && (
                  <ul className="settings-help">
                    {foundGifts.map((c) => (
                      <li key={c.row}>
                        <button
                          type="button"
                          className="outline-button table-button"
                          onClick={() => addGift(c)}
                        >
                          + {c.descrizione}
                          {c.diottria ? ` ${c.diottria}` : ""}
                        </button>
                      </li>
                    ))}
                  </ul>
                )}

                <h4>Totali (anteprima)</h4>
                <dl className="detail-grid">
                  <div>
                    <dt>Imponibile</dt>
                    <dd>{formatEur(totals.imponibile)}</dd>
                  </div>
                  <div>
                    <dt>IVA</dt>
                    <dd>{formatEur(totals.iva)}</dd>
                  </div>
                  <div>
                    <dt>Trasporto + IVA</dt>
                    <dd>{formatEur(totals.trasporto + totals.ivaTrasporto)}</dd>
                  </div>
                  <div>
                    <dt>Totale</dt>
                    <dd>
                      <strong>{formatEur(totals.totale)}</strong>
                    </dd>
                  </div>
                </dl>
                <p className="list-meta">
                  Il calcolo definitivo viene rifatto dal server con le
                  impostazioni di spedizione attive.
                </p>

                {error && (
                  <p className="form-error" role="alert">
                    {error}
                  </p>
                )}

                <div className="form-actions">
                  <button
                    type="button"
                    className="outline-button"
                    onClick={() => setOpen(false)}
                    disabled={pending}
                  >
                    Annulla
                  </button>
                  <button
                    type="button"
                    className="primary-button"
                    onClick={handleSave}
                    disabled={pending}
                  >
                    {pending ? "Salvataggio…" : "Salva modifiche"}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
