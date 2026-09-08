import { formatEur } from "@/lib/format";
import { periodoLabel, type GareAgenteView } from "@/lib/incentives";

/**
 * Contenuto della sezione "Obiettivi" lato agente: obiettivo del periodo e
 * gara miglior venditore. Se l'amministratore non ha creato nulla, mostra
 * il messaggio di vuoto.
 */
export function ObiettiviContent({ gareView }: { gareView: GareAgenteView }) {
  if (!gareView || gareView.gare.length === 0) {
    return (
      <section className="content-panel">
        <div className="panel-heading">
          <div>
            <p className="eyebrow">Obiettivi</p>
            <h2>Obiettivi del periodo</h2>
          </div>
        </div>
        <p className="empty-state">
          Al momento non sono presenti obiettivi.
        </p>
      </section>
    );
  }

  return (
    <div className="incentive-agent-stack">
      {gareView.gare.map((g) => {
        if (g.kind === "obiettivo") {
          const target = g.target || 0;
          const percent = Math.min(
            100,
            target > 0 ? Math.round((g.current / target) * 100) : 0
          );
          return (
            <section key={g.id} className="content-panel incentive-agent">
              <div className="panel-heading">
                <div>
                  <p className="eyebrow">Obiettivo del periodo</p>
                  <h2>{periodoLabel(gareView)}</h2>
                </div>
              </div>

              <div className="incentive-agent-grid">
                <div>
                  <span className="stat-label">
                    Obiettivo del periodo (imponibile)
                  </span>
                  <strong className="incentive-target">
                    {formatEur(target)}
                  </strong>
                </div>
                <div>
                  <span className="stat-label">Premio</span>
                  <strong className="incentive-prize">
                    {formatEur(g.prize)}
                  </strong>
                </div>
                <div>
                  <span className="stat-label">Raggiunto finora</span>
                  <strong>{formatEur(g.current)}</strong>
                </div>
              </div>

              <div
                className="incentive-track"
                role="progressbar"
                aria-valuenow={percent}
                aria-valuemin={0}
                aria-valuemax={100}
              >
                <span style={{ width: `${percent}%` }} />
              </div>
              <p className="incentive-percent">{percent}%</p>

              {g.reached ? (
                <p className="form-note incentive-ok" role="status">
                  Obiettivo raggiunto! Premi:{" "}
                  <strong>{formatEur(g.prize)}</strong>
                </p>
              ) : (
                <p className="incentive-missing">
                  Ti mancano{" "}
                  <strong>{formatEur(g.missing)}</strong> di imponibile per
                  raggiungere l&apos;obiettivo del mese.
                </p>
              )}
            </section>
          );
        }
        return (
          <section key={g.id} className="content-panel incentive-agent">
            <div className="panel-heading">
              <div>
                <p className="eyebrow">Gara miglior venditore</p>
                <h2>{periodoLabel(gareView)}</h2>
              </div>
            </div>

            <div className="incentive-agent-grid">
              <div>
                <span className="stat-label">Premio Oro — 1°</span>
                <strong className="incentive-prize">
                  {formatEur(g.prize)}
                </strong>
              </div>
              <div>
                <span className="stat-label">Premio Argento — 2°</span>
                <strong className="incentive-prize">
                  {g.prizeArgento ? formatEur(g.prizeArgento) : "—"}
                </strong>
              </div>
              <div>
                <span className="stat-label">Premio Bronzo — 3°</span>
                <strong className="incentive-prize">
                  {g.prizeBronzo ? formatEur(g.prizeBronzo) : "—"}
                </strong>
              </div>
            </div>

            <p className="incentive-missing">
              Il tuo imponibile nel periodo:{" "}
              <strong>{formatEur(g.current)}</strong>. I premi Oro, Argento e
              Bronzo vanno ai primi 3 agenti per imponibile del periodo (ordini
              non annullati).
            </p>
            {g.requisito ? (
              <p className="form-note incentive-ok" role="status">
                Per vincere devi raggiungere anche l&apos;obiettivo di{" "}
                <strong>{formatEur(g.requisito)}</strong> dello stesso periodo.
              </p>
            ) : (
              <p className="settings-help">
                Gara singola: vince chi totalizza il maggior imponibile del
                periodo.
              </p>
            )}
          </section>
        );
      })}
    </div>
  );
}
