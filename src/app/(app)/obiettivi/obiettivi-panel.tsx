"use client";

import { useEffect, useState, useActionState } from "react";
import { useRouter } from "next/navigation";
import { addGaraAction, deleteGaraAction, type GaraActionState } from "./actions";
import type { IncentiveGara, IncentiveKind, ClassificaRiga } from "@/lib/incentives";
import { formatEur } from "@/lib/format";

const MONTH_NAMES = [
  "Gennaio", "Febbraio", "Marzo", "Aprile", "Maggio", "Giugno",
  "Luglio", "Agosto", "Settembre", "Ottobre", "Novembre", "Dicembre",
];

function dataLabel(date: string): string {
  const [y, m, d] = date.split("-");
  return `${d}/${m}/${y}`;
}

function periodLabel(from: string, to: string): string {
  const month = from.slice(0, 7);
  if (/^\d{4}-\d{2}$/.test(month) && from === `${month}-01`) {
    const last = new Date(Date.UTC(Number(month.split("-")[0]), Number(month.split("-")[1]), 0))
      .toISOString()
      .slice(0, 10);
    if (to === last) {
      const [y, m] = month.split("-");
      return `${MONTH_NAMES[Number(m) - 1] ?? m} ${y}`;
    }
  }
  return `dal ${dataLabel(from)} al ${dataLabel(to)}`;
}

function kindText(kind: IncentiveKind): string {
  return kind === "obiettivo"
    ? "Obiettivo imponibile"
    : "Gara miglior venditore";
}

