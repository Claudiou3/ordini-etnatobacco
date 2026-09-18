"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  COMMISSION_GROUPS,
  type AgentCommissionView,
  type ClientCommissionData,
  type CommissionRates,
} from "@/lib/commission-groups";
import { formatEur, formatDate } from "@/lib/format";

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

/**
 * Mese corrente in formato "YYYY-MM" calcolato sul fuso ITALIANO
 * (Europe/Rome). Cosi' il valore e' lo stesso sia sul server (che gira in UTC)
 * sia nel browser: la sezione si apre sempre sul mese in corso e non ci sono
 * disallineamenti fra HTML iniziale e idratazione.
 */
function currentMonthKey(): string {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Rome",
    year: "numeric",
    month: "2-digit",
  }).formatToParts(new Date());
  const year = parts.find((p) => p.type === "year")?.value ?? "";
  const month = parts.find((p) => p.type === "month")?.value ?? "";
  return year && month ? `${year}-${month}` : "";
}

/** Riga ordine come arriva dalla vista provvigioni. */
type CommissionOrder = ClientCommissionData["orders"][number];

/**
 * Ordini che ricadono nel periodo scelto: mese ("YYYY-MM") e/o intervallo di
 * date ("YYYY-MM-DD"). Senza filtri ritorna tutti gli ordini.
 */
function ordersInPeriod(
  orders: CommissionOrder[],
  month: string,
  dateFrom: string,
  dateTo: string
): CommissionOrder[] {
  return orders.filter((o) => {
    const data = String(o.data ?? "");
    if (month && !data.startsWith(month)) return false;
    if (dateFrom && data < dateFrom) return false;
    if (dateTo && data > dateTo) return false;
    return true;
  });
}

/**
 * Provvigioni LATO AGENTE, raggruppate per cliente: mostra la provvigione
 * calcolata su ogni singolo ordine e il totale complessivo.
 * All'apertura il periodo selezionato e' il MESE CORRENTE (l'elenco resta
 * corto e i totali riguardano il mese in corso); restano comunque disponibili
 * il filtro per mese/anno, "Tutti i mesi" e l'intervallo di date.
 */
