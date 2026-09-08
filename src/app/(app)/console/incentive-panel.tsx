"use client";

import { useEffect, useRef, useState, useActionState } from "react";
import {
  saveIncentivePlanAction,
  clearIncentivePlanAction,
  type IncentiveActionState,
} from "./actions";
import type { IncentivePlan, AgentIncentiveRank } from "@/lib/incentive";
import { formatEur } from "@/lib/format";

const MONTH_NAMES = [
  "Gennaio","Febbraio","Marzo","Aprile","Maggio","Giugno",
  "Luglio","Agosto","Settembre","Ottobre","Novembre","Dicembre",
];

function planMonthParts(month?: string): { mese: string; anno: string } {
  if (month && /^\d{4}-\d{2}$/.test(month)) {
    const [y, m] = month.split("-");
    return { mese: String(Number(m)), anno: y };
  }
  const now = new Date();
  return {
    mese: String(now.getMonth() + 1),
    anno: String(now.getFullYear()),
  };
}

function monthLabel(planMonth?: string): string {
  if (!planMonth || !/^\d{4}-\d{2}$/.test(planMonth)) return "";
  const [y, m] = planMonth.split("-");
  return `${MONTH_NAMES[Number(m) - 1] ?? m} ${y}`;
}

export function IncentivePanel({
  plan,
  top,
  canEdit,
}: {
  plan: IncentivePlan | null;
  top: AgentIncentiveRank[];
  canEdit: boolean;
}) {
  const init = planMonthParts(plan?.month);
  const [mese, setMese] = useState(init.mese);
  const [anno, setAnno] = useState(init.anno);
  const currentYear = new Date().getFullYear();
  const years = Array.from(
    { length: 4 },
    (_, i) => currentYear - 1 + i
  );

  const [state, formAction, pending] = useActionState<
    IncentiveActionState,
    FormData
  >(saveIncentivePlanAction, {});
  const [delState, delFormAction, delPending] = useActionState<
    IncentiveActionState,
    FormData
  >(clearIncentivePlanAction, {});
  const deleteFormRef = useRef<HTMLFormElement>(null);

  // I selettori Mese/Anno sono inizializzati solo al mount: se il piano attivo
  // cambia (salvataggio/eliminazione) i valori vanno riallineati alla prop.
  useEffect(() => {
    const next = planMonthParts(plan?.month);
    setMese(next.mese);
    setAnno(next.anno);
  }, [plan?.month]);

  return (
    <section className="content-panel">
      <div className="panel-heading">
        <div>
          <p className="eyebrow">Obiettivi agenti</p>
          <h2>Piano incentivante</h2>
          <p className="settings-help">
            Definisci per un mese l&apos;obiettivo di imponibile (solo merce,
            senza spedizione/IVA) e il premio. Gli agenti vedono il piano e il
            loro avanzamento; gli ordini annullati non contano.
          </p>
        </div>
      </div>

      {plan ? (
        <p className="form-note incentive-summary" role="status">
          Piano attivo: obiettivo{" "}
          <strong>{formatEur(plan.target)}</strong> di imponibile per{" "}
          <strong>{monthLabel(plan.month)}</strong> — premio{" "}
          <strong>{formatEur(plan.prize)}</strong>.
        </p>
      ) : (
        <p className="empty-state">Nessun piano incentivante configurato.</p>
      )}

      {canEdit && (
        <>
          <form
            id="incentive-save-form"
            action={formAction}
            className="incentive-form"
          >
          <div className="form-grid incentive-grid">
            <label className="form-field">
              <span className="form-label">Obiettivo imponibile (€)</span>
              <input
                className="form-input"
                type="number"
                name="target"
                min="1"
                step="0.01"
                defaultValue={plan ? String(plan.target) : ""}
                placeholder="es. 10000"
                required
              />
            </label>
            <label className="form-field">
              <span className="form-label">Mese</span>
              <select
                className="form-input"
                name="mese"
                value={mese}
                onChange={(e) => setMese(e.target.value)}
              >
                {MONTH_NAMES.map((name, i) => (
                  <option key={i + 1} value={i + 1}>
                    {name}
                  </option>
                ))}
              </select>
            </label>
            <label className="form-field">
              <span className="form-label">Anno</span>
              <select
                className="form-input"
                name="anno"
                value={anno}
                onChange={(e) => setAnno(e.target.value)}
              >
                {years.map((y) => (
                  <option key={y} value={y}>
                    {y}
                  </option>
                ))}
              </select>
            </label>
            <label className="form-field">
              <span className="form-label">Premio (€)</span>
              <input
                className="form-input"
                type="number"
                name="prize"
                min="0"
                step="0.01"
                defaultValue={plan ? String(plan.prize) : ""}
                placeholder="es. 500"
                required
              />
            </label>
          </div>

          {state.error && (
            <p className="form-error" role="alert">
              {state.error}
            </p>
          )}
          {state.success && (
            <p className="form-note" role="status">
              Piano incentivante salvato.
            </p>
          )}

          <div className="form-actions">
            <button
              className="primary-button"
              type="submit"
              disabled={pending}
            >
              {pending ? "Salvataggio…" : plan ? "Aggiorna piano" : "Crea piano"}
            </button>
            {plan && (
              <button
                className="danger-button"
                type="button"
                onClick={() => {
                  if (
                    window.confirm(
                      "Eliminare il piano incentivante? Gli agenti non vedranno più obiettivo e premio."
                    )
                  ) {
                    deleteFormRef.current?.requestSubmit();
                  }
                }}
                disabled={delPending}
              >
                {delPending ? "Eliminazione…" : "Elimina piano"}
              </button>
            )}
          </div>
          {delState?.error && (
            <p className="form-error" role="alert">
              {delState.error}
            </p>
          )}
          {delState?.success && (
            <p className="form-note" role="status">
              Piano incentivante eliminato.
            </p>
          )}
          </form>

          {/* HTML non consente <form> annidati, quindi il modulo di eliminazione
              vive qui fuori: il bottone "Elimina piano" lo invia esplicitamente
              con requestSubmit() dopo la conferma. Nessun input visibile. */}
          {plan && (
            <form
              id="incentive-delete-form"
              ref={deleteFormRef}
              action={delFormAction}
            />
          )}
        </>
      )}

      {top.length > 0 && (
        <div className="incentive-top">
          <h3>Top 3 agenti — {monthLabel(plan?.month)}</h3>
          <div className="agent-list">
            {top.map((a, index) => (
              <div key={a.email} className="incentive-top-row">
                <span className="incentive-rank">{index + 1}º</span>
                <span className="incentive-name">
                  <strong>{a.nome}</strong>
                  <small>{a.email}</small>
                </span>
                <strong className="incentive-amount">
                  {formatEur(a.imponibile)}
                </strong>
              </div>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}
