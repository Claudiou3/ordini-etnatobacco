"use client";

import { useActionState, useState } from "react";
import type { ShippingSettings } from "@/lib/shipping";
import { calcTrasporto, calcIvaTrasporto, round2 } from "@/lib/shipping";
import { formatEur } from "@/lib/format";
import {
  saveShippingSettingsAction,
  resetShippingSettingsAction,
  type ShippingSettingsActionState,
  type ShippingResetActionState,
} from "./actions";

/**
 * Gestione "Spese di spedizione" (area Impostazioni).
 *
 * Sezione 1 — Metodo percentuale attuale: i valori estrapolati dal file Excel
 * (percentuale, minimo, massimo) più l'IVA sul trasporto. Modificandoli si
 * aggiornano anche le impostazioni dell'app e il file Excel di lavoro.
 *
 * Sezione 2 — Importo fisso: l'amministratore inserisce solo il costo della
 * spedizione; il sistema calcola l'IVA con la stessa formula attuale.
 *
 * Un selettore decide quale metodo viene applicato agli ordini nuovi.
 */
export function ShippingForm({ settings }: { settings: ShippingSettings }) {
  const [state, formAction, pending] = useActionState<
    ShippingSettingsActionState,
    FormData
  >(saveShippingSettingsAction, {});

  // Ripristino valori originali (azione separata dal salvataggio).
  const [resetState, resetAction, resetPending] = useActionState<
    ShippingResetActionState,
    FormData
  >(resetShippingSettingsAction, {});

  // Stato locale per l'anteprima dei calcoli (i valori si leggono comunque
  // dai campi via FormData al momento dell'invio).
  const [method, setMethod] = useState<"percentuale" | "fisso">(
    settings.method
  );
  const [percent, setPercent] = useState(String(settings.percentuale.percent));
  const [min, setMin] = useState(String(settings.percentuale.min));
  const [max, setMax] = useState(String(settings.percentuale.max));
  const [iva, setIva] = useState(String(settings.iva));
  const [amount, setAmount] = useState(String(settings.fisso.amount || ""));

  // Se le impostazioni cambiano lato server (salvataggio/ripristino) i campi
  // mostrano subito i valori aggiornati: aggiustamento dello stato durante il
  // render (pattern React) confrontando con l'ultimo valore visto.
  const [prevSettings, setPrevSettings] = useState(settings);
  if (prevSettings !== settings) {
    setPrevSettings(settings);
    setMethod(settings.method);
    setPercent(String(settings.percentuale.percent));
    setMin(String(settings.percentuale.min));
    setMax(String(settings.percentuale.max));
    setIva(String(settings.iva));
    setAmount(settings.fisso.amount > 0 ? String(settings.fisso.amount) : "");
  }

  const num = (v: string): number => {
    const n = parseFloat(v.replace(",", "."));
    return Number.isFinite(n) ? n : NaN;
  };

  const pPerc = num(percent);
  const pMin = num(min);
  const pMax = num(max);
  const pIva = num(iva);
  const pAmount = num(amount);

  // Esempio su un ordine "tipo" per capire subito l'effetto delle regole.
  const EXAMPLE_IMPONIBILE = 1000;

  const exampleTrasporto =
    method === "fisso" && pAmount > 0
      ? pAmount
      : calcTrasporto(EXAMPLE_IMPONIBILE, {
          method: "percentuale",
          percentuale: {
            percent: Number.isFinite(pPerc) ? pPerc : 0,
            min: Number.isFinite(pMin) ? pMin : 0,
            max: Number.isFinite(pMax) ? pMax : 0,
          },
          fisso: { amount: pAmount },
          iva: Number.isFinite(pIva) ? pIva : 22,
        });
  const exampleIva = calcIvaTrasporto(EXAMPLE_IMPONIBILE, {
    method,
    percentuale: {
      percent: Number.isFinite(pPerc) ? pPerc : 0,
      min: Number.isFinite(pMin) ? pMin : 0,
      max: Number.isFinite(pMax) ? pMax : 0,
    },
    fisso: { amount: pAmount },
    iva: Number.isFinite(pIva) ? pIva : 22,
  });
  const fixedIva = pAmount > 0 ? round2(pAmount * (pIva / 100)) : 0;

  const invalid =
    !Number.isFinite(pPerc) ||
    !Number.isFinite(pMin) ||
    !Number.isFinite(pMax) ||
    !Number.isFinite(pIva) ||
    (method === "fisso" && (!Number.isFinite(pAmount) || pAmount <= 0));

  return (
    <div className="content-panel">
      <div className="panel-heading">
        <div>
          <p className="eyebrow">Spese di spedizione</p>
          <h2>Gestione spese di spedizione</h2>
          <p className="settings-help">
            Due sezioni: la <strong>1</strong> mostra i valori che il file
            Excel usa attualmente (percentuale sul valore dell&apos;ordine,
            modificabili e riscritti anche nel file Excel di lavoro); la{" "}
            <strong>2</strong> consente di forzare un{" "}
            <strong>costo di spedizione fisso</strong> sul quale il sistema
            calcola l&apos;IVA con la formula attuale. Scegli quale metodo
            applicare agli ordini.
          </p>
        </div>
        <span
          className={`status-pill${method === "fisso" ? "" : " status-pill-on"}`}
        >
          {method === "percentuale"
            ? "Metodo percentuale attivo"
            : "Importo fisso attivo"}
        </span>
      </div>

      <form action={formAction} className="shipping-form">
        {/* Scelta del metodo */}
        <fieldset className="shipping-methods">
          <legend className="settings-help">
            Metodo applicato agli ordini
          </legend>
          <label className="shipping-method-option">
            <input
              type="radio"
              name="method"
              value="percentuale"
              checked={method === "percentuale"}
              onChange={() => setMethod("percentuale")}
            />
            <span>
              <strong>Percentuale (come da Excel)</strong>
              <small>
                Trasporto = percentuale sull&apos;imponibile, con minimo e
                massimo (comportamento attuale).
              </small>
            </span>
          </label>
          <label className="shipping-method-option">
            <input
              type="radio"
              name="method"
              value="fisso"
              checked={method === "fisso"}
              onChange={() => setMethod("fisso")}
            />
            <span>
              <strong>Importo fisso (forzato)</strong>
              <small>
                Costo di spedizione fisso: l&apos;IVA viene calcolata dal
                sistema sull&apos;importo scelto.
              </small>
            </span>
          </label>
        </fieldset>

        {/* Sezione 1 — metodo percentuale */}
        <div className="shipping-section">
          <div className="shipping-section-head">
            <h3>1 · Metodo percentuale (valori attuali da Excel)</h3>
            <p className="settings-help">
              Valori estrapolati da <code>ordine_template.xlsx</code> (celle
              N291/N293 e formula O291). Sono modificabili: il salvataggio
              aggiorna anche il file Excel di lavoro.
            </p>
          </div>
          <div className="shipping-grid">
            <label className="shipping-field">
              <span>Percentuale sul valore ordine (%)</span>
              <input
                className="form-input"
                type="number"
                step="0.01"
                min="0"
                max="100"
                name="percentuale_percent"
                value={percent}
                onChange={(e) => setPercent(e.target.value)}
              />
            </label>
            <label className="shipping-field">
              <span>Importo minimo (€)</span>
              <input
                className="form-input"
                type="number"
                step="0.01"
                min="0"
                name="percentuale_min"
                value={min}
                onChange={(e) => setMin(e.target.value)}
              />
            </label>
            <label className="shipping-field">
              <span>Importo massimo (€)</span>
              <input
                className="form-input"
                type="number"
                step="0.01"
                min="0"
                name="percentuale_max"
                value={max}
                onChange={(e) => setMax(e.target.value)}
              />
            </label>
            <label className="shipping-field">
              <span>IVA sul trasporto (%)</span>
              <input
                className="form-input"
                type="number"
                step="0.01"
                min="0"
                max="100"
                name="iva"
                value={iva}
                onChange={(e) => setIva(e.target.value)}
              />
            </label>
          </div>
          {method === "percentuale" && Number.isFinite(exampleTrasporto) && (
            <p className="form-note">
              Anteprima su un ordine da {formatEur(EXAMPLE_IMPONIBILE)}:
              trasporto {formatEur(exampleTrasporto)} + IVA{" "}
              {formatEur(exampleIva)}.
            </p>
          )}
        </div>

        {/* Sezione 2 — importo fisso */}
        <div className="shipping-section">
          <div className="shipping-section-head">
            <h3>2 · Importo fisso (forzato)</h3>
            <p className="settings-help">
              Inserisci il costo della spedizione: il sistema calcola
              automaticamente l&apos;IVA (
              {Number.isFinite(pIva) ? pIva : "22"}
              %) sull&apos;importo che scegli.
            </p>
          </div>
          <div className="shipping-grid">
            <label className="shipping-field">
              <span>Costo spedizione (€)</span>
              <input
                className="form-input"
                type="number"
                step="0.01"
                min="0"
                name="fisso_amount"
                placeholder="es. 25,00"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
              />
            </label>
          </div>
          {method === "fisso" && pAmount > 0 && (
            <p className="form-note">
              Anteprima: spedizione {formatEur(pAmount)} + IVA{" "}
              {formatEur(fixedIva)} = {formatEur(pAmount + fixedIva)}.
            </p>
          )}
        </div>

        {state.error && (
          <p className="form-error" role="alert">
            {state.error}
          </p>
        )}
        {state.success && (
          <p className="form-note" role="status">
            Impostazioni salvate. {state.excelWarning ?? ""}
          </p>
        )}

        <div className="form-actions">
          <button
            className="primary-button"
            type="submit"
            disabled={pending || invalid}
          >
            {pending ? "Salvataggio…" : "Salva impostazioni spedizione"}
          </button>
        </div>
      </form>

      {/* Ripristino valori originali (form separato: niente form annidati) */}
      <form action={resetAction} className="shipping-reset">
        <button
          className="danger-button table-button"
          type="submit"
          disabled={resetPending}
          onClick={(e) => {
            if (
              !window.confirm(
                "Ripristinare le spese di spedizione ORIGINALI " +
                  "(2,9% / minimo €9,50 / massimo €99,00 / IVA 22%, " +
                  "metodo percentuale)? Le modifiche correnti andranno perse."
              )
            ) {
              e.preventDefault();
            }
          }}
        >
          {resetPending ? "Ripristino…" : "Ripristina valori originali"}
        </button>
      </form>
      {resetState.error && (
        <p className="form-error" role="alert">
          {resetState.error}
        </p>
      )}
      {resetState.success && (
        <p className="form-note" role="status">
          Spese di spedizione ripristinate ai valori originali.{" "}
          {resetState.excelWarning ?? ""}
        </p>
      )}
    </div>
  );
}