export function AgentCommissionPanel({ view }: { view: AgentCommissionView }) {
  const { clients, rates } = view;
  // Valore iniziale = mese corrente (calcolato una sola volta, sul fuso italiano).
  const [month, setMonth] = useState(currentMonthKey);
  // Filtro per intervallo di date ("YYYY-MM-DD").
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  const availableMonths = useMemo(() => {
    const set = new Set<string>();
    for (const client of clients) {
      for (const order of client.orders) {
        const m = String(order.data ?? "").slice(0, 7);
        if (m.length === 7) set.add(m);
      }
    }
    return Array.from(set).sort().reverse();
  }, [clients]);

  /**
   * Mesi proposti dal filtro: quelli in cui ci sono ordini PIU' il mese
   * corrente, cosi' la tendina mostra sempre la voce selezionata all'apertura
   * anche se in questo mese non e' ancora stato emesso nessun ordine.
   */
  const monthOptions = useMemo(() => {
    const set = new Set(availableMonths);
    set.add(currentMonthKey());
    return Array.from(set).sort().reverse();
  }, [availableMonths]);

  /** Etichetta del periodo filtrato (mese oppure intervallo date). */
  function periodLabel(): string {
    if (month) return monthLabel(month);
    if (dateFrom && dateTo) return `dal ${formatDate(dateFrom)} al ${formatDate(dateTo)}`;
    if (dateFrom) return `dal ${formatDate(dateFrom)}`;
    if (dateTo) return `fino al ${formatDate(dateTo)}`;
    return "";
  }

  function ordersFor(client: ClientCommissionData) {
    return ordersInPeriod(client.orders, month, dateFrom, dateTo);
  }

  function imponibileFor(client: ClientCommissionData): number {
    return ordersFor(client).reduce((s, o) => s + (o.imponibile ?? 0), 0);
  }

  function commissionFor(client: ClientCommissionData): number {
    return ordersFor(client).reduce((s, o) => s + (o.commissione ?? 0), 0);
  }

  function groupsFor(client: ClientCommissionData): CommissionRates {
    const groups: CommissionRates = { occhiali: 0, espositori: 0, astucci: 0 };
    for (const o of ordersFor(client)) {
      groups.occhiali += o.groups?.occhiali ?? 0;
      groups.espositori += o.groups?.espositori ?? 0;
      groups.astucci += o.groups?.astucci ?? 0;
    }
    return groups;
  }

  /**
   * Clienti mostrati nell'elenco: solo quelli con ALMENO UN ORDINE nel periodo
   * selezionato. All'apertura (mese corrente) la sezione resta quindi corta e
   * non si riempie di righe vuote; con "Tutti i mesi" si vedono tutti i clienti
   * (comportamento di sempre).
   */
  const visibleClients = clients.filter(
    (c) => ordersInPeriod(c.orders, month, dateFrom, dateTo).length > 0
  );

  const totalOrders = visibleClients.reduce((s, c) => s + ordersFor(c).length, 0);
  const totalImponibile = visibleClients.reduce(
    (s, c) => s + imponibileFor(c),
    0
  );
  const totalCommission = visibleClients.reduce(
    (s, c) => s + commissionFor(c),
    0
  );

  return (
    <section className="content-panel" aria-label="Provvigioni per cliente">
      <div className="panel-heading">
        <div>
          <p className="eyebrow">Le tue provvigioni</p>
          <h2>Ordini e provvigioni per cliente</h2>
          <p className="settings-help">
            Imponibile = solo merce (escluse spese di spedizione e IVA).
            All&apos;apertura vedi il <strong>mese corrente</strong>: puoi
            scegliere un altro mese/anno, &quot;Tutti i mesi&quot; oppure un
            intervallo di date per vedere quanto spetta per ogni cliente.
          </p>
        </div>
      </div>

      <div className="stats-grid commission-stats" aria-label="Riepilogo provvigioni">
        <article className="stat-card">
          <span className="stat-label">Ordini complessivi</span>
          <strong>{totalOrders}</strong>
          <span className="stat-note">Effettuati da te</span>
        </article>
        <article className="stat-card">
          <span className="stat-label">Clienti</span>
          <strong>{visibleClients.length}</strong>
          <span className="stat-note">
            {month || dateFrom || dateTo
              ? "Con ordini nel periodo"
              : "Con ordini trasmessi"}
          </span>
        </article>
        <article className="stat-card">
          <span className="stat-label">Totale imponibile</span>
          <strong>{formatEur(totalImponibile)}</strong>
          <span className="stat-note">Solo merce, senza spedizione e IVA</span>
        </article>
        <article className="stat-card">
          <span className="stat-label">Totale provvigioni</span>
          <strong>{formatEur(totalCommission)}</strong>
          <span className="stat-note">
            {periodLabel() || "Su tutti gli ordini"}
          </span>
        </article>
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
            {monthOptions.map((m) => (
              <option key={m} value={m}>
                {monthLabel(m)}
              </option>
            ))}
          </select>
        </label>

        <div className="commission-range">
          <label className="form-field">
            <span className="form-label">Dal</span>
            <input
              type="date"
              className="form-input"
              value={dateFrom}
              max={dateTo || undefined}
              onChange={(e) => setDateFrom(e.target.value)}
            />
          </label>
          <label className="form-field">
            <span className="form-label">Al</span>
            <input
              type="date"
              className="form-input"
              value={dateTo}
              min={dateFrom || undefined}
              onChange={(e) => setDateTo(e.target.value)}
            />
          </label>
          {(month || dateFrom || dateTo) && (
            <button
              type="button"
              className="secondary-button"
              onClick={() => {
                setMonth("");
                setDateFrom("");
                setDateTo("");
              }}
            >
              Azzera filtri
            </button>
          )}
        </div>

        {(month || dateFrom || dateTo) && (
          <p className="commission-month-note">
            Mostrati solo gli ordini del periodo{" "}
            <strong>{periodLabel()}</strong>.
          </p>
        )}
      </div>


      {visibleClients.length === 0 ? (
        <p className="empty-state">
          {month || dateFrom || dateTo
            ? `Nessun ordine nel periodo${
                periodLabel() ? ` ${periodLabel()}` : ""
              }: scegli un altro mese/anno oppure "Tutti i mesi".`
            : "Nessun ordine registrato: i tuoi ordini appariranno qui con le provvigioni per cliente."}
        </p>
      ) : (
        <div className="agent-list">
          {visibleClients.map((client) => (
            <details key={client.cliente} className="agent-folder">
              <summary className="agent-folder-head">
                <span className="agent-folder-title">
                  <span className="agent-folder-icon" aria-hidden="true">
                    📁
                  </span>
                  <span className="agent-card-id">
                    <strong>{client.cliente}</strong>
                    <span className="agent-email">
                      {ordersFor(client).length}{" "}
                      {ordersFor(client).length === 1 ? "ordine" : "ordini"}
                    </span>
                  </span>
                </span>
                <span className="agent-head-right">
                  <span className="agent-orders-count">
                    {formatEur(imponibileFor(client))}
                  </span>
                  <span className="agent-total">
                    {formatEur(commissionFor(client))}
                  </span>
                </span>
              </summary>

              <div className="agent-folder-body">
                <div className="agent-folder-stats">
                  <span>
                    Ordini effettuati
                    <strong>{ordersFor(client).length}</strong>
                  </span>
                  <span>
                    Imponibile totale
                    <strong>{formatEur(imponibileFor(client))}</strong>
                  </span>
                  <span>
                    Provvigione
                    <strong>{formatEur(commissionFor(client))}</strong>
                  </span>
                </div>

                <div className="agent-commission-banner">
                  <span>
                    TOTALE PROVVIGIONI
                    {periodLabel() ? ` — ${periodLabel()}` : ""}
                  </span>
                  <strong>{formatEur(commissionFor(client))}</strong>
                </div>

                {ordersFor(client).length === 0 ? (
                  <p className="empty-state">
                    {month || dateFrom || dateTo
                      ? "Nessun ordine in questo periodo."
                      : "Nessun ordine trasmesso."}
                  </p>
                ) : (
                  <div className="agent-orders">
                    <table className="commission-table">
                      <thead>
                        <tr>
                          <th>N° ordine</th>
                          <th>Data</th>
                          <th>Imponibile</th>
                          <th>Provvigione</th>
                        </tr>
                      </thead>
                      <tbody>
                        {ordersFor(client).map((order) => (
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
                            <td>{formatEur(order.imponibile)}</td>
                            <td>{formatEur(order.commissione)}</td>
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
                        {formatEur(groupsFor(client)[group.key])}
                      </strong>
                      <small>
                        {rates[group.key] > 0 ? `${rates[group.key]}%` : ""}
                      </small>
                    </div>
                  ))}
                  <div className="agent-group agent-commission">
                    <span>PROVVIGIONE</span>
                    <strong>{formatEur(commissionFor(client))}</strong>
                  </div>
                </div>
              </div>
            </details>
          ))}
        </div>
      )}
    </section>
  );
}