function todayISO(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function lastDayOfMonth(month: string): string {
  const [y, m] = month.split("-").map(Number);
  return new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
}

export function ObiettiviPanel({
  gare,
  canEdit,
  range,
  ranking,
}: {
  gare: IncentiveGara[];
  canEdit: boolean;
  range: { from: string; to: string };
  ranking: ClassificaRiga[];
}) {
  const router = useRouter();

  // Periodo usato per la CLASSIFICA (ricaricata dal server tramite ?da&a).
  const [cFrom, setCFrom] = useState(range.from);
  const [cTo, setCTo] = useState(range.to);

  // Periodo di default per la CREAZIONE di nuove gare.
  const now = todayISO();
  const initFrom = range.from ?? now.slice(0, 8) + "01";
  const initTo = range.to ?? now;
  const [nFrom, setNFrom] = useState(initFrom);
  const [nTo, setNTo] = useState(initTo);

  // Sincronizza la classifica quando il periodo cambia (navigazione ?da&a).
  useEffect(() => {
    setCFrom(range.from);
    setCTo(range.to);
  }, [range.from, range.to]);

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

  function aggiornaClassifica() {
    if (cFrom && cTo) {
      const [f, t] = cFrom <= cTo ? [cFrom, cTo] : [cTo, cFrom];
      router.replace(`/obiettivi?da=${f}&a=${t}`);
    }
  }

  // Gare dello stesso periodo mostrato in classifica (accoppiamento regola verde).
  const gareInRange = gare.filter((g) => g.from === cFrom && g.to === cTo);
  const obiettivoInRange = gareInRange.find((g) => g.kind === "obiettivo");
  const venditeInRange = gareInRange.filter((g) => g.kind === "vendite");
  const targetObiettivo = obiettivoInRange?.target ?? 0;

  return (
    <>
      <section className="content-panel">
        <div className="panel-heading">
          <div>
            <p className="eyebrow">Obiettivi agenti</p>
            <h2>Gare configurate</h2>
            <p className="settings-help">
              Ogni gara ha un periodo libero (da… a): un mese intero oppure più
              mesi. Le gare dello stesso periodo sono accoppiate: per la gara
              miglior venditore il verde spetta al 1° solo se ha superato anche
              l&apos;obiettivo della gara obiettivo dello stesso periodo.
            </p>
          </div>
        </div>

        {gare.length === 0 ? (
          <p className="empty-state">
            Nessuna gara configurata. Usa la sezione &quot;Crea una nuova
            gara&quot; qui sotto.
          </p>
        ) : (
          <div className="agent-list">
            {gare.map((g) => (
              <div key={g.id} className="incentive-top-row gara-row">
                <span className="incentive-name">
                  <strong>
                    {g.kind === "obiettivo"
                      ? `Obiettivo ${formatEur(g.target ?? 0)}`
                      : `Gara miglior venditore${g.note ? ` — ${g.note}` : ""}`}
                    <small className="gara-period">
                      {" "}
                      · {periodLabel(g.from, g.to)}
                    </small>
                  </strong>
                  <small>
                    {g.kind === "obiettivo"
                      ? `Premio ${formatEur(g.prize)} a ogni agente che raggiunge l'obiettivo nel periodo`
                      : [
                          `Oro ${formatEur(g.prize)}`,
                          g.prizeArgento
                            ? `Argento ${formatEur(g.prizeArgento)}`
                            : null,
                          g.prizeBronzo
                            ? `Bronzo ${formatEur(g.prizeBronzo)}`
                            : null,
                        ]
                          .filter(Boolean)
                          .join(" · ")}
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
                          `Eliminare la gara "${kindText(g.kind)}" (${
                            g.kind === "obiettivo"
                              ? `obiettivo ${formatEur(g.target ?? 0)}`
                              : "miglior venditore"
                          }, premio ${formatEur(g.prize)}, ${periodLabel(
                            g.from,
                            g.to
                          )})?`
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
              <h2>Premi su periodo libero</h2>
            </div>
          </div>

          <div className="gara-range-grid">
            <label className="form-field">
              <span className="form-label">Periodo da (incluso)</span>
              <input
                className="form-input"
                type="date"
                value={nFrom}
                onChange={(e) => setNFrom(e.target.value)}
              />
            </label>
            <label className="form-field">
              <span className="form-label">a (incluso)</span>
              <input
                className="form-input"
                type="date"
                value={nTo}
                onChange={(e) => setNTo(e.target.value)}
              />
            </label>
            <button
              type="button"
              className="outline-button"
              onClick={() => {
                setNFrom(now.slice(0, 8) + "01");
                setNTo(lastDayOfMonth(now.slice(0, 7)));
              }}
            >
              Mese corrente
            </button>
          </div>

          <div className="gare-new-grid">
            <div className="gara-new-block">
              <h3>Obiettivo imponibile</h3>
              <p className="settings-help">
                Vince il premio <strong>ogni agente</strong> che nel periodo
                raggiunge l&apos;obiettivo di imponibile (ordini non annullati).
              </p>
              <form action={objAction} className="incentive-form gara-form">
                <input type="hidden" name="kind" value="obiettivo" />
                <input type="hidden" name="from" value={nFrom} />
                <input type="hidden" name="to" value={nTo} />
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
              <h3>Gara miglior venditore</h3>
              <p className="settings-help">
                Tre premi di categoria per i primi 3 del periodo:{" "}
                <strong>Oro</strong> (1°), <strong>Argento</strong> (2°) e{" "}
                <strong>Bronzo</strong> (3°). Se per lo stesso periodo esiste una
                gara obiettivo, il 1° vince l&apos;Oro solo se l&apos;ha
                raggiunta.
              </p>
              <form action={venAction} className="incentive-form gara-form">
                <input type="hidden" name="kind" value="vendite" />
                <input type="hidden" name="from" value={nFrom} />
                <input type="hidden" name="to" value={nTo} />
                <label className="form-field">
                  <span className="form-label">Premio ORO — 1° (€)</span>
                  <input
                    className="form-input"
                    type="number"
                    name="prize"
                    min="0.01"
                    step="0.01"
                    placeholder="es. 150"
                    required
                  />
                </label>
                <label className="form-field">
                  <span className="form-label">Premio ARGENTO — 2° (€)</span>
                  <input
                    className="form-input"
                    type="number"
                    name="prizeArgento"
                    min="0"
                    step="0.01"
                    placeholder="es. 80"
                  />
                </label>
                <label className="form-field">
                  <span className="form-label">Premio BRONZO — 3° (€)</span>
                  <input
                    className="form-input"
                    type="number"
                    name="prizeBronzo"
                    min="0"
                    step="0.01"
                    placeholder="es. 40"
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
            <p className="eyebrow">Classifica imponibile del periodo</p>
            <h2>{periodLabel(cFrom, cTo)}</h2>
          </div>
          <div className="topbar-actions range-switch">
            <label className="form-field">
              <span className="form-label">Da</span>
              <input
                className="form-input"
                type="date"
                value={cFrom}
                onChange={(e) => setCFrom(e.target.value)}
              />
            </label>
            <label className="form-field">
              <span className="form-label">A</span>
              <input
                className="form-input"
                type="date"
                value={cTo}
                onChange={(e) => setCTo(e.target.value)}
              />
            </label>
            <button
              type="button"
              className="primary-button"
              onClick={aggiornaClassifica}
            >
              Aggiorna
            </button>
          </div>
        </div>

        {ranking.length === 0 ? (
          <p className="empty-state">
            Nessun ordine attivo nel periodo {periodLabel(cFrom, cTo)}.
          </p>
        ) : (
          <>
            {venditeInRange.length > 0 && (
              <div className="classifica-block">
                <h3>
                  Gara miglior venditore — premi di categoria: Oro{" "}
                  {formatEur(venditeInRange[0].prize)}
                  {venditeInRange[0].prizeArgento
                    ? ` · Argento ${formatEur(venditeInRange[0].prizeArgento)}`
                    : ""}
                  {venditeInRange[0].prizeBronzo
                    ? ` · Bronzo ${formatEur(venditeInRange[0].prizeBronzo)}`
                    : ""}
                </h3>
                <div className="agent-list">
                  {ranking.slice(0, 3).map((r, i) => {
                    const medals = [
                      {
                        cat: "Oro",
                        val: venditeInRange[0].prize,
                        cls: "classifica-p-oro",
                      },
                      {
                        cat: "Argento",
                        val: venditeInRange[0].prizeArgento ?? 0,
                        cls: "classifica-p-argento",
                      },
                      {
                        cat: "Bronzo",
                        val: venditeInRange[0].prizeBronzo ?? 0,
                        cls: "classifica-p-bronzo",
                      },
                    ];
                    const medal = medals[i];
                    const ePrimo = i === 0;
                    const vincitoreValido =
                      ePrimo &&
                      (obiettivoInRange
                        ? r.imponibile >= targetObiettivo
                        : true);
                    const rowCls = [
                      "incentive-top-row",
                      "classifica-row",
                      vincitoreValido ? "classifica-ok" : "",
                      !vincitoreValido && ePrimo ? "classifica-top3" : "",
                      !vincitoreValido && i === 1 ? medal.cls : "",
                      !vincitoreValido && i === 2 ? medal.cls : "",
                    ]
                      .filter(Boolean)
                      .join(" ");
                    return (
                      <div key={r.id} className={rowCls}>
                        <span className="incentive-rank">{i + 1}º</span>
                        <span className="incentive-name">
                          <strong>{r.nome}</strong>
                          <small>
                            {ePrimo && vincitoreValido
                              ? `Vincitore — Premio ${medal.cat}: ${formatEur(
                                  medal.val
                                )}`
                              : ePrimo && obiettivoInRange
                                ? "Primo in classifica — obiettivo non raggiunto"
                                : medal.val > 0
                                  ? `Premio ${medal.cat}: ${formatEur(medal.val)}`
                                  : r.email}
                          </small>
                        </span>
                        <strong className="incentive-amount">
                          {formatEur(r.imponibile)}
                        </strong>
                      </div>
                    );
                  })}
                </div>
                {ranking[0] && obiettivoInRange &&
                  ranking[0].imponibile < targetObiettivo && (
                    <p className="form-error">
                      Nessun vincitore dell&apos;Oro per la gara miglior
                      venditore: il 1° in classifica non ha raggiunto
                      l&apos;obiettivo di {formatEur(targetObiettivo)} del
                      periodo.
                    </p>
                  )}
              </div>
            )}

            <div className="classifica-block">
              <h3>
                {obiettivoInRange
                  ? `Raggiungimento obiettivo di ${formatEur(
                      targetObiettivo
                    )} (in verde chi l'ha raggiunto)`
                  : "Classifica completa del periodo"}
              </h3>
              <div className="agent-list">
                {ranking.slice(0, 50).map((r, i) => {
                  const raggiunto = obiettivoInRange
                    ? r.imponibile >= targetObiettivo
                    : false;
                  return (
                    <div
                      key={r.id}
                      className={`incentive-top-row classifica-row${
                        raggiunto ? " classifica-ok" : ""
                      }`}
                    >
                      <span className="incentive-rank">{i + 1}º</span>
                      <span className="incentive-name">
                        <strong>{r.nome}</strong>
                        <small>
                          {r.email}
                          {raggiunto
                            ? " — obiettivo raggiunto"
                            : r.imponibile > 0
                              ? ""
                              : " — nessun ordine"}
                        </small>
                      </span>
                      <strong className="incentive-amount">
                        {formatEur(r.imponibile)}
                      </strong>
                    </div>
                  );
                })}
              </div>
            </div>
          </>
        )}
        <p className="settings-help">
          Riga verde: obiettivo raggiunto nel periodo. Per la gara miglior
          venditore il verde (vincitore) spetta al 1° solo se ha superato anche
          l&apos;obiettivo accoppiato dello stesso periodo; se la gara è
          individuale, vince il primo in classifica.
        </p>
      </section>
    </>
  );
}

