"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { CatalogItem } from "@/lib/catalog/template";
import {
  saveCatalogPricesAction,
  applyBulkDiscountAction,
  saveStep4Action,
  applyBulkStep4Action,
} from "./actions";

type Msg = { type: "ok" | "err"; text: string } | null;

export function CatalogManager({
  items,
  canEdit = true,
}: {
  items: CatalogItem[];
  /** FALSE per i sub-amministratori (solo lettura). */
  canEdit?: boolean;
}) {
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [bulkPct, setBulkPct] = useState("60");
  const [values, setValues] = useState<Record<number, string>>({});
  const [priceValues, setPriceValues] = useState<Record<number, string>>({});
  // PREZZO iniziale (listino) editabile: insieme allo SCONTO % genera
  // automaticamente il PREZZO DI VENDITA.
  const [baseValues, setBaseValues] = useState<Record<number, string>>({});
  const [message, setMessage] = useState<Msg>(null);
  const [pending, startTransition] = useTransition();
  const [step4Busy, setStep4Busy] = useState<number | null>(null);
  const [bulkStep4, setBulkStep4] = useState("si");
  const router = useRouter();

  function toggle(row: number) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(row)) next.delete(row);
      else next.add(row);
      return next;
    });
  }

  function scontoPctOf(item: CatalogItem): number {
    return Math.round(item.sconto * 10000) / 100;
  }

  function currentBase(item: CatalogItem): number {
    const raw = baseValues[item.row];
    const n = raw === undefined ? item.prezzo : Number(raw);
    return Number.isFinite(n) && n > 0 ? n : item.prezzo;
  }

  function currentScontoPct(item: CatalogItem): number {
    const raw = values[item.row];
    const n = raw === undefined ? scontoPctOf(item) : Number(raw);
    return Number.isFinite(n) ? n : scontoPctOf(item);
  }

  function onBasePriceChange(item: CatalogItem, raw: string) {
    setBaseValues((prev) => ({ ...prev, [item.row]: raw }));
    const base = Number(raw);
    const pct = Math.min(100, Math.max(0, currentScontoPct(item)));
    if (Number.isFinite(base) && base > 0) {
      // Prezzo di vendita = prezzo iniziale - sconto % (automatico).
      const sale = base * (1 - pct / 100);
      setPriceValues((prev) => ({ ...prev, [item.row]: sale.toFixed(2) }));
    }
  }

  function onScontoChange(item: CatalogItem, raw: string) {
    setValues((prev) => ({ ...prev, [item.row]: raw }));
    const base = currentBase(item);
    const pct = Number(raw);
    if (base > 0 && Number.isFinite(pct)) {
      // Prezzo di vendita rigenerato in automatico dallo sconto inserito.
      const sale = base * (1 - Math.min(100, Math.max(0, pct)) / 100);
      setPriceValues((prev) => ({ ...prev, [item.row]: sale.toFixed(2) }));
    }
  }

  function onPriceChange(item: CatalogItem, raw: string) {
    setPriceValues((prev) => ({ ...prev, [item.row]: raw }));
    const price = Number(raw);
    const base = currentBase(item);
    if (Number.isFinite(price) && base > 0) {
      // Modifica diretta del prezzo di vendita: ricalcola lo sconto %.
      const pct = (1 - Math.min(price, base) / base) * 100;
      setValues((prev) => ({
        ...prev,
        [item.row]: Math.max(0, pct).toFixed(1),
      }));
    }
  }

  async function handleSave(row: number) {
    const item = items.find((i) => i.row === row);
    if (!item) return;
    const prezzoBase = currentBase(item);
    const pct = currentScontoPct(item);
    if (!Number.isFinite(prezzoBase) || prezzoBase <= 0) {
      setMessage({ type: "err", text: "Prezzo non valido (maggiore di zero)." });
      return;
    }
    if (!Number.isFinite(pct) || pct < 0 || pct > 100) {
      setMessage({ type: "err", text: "Percentuale non valida (0-100)." });
      return;
    }
    startTransition(async () => {
      const res = await saveCatalogPricesAction(row, prezzoBase, pct);
      if (res.error) setMessage({ type: "err", text: res.error });
      else {
        setMessage({ type: "ok", text: "Prezzo e sconto salvati." });
        router.refresh();
      }
    });
  }

  async function handleBulk() {
    const rows = [...selected];
    const pct = Number(bulkPct);
    if (rows.length === 0) {
      setMessage({ type: "err", text: "Seleziona almeno un articolo." });
      return;
    }
    if (!Number.isFinite(pct) || pct < 0 || pct > 100) {
      setMessage({ type: "err", text: "Percentuale non valida (0-100)." });
      return;
    }
    startTransition(async () => {
      const res = await applyBulkDiscountAction(rows, pct);
      if (res.error) setMessage({ type: "err", text: res.error });
      else {
        setMessage({ type: "ok", text: `Sconto ${pct}% applicato a ${res.applied} articoli.` });
        setSelected(new Set());
        router.refresh();
      }
    });
  }

  async function handleStep4(row: number, enabled: boolean) {
    setStep4Busy(row);
    startTransition(async () => {
      const res = await saveStep4Action(row, enabled);
      setStep4Busy(null);
      if (res.error) setMessage({ type: "err", text: res.error });
      else {
        setMessage({
          type: "ok",
          text: enabled ? "Multiplo di 4 attivo." : "Multiplo di 4 disattivato.",
        });
        router.refresh();
      }
    });
  }

  async function handleBulkStep4() {
    const rows = [...selected];
    if (rows.length === 0) {
      setMessage({ type: "err", text: "Seleziona almeno un articolo." });
      return;
    }
    const enabled = bulkStep4 === "si";
    startTransition(async () => {
      const res = await applyBulkStep4Action(rows, enabled);
      if (res.error) setMessage({ type: "err", text: res.error });
      else {
        setMessage({
          type: "ok",
          text: `"Multiplo di 4" ${enabled ? "attivato" : "disattivato"} su ${res.applied} articoli.`,
        });
        setSelected(new Set());
        router.refresh();
      }
    });
  }

  return (
    <>
      {canEdit && (
        <>
          <section className="content-panel">
        <div className="panel-heading">
          <div>
            <p className="eyebrow">Gestione sconti</p>
            <h2>Applica sconto alla selezione</h2>
            <p className="settings-help">
              Spunta uno o più articoli, scegli la percentuale di sconto e
              applicala in un colpo solo.
            </p>
          </div>
        </div>
        <div className="settings-row bulk-bar">
          <span className="bulk-count">{selected.size} selezionati</span>
          <label className="bulk-field">
            <span className="form-label">Sconto %</span>
            <input
              className="form-input"
              type="number"
              min="0"
              max="100"
              step="0.5"
              value={bulkPct}
              onChange={(e) => setBulkPct(e.target.value)}
            />
          </label>
          <button
            className="primary-button table-button"
            type="button"
            onClick={handleBulk}
            disabled={pending}
          >
            {pending ? "Applicazione…" : "Applica sconto alla selezione"}
          </button>
        </div>
      </section>

      <section className="content-panel">
        <div className="panel-heading">
          <div>
            <p className="eyebrow">Multiplo di 4</p>
            <h2>Applica il vincolo alla selezione</h2>
            <p className="settings-help">
              Decidi tu per ogni articolo se la quantità deve essere a{" "}
              <strong>multipli di 4</strong> oppure libera.
            </p>
          </div>
        </div>
        <div className="settings-row bulk-bar">
          <span className="bulk-count">{selected.size} selezionati</span>
          <label className="bulk-field">
            <span className="form-label">Multiplo di 4</span>
            <select
              className="form-input"
              value={bulkStep4}
              onChange={(e) => setBulkStep4(e.target.value)}
            >
              <option value="si">Sì — quantità multipli di 4</option>
              <option value="no">No — quantità libera</option>
            </select>
          </label>
          <button
            className="primary-button table-button"
            type="button"
            onClick={handleBulkStep4}
            disabled={pending}
          >
            {pending ? "Applicazione…" : "Applica multiplo di 4"}
          </button>
        </div>
        {message && (
          <p className={message.type === "ok" ? "form-note" : "form-error"} role="status">
            {message.text}
          </p>
        )}
      </section>
        </>
      )}

      <section className="content-panel">
        <div className="table-wrap">
          <table className="data-table catalog-table">
            <thead>
              <tr>
                <th>
                  <span className="sr-only">Seleziona</span>
                </th>
                <th>Codice</th>
                <th>Descrizione</th>
                <th>Diottria</th>
                <th>Prezzo</th>
                <th>IVA</th>
                <th>Sconto %</th>
                <th>Prezzo vendita</th>
                <th title="Quantità a multipli di 4">Mult. 4</th>
                <th>
                  <span className="sr-only">Azioni</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr key={item.row}>
                  <td>
                    <input
                      type="checkbox"
                      checked={selected.has(item.row)}
                      onChange={() => toggle(item.row)}
                      disabled={!canEdit}
                      aria-label={`Seleziona ${item.codice}`}
                    />
                  </td>
                  <td>{item.codice}</td>
                  <td>
                    <strong>{item.descrizione}</strong>
                    <small>
                      {item.brand} · {item.tipologia}
                      {item.modello ? ` · ${item.modello}` : ""}
                    </small>
                  </td>
                  <td>{item.diottria || "—"}</td>
                  <td>
                    <input
                      className="form-input sconto-input base-price-input"
                      type="number"
                      min="0"
                      step="0.01"
                      value={baseValues[item.row] ?? item.prezzo.toFixed(2)}
                      onChange={(e) => onBasePriceChange(item, e.target.value)}
                      disabled={!canEdit}
                      aria-label={`Prezzo ${item.codice}`}
                      title="Prezzo iniziale (modificabile)"
                    />
                  </td>
                  <td>{item.iva}%</td>
                  <td>
                    <input
                      className="form-input sconto-input"
                      type="number"
                      min="0"
                      max="100"
                      step="0.5"
                      value={values[item.row] ?? scontoPctOf(item)}
                      onChange={(e) => onScontoChange(item, e.target.value)}
                      disabled={!canEdit}
                    />
                  </td>
                  <td>
                    <input
                      className="form-input sconto-input price-input"
                      type="number"
                      min="0"
                      step="0.01"
                      value={
                        priceValues[item.row] ??
                        item.nettoEscl.toFixed(2)
                      }
                      onChange={(e) => onPriceChange(item, e.target.value)}
                      disabled={!canEdit}
                      aria-label={`Prezzo di vendita ${item.codice}`}
                    />
                  </td>
                  <td>
                    <input
                      className="step4-check"
                      type="checkbox"
                      checked={item.step4}
                      onChange={(e) => handleStep4(item.row, e.target.checked)}
                      disabled={!canEdit || step4Busy === item.row}
                      aria-label={`Multiplo di 4 ${item.codice}`}
                      title="Quantità a multipli di 4"
                    />
                  </td>
                  <td>
                    {canEdit ? (
                      <button
                        className="outline-button table-button"
                        type="button"
                        onClick={() => handleSave(item.row)}
                        disabled={pending}
                      >
                        Salva
                      </button>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}
