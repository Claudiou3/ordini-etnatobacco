"use client";

import { useEffect, useState, useActionState } from "react";
import { useRouter } from "next/navigation";
import { addGaraAction, deleteGaraAction, type GaraActionState } from "./actions";
import type { IncentiveGara, ClassificaRiga } from "@/lib/incentives";
import { formatEur } from "@/lib/format";

const MONTH_NAMES = [
  "Gennaio", "Febbraio", "Marzo", "Aprile", "Maggio", "Giugno",
  "Luglio", "Agosto", "Settembre", "Ottobre", "Novembre", "Dicembre",
];

function monthParts(month?: string): { mese: string; anno: string } {
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

function monthLabel(month?: string): string {
  if (!month || !/^\d{4}-\d{2}$/.test(month)) return "";
  const [y, m] = month.split("-");
  return `${MONTH_NAMES[Number(m) - 1] ?? m} ${y}`;
}

function kindText(kind: IncentiveGara["kind"]): string {
  return kind === "obiettivo"
    ? "Obiettivo imponibile"
    : "Gara miglior venditore";
}

export function ObiettiviPanel({
  gare,
  canEdit,
  month,
  ranking,
}: {
  gare: IncentiveGara[];
  canEdit: boolean;
  month: string;
  ranking: ClassificaRiga[];
}) {
  const router = useRouter();
  const currentYear = new Date().getFullYear();
  const years = Array.from({ length: 5 }, (_, i) => currentYear - 1 + i);

  const init = monthParts(month);
  const [mese, setMese] = useState(init.mese);
  const [anno, setAnno] = useState(init.anno);
  const monthValue = `${anno}-${String(Number(mese)).padStart(2, "0")}`;

  useEffect(() => {
    const next = monthParts(month);
    setMese(next.mese);
    setAnno(next.anno);
  }, [month]);

  function cambiaMese(nextMese: string, nextAnno: string) {
    setMese(nextMese);
    setAnno(nextAnno);
    const value = `${nextAnno}-${String(Number(nextMese)).padStart(2, "0")}`;
    router.replace(`/obiettivi?mese=${value}`);
  }

  const [objState, objAction, objPending] = useActionState<
    GaraActionState,
    FormData
  >(addGaraAction, {});
  const [venState, venAction, venPending] = useActionState<
    GaraActionState,
    FormData
  >(addGaraAction, {});
  const [delState, delAction, delPending] = useActionState<
    GaraActionState,
    FormData
  >(deleteGaraAction, {});

  const gareMese = gare
    .filter((g) => g.month === monthValue)
    .sort((a, b) => a.createdAt - b.createdAt);

  return (
    <>
      <section className="content-panel">
        <div className="panel-heading">
          <div>
            <p className="eyebrow">Obiettivi agenti</p>
            <h2>{monthLabel(monthValue)}</h2>
            <p className="settings-help">
              Ogni mese puoi attivare più premi in parallelo: un{" "}
              <strong>obiettivo di imponibile</strong> raggiungibile da tutti
              gli agenti oppure una <strong>gara miglior venditore</strong> con
              premio unico al 1° in classifica per imponibile del mese.
            </p>
          </div>
          {canEdit && (
            <div className="topbar-actions month-switch">
              <select
                className="form-input"
                aria-label="Mese"
                value={mese}
                onChange={(e) => cambiaMese(e.target.value, anno)}
              >
                {MONTH_NAMES.map((n, i) => (
                  <option key={n} value={i + 1}>
                    {n}
                  </option>
                ))}
              </select>
              <select
                className="form-input"
                aria-label="Anno"
                value={anno}
                onChange={(e) => cambiaMese(mese, e.target.value)}
              >
                {years.map((y) => (
                  <option key={y} value={y}>
                    {y}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>

        {gareMese.length === 0 ? (
          <p className="empty-state">
            Nessuna gara configurata per {monthLabel(monthValue)}.
          </p>
        ) : (
          <div className="agent-list">
            {gareMese.map((g) => (
              <div key={g.id} className="incentive-top-row gara-row">
                <span
                  className={`gara-kind gara-kind-${g.kind}`}
                  aria-hidden="true"
                >
                  {g.kind === "obiettivo" ? "🎯" : "🏆"}
                </span>
                <span className="incentive-name">
                  <strong>
                    {g.kind === "obiettivo"
                      ? `Obiettivo ${formatEur(g.target ?? 0)}`
                      : `1° classificato${g.note ? ` — ${g.note}` : ""}`}
                  </strong>
                  <small>
                    {g.kind === "obiettivo"
                      ? "Premio a ogni agente che raggiunge l'obiettivo del mese"
                      : "Premio all'agente con il maggior imponibile del mese"}
                  </small>
                </span>
                <strong className="incentive-amount">
                  {formatEur(g.prize)}
                </strong>
                {canEdit && (
                  <form
                    action={delAction}
                    onSubmit={(event) => {
                      if (
                        !window.confirm(
                          `Eliminare la gara "${kindText(g.kind)}" da ${
                            g.kind === "obiettivo"
                              ? `obiettivo ${formatEur(g.target ?? 0)}`
                              : "miglior venditore"
                          } (premio ${formatEur(g.prize)})?`
                        )
                      ) {
                        event.preventDefault();
                      }
                    }}
                  >
                    <input type="hidden" name="id" value={g.id} />
                    <button
                      type="submit"
                      className="danger-button table-button"
                      disabled={delPending}
                    >
                      {delPending ? "…" : "Elimina"}
                    </button>
                  </form>
                )}
              </div>
            ))}
          </div>
        )}

        {delState?.error && (
          <p className="form-error" role="alert">
            {delState.error}
          </p>
        )}
        {delState?.success && (
          <p className="form-note" role="status">
            Gara eliminata.
          </p>
        )}
      </section>

      {canEdit && (
        <section className="content-panel">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">Crea una nuova gara</p>
              <h2>Premi per {monthLabel(monthValue)}</h2>
            </div>
          </div>

          <div className="gare-new-grid">
            <div className="gara-new-block">
              <h3>🎯 Obiettivo imponibile</h3>
              <p className="settings-help">
                Vince il premio <strong>ogni agente</strong> che nel mese
                raggiunge l&apos;obiettivo di imponibile indicato (ordini non
                annullati).
              </p>
              <form action={objAction} className="incentive-form gara-form">
                <input type="hidden" name="kind" value="obiettivo" />
                <input type="hidden" name="mese" value={mese} />
                <input type="hidden" name="anno" value={anno} />
                <label className="form-field">
                  <span className="form-label">Obiettivo (€ imponibile)</span>
                  <input
                    className="form-input"
                    type="number"
                    name="target"
                    min="1"
                    step="0.01"
                    placeholder="es. 5000"
                    required
                  />
                </label>
                <label className="form-field">
                  <span className="form-label">Premio (€)</span>
                  <input
                    className="form-input"
                    type="number"
                    name="prize"
                    min="0.01"
                    step="0.01"
                    placeholder="es. 50"
                    required
                  />
                </label>
                {objState.error && (
                  <p className="form-error" role="alert">
                    {objState.error}
                  </p>
                )}
                {objState.success && (
                  <p className="form-note" role="status">
                    Obiettivo salvato.
                  </p>
                )}
                <div className="form-actions">
                  <button
                    type="submit"
                    className="primary-button"
                    disabled={objPending}
                  >
                    {objPending ? "Salvataggio…" : "Salva obiettivo"}
                  </button>
                </div>
              </form>
            </div>

            <div className="gara-new-block">
              <h3>🏆 Gara miglior venditore</h3>
              <p className="settings-help">
                Premio <strong>unico</strong> all&apos;agente con il maggior
                imponibile complessivo del mese (il 1° in classifica).
              </p>
              <form action={venAction} className="incentive-form gara-form">
                <input type="hidden" name="kind" value="vendite" />
                <input type="hidden" name="mese" value={mese} />
                <input type="hidden" name="anno" value={anno} />
                <label className="form-field">
                  <span className="form-label">Premio 1° classificato (€)</span>
                  <input
                    className="form-input"
                    type="number"
                    name="prize"
                    min="0.01"
                    step="0.01"
                    placeholder="es. 100"
                    required
                  />
                </label>
                <label className="form-field">
                  <span className="form-label">Etichetta (facoltativa)</span>
                  <input
                    className="form-input"
                    type="text"
                    name="note"
                    placeholder="es. premio speciale estate"
                  />
                </label>
                {venState.error && (
                  <p className="form-error" role="alert">
                    {venState.error}
                  </p>
                )}
                {venState.success && (
                  <p className="form-note" role="status">
                    Gara salvata.
                  </p>
                )}
                <div className="form-actions">
                  <button
                    type="submit"
                    className="primary-button"
                    disabled={venPending}
                  >
                    {venPending ? "Salvataggio…" : "Salva gara vendite"}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </section>
      )}

      <section className="content-panel">
        <div className="panel-heading">
          <div>
            <p className="eyebrow">Classifica imponibile</p>
            <h2>{monthLabel(monthValue)}</h2>
          </div>
        </div>
        {ranking.length === 0 ? (
          <p className="empty-state">
            Nessun ordine attivo in {monthLabel(monthValue)}.
          </p>
        ) : (
          <div className="agent-list">
            {ranking.slice(0, 10).map((r, i) => (
              <div key={r.id} className="incentive-top-row">
                <span className="incentive-rank">{i + 1}º</span>
                <span className="incentive-name">
                  <strong>{r.nome}</strong>
                  <small>{r.email}</small>
                </span>
                <strong className="incentive-amount">
                  {formatEur(r.imponibile)}
                </strong>
              </div>
            ))}
          </div>
        )}
        {ranking.length > 0 && (
          <p className="settings-help">
            Se per questo mese è attiva una gara &quot;miglior venditore&quot;,
            il 1° in classifica vince il relativo premio.
          </p>
        )}
      </section>
    </>
  );
}

