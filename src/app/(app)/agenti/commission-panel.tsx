"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { saveCommissionRatesAction } from "./actions";
import {
  COMMISSION_GROUPS,
  type AgentCommissionData,
  type CommissionRates,
} from "@/lib/commission-groups";
import { formatEur } from "@/lib/format";

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

const MONTH_LABELS = [
  "Gennaio",
  "Febbraio",
  "Marzo",
  "Aprile",
  "Maggio",
  "Giugno",
  "Luglio",
  "Agosto",
  "Settembre",
  "Ottobre",
  "Novembre",
  "Dicembre",
];

/** "2026-08" -> "Agosto 2026" */
function monthLabel(month: string): string {
  const [year, m] = month.split("-");
  const index = Number(m) - 1;
  const name = MONTH_LABELS[index] ?? m;
  return `${name} ${year}`;
}

export function CommissionPanel({
  agents,
  initialRates,
  canEdit = true,
}: {
  agents: AgentCommissionData[];
  initialRates: CommissionRates;
  /** FALSE per i sub-amministratori (solo lettura). */
  canEdit?: boolean;
}) {
  const [rates, setRates] = useState<CommissionRates>(initialRates);
  const [, startTransition] = useTransition();
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  // Filtro mese/anno ("YYYY-MM"); vuoto = tutti gli ordini.
  const [month, setMonth] = useState("");

  function setRate(key: keyof CommissionRates, raw: string) {
    const n = Number(raw);
    const value = Number.isFinite(n) ? Math.min(100, Math.max(0, n)) : 0;
    setRates((prev) => ({ ...prev, [key]: value }));
    setMessage(null);
  }

  // Mesi/anni presenti negli ordini (per il menu di filtro), dal piu' recente.
  const availableMonths = useMemo(() => {
    const set = new Set<string>();
    for (const agent of agents) {
      for (const order of agent.orders) {
        const m = String(order.data ?? "").slice(0, 7);
        if (m.length === 7) set.add(m);
      }
    }
    return Array.from(set).sort().reverse();
  }, [agents]);

  /** Ordini dell'agente nel mese selezionato (tutti se month vuoto). */
  function ordersFor(agent: AgentCommissionData): AgentCommissionData["orders"] {
    if (!month) return agent.orders;
    return agent.orders.filter((o) => String(o.data ?? "").startsWith(month));
  }

  /** Imponibile per gruppo degli ordini filtrati dell'agente. */
  function groupsFor(agent: AgentCommissionData): CommissionRates {
    const groups: CommissionRates = { occhiali: 0, espositori: 0, astucci: 0 };
    for (const o of ordersFor(agent)) {
      groups.occhiali += o.groups.occhiali ?? 0;
      groups.espositori += o.groups.espositori ?? 0;
      groups.astucci += o.groups.astucci ?? 0;
    }
    return groups;
  }

  /** Imponibile (merce) totale degli ordini filtrati dell'agente. */
  function imponibileFor(agent: AgentCommissionData): number {
    return ordersFor(agent).reduce((sum, o) => sum + (o.imponibile ?? 0), 0);
  }

  /** Provvigione (euro) sugli ordini filtrati dell'agente. */
  function commissionFor(agent: AgentCommissionData): number {
    const g = groupsFor(agent);
    const sum =
      g.occhiali * rates.occhiali +
      g.espositori * rates.espositori +
      g.astucci * rates.astucci;
    return round2(sum / 100);
  }

  const totalOrders = agents.reduce((sum, a) => sum + ordersFor(a).length, 0);
  const totalImponibile = agents.reduce(
    (sum, a) => sum + imponibileFor(a),
    0
  );

  function handleSave() {
    setSaving(true);
    startTransition(async () => {
      const res = await saveCommissionRatesAction(rates);
      setSaving(false);
      setMessage(
        res.success
          ? "Provvigioni salvate."
          : res.error ?? "Errore durante il salvataggio."
      );
    });
  }

  return (
    <>
      <section className="stats-grid commission-stats" aria-label="Riepilogo ordini">
        <article className="stat-card">
          <span className="stat-label">Ordini complessivi</span>
          <strong>{totalOrders}</strong>
          <span className="stat-note">Effettuati da tutti gli agenti</span>
        </article>
        <article className="stat-card">
          <span className="stat-label">Agenti attivi</span>
          <strong>{agents.filter((a) => a.stato === "attivo").length}</strong>
          <span className="stat-note">Registrati con stato attivo</span>
        </article>
        <article className="stat-card">
          <span className="stat-label">Totale imponibile</span>
          <strong>{formatEur(totalImponibile)}</strong>
          <span className="stat-note">Solo merce, senza spedizione e IVA</span>
        </article>
      </section>

      <div className="commission-grid">
      <section className="content-panel">
        <div className="panel-heading">
          <div>
            <p className="eyebrow">Agenti registrati</p>
            <h2>Ordini e provvigioni per agente</h2>
            <p className="settings-help">
              Imponibile = solo merce (escluse spese di spedizione e IVA).
              Seleziona un mese per vedere quanto corrispondere a ogni agente.
            </p>
          </div>
        </div>

        <div className="commission-month-filter">
          <label className="form-field">
            <span className="form-label">Filtra per mese/anno</span>
            <select
              className="form-input"
              value={month}
              onChange={(e) => setMonth(e.target.value)}
            >
              <option value="">Tutti i mesi</option>
              {availableMonths.map((m) => (
                <option key={m} value={m}>
                  {monthLabel(m)}
                </option>
              ))}
            </select>
          </label>
          {month && (
            <p className="commission-month-note">
              Mostrati solo gli ordini di{" "}
              <strong>{monthLabel(month)}</strong>. Le provvigioni sotto si
              riferiscono a quel mese.
            </p>
          )}
        </div>

        {agents.length === 0 ? (
          <p className="empty-state">
            Nessun agente attivo trovato. Gli agenti registrati (stato
            &quot;attivo&quot;) appariranno qui con i loro ordini.
          </p>
        ) : (
          <div className="agent-list">
            {agents.map((agent) => (
              <details key={agent.id} className="agent-folder">
                <summary className="agent-folder-head">
                  <span className="agent-folder-title">
                    <span className="agent-folder-icon" aria-hidden="true">
                      📁
                    </span>
                    <span className="agent-card-id">
                      <strong>
                        {agent.nome}
                        {agent.stato !== "attivo" && (
                          <span className="agent-state-tag">disattivato</span>
                        )}
                      </strong>
                      <span className="agent-email">{agent.email}</span>
                    </span>
                  </span>
                  <span className="agent-head-right">
                    <span className="agent-orders-count">
                      {ordersFor(agent).length}{" "}
                      {ordersFor(agent).length === 1 ? "ordine" : "ordini"}
                    </span>
                    <span className="agent-total">
                      {formatEur(imponibileFor(agent))}
                    </span>
                  </span>
                </summary>

                <div className="agent-folder-body">
                  {/* Riepilogo a colpo d'occhio */}
                  <div className="agent-folder-stats">
                    <span>
                      Ordini effettuati
                      <strong>{ordersFor(agent).length}</strong>
                    </span>
                    <span>
                      Imponibile totale
                      <strong>{formatEur(imponibileFor(agent))}</strong>
                    </span>
                    <span>
                      Provvigione
                      <strong>{formatEur(commissionFor(agent))}</strong>
                    </span>
                  </div>

                  {/* Totale provvigioni da corrispondere (periodo filtrato) */}
                  <div className="agent-commission-banner">
                    <span>
                      TOTALE PROVVIGIONI
                      {month ? ` — ${monthLabel(month)}` : ""}
                    </span>
                    <strong>{formatEur(commissionFor(agent))}</strong>
                  </div>

                  {ordersFor(agent).length === 0 ? (
                    <p className="empty-state">
                      {month
                        ? "Nessun ordine in questo mese."
                        : "Nessun ordine trasmesso."}
                    </p>
                  ) : (
                    <div className="agent-orders">
                      <table className="commission-table">
                        <thead>
                          <tr>
                            <th>N° ordine</th>
                            <th>Data</th>
                            <th>Cliente</th>
                            <th>Imponibile</th>
                          </tr>
                        </thead>
                        <tbody>
                          {ordersFor(agent).map((order) => (
                            <tr key={order.id}>
                              <td>
                                <Link
                                  href={`/ordini/${order.id}`}
                                  className="order-link"
                                  title={`Apri il dettaglio dell'ordine ${order.numero}`}
                                >
                                  {order.numero}
                                </Link>
                              </td>
                              <td>{order.data}</td>
                              <td>{order.cliente ?? "—"}</td>
                              <td>{formatEur(order.imponibile)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                      <p className="settings-help">
                        Clicca sul numero dell&apos;ordine per aprirne il
                        dettaglio.
                      </p>
                    </div>
                  )}

                  <div className="agent-groups">
                    {COMMISSION_GROUPS.map((group) => (
                      <div key={group.key} className="agent-group">
                        <span>{group.label}</span>
                        <strong>
                          {formatEur(groupsFor(agent)[group.key])}
                        </strong>
                        <small>
                          {rates[group.key] > 0 ? `${rates[group.key]}%` : ""}
                        </small>
                      </div>
                    ))}
                    <div className="agent-group agent-commission">
                      <span>PROVVIGIONE</span>
                      <strong>{formatEur(commissionFor(agent))}</strong>
                    </div>
                  </div>
                </div>
              </details>
            ))}
          </div>
        )}
      </section>

      <section className="content-panel commission-side">
        <div className="panel-heading">
          <div>
            <p className="eyebrow">Calcolo provvigioni</p>
            <h2>Valore per gruppo</h2>
            <p className="settings-help">
              Percentuale di provvigione applicata all&apos;imponibile di ogni
              gruppo di articoli.
            </p>
          </div>
        </div>

        <div className="commission-fields">
          {COMMISSION_GROUPS.map((group) => (
            <label key={group.key} className="form-field">
              <span className="form-label">{group.label}</span>
              <div className="commission-input">
                <input
                  type="number"
                  min={0}
                  max={100}
                  step="0.5"
                  value={rates[group.key]}
                  onChange={(e) => setRate(group.key, e.target.value)}
                  disabled={!canEdit}
                />
                <span>%</span>
              </div>
            </label>
          ))}
        </div>

        {canEdit && (
          <div className="form-actions commission-save">
            <button
              type="button"
              className="primary-button"
              onClick={handleSave}
              disabled={saving}
            >
              {saving ? "Salvataggio…" : "Salva provvigioni"}
            </button>
          </div>
        )}
        {message && (
          <p
            className={
              message === "Provvigioni salvate." ? "form-note" : "form-error"
            }
            role="status"
          >
            {message}
          </p>
        )}
        <p className="settings-help">
          La provvigione di ogni agente si aggiorna in tempo reale mentre
          modifichi i valori.
        </p>
      </section>
      </div>
    </>
  );
}

