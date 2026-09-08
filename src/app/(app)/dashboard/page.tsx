import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentAgent, getCurrentAdmin } from "@/lib/supabase/session";
import {
  getDashboardStats,
  getRecentOrders,
  countUnreadAdminOrders,
} from "@/lib/orders";
import { getReadOrderIds } from "@/lib/orders/read";
import { getAgentIncentiveView, monthLabel } from "@/lib/incentive";
import { formatEur, formatDate } from "@/lib/format";
import { LogoutButton } from "../logout-button";
import { NewOrderPopup } from "../console/new-order-popup";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const agent = await getCurrentAgent();
  if (!agent) redirect("/login");

  const [stats, recentOrders, isAdmin] = await Promise.all([
    getDashboardStats(agent.id),
    getRecentOrders(agent.id),
    getCurrentAdmin(),
  ]);

  // Lato amministratore: pop-up "Nuovo ordine" e anteprima con ordini
  // non letti evidenziati in rosso (come in "Ordini ricevuti").
  let recentOrdersWithRead = recentOrders;
  let unreadCount = 0;
  if (isAdmin) {
    const [readSet, count] = await Promise.all([
      getReadOrderIds(),
      countUnreadAdminOrders(),
    ]);
    recentOrdersWithRead = recentOrders.map((o) => ({
      ...o,
      read: readSet.has(o.id),
    }));
    unreadCount = count;
  }

  // Lato agente: piano incentivante (obiettivo del mese + avanzamento).
  let incentiveView: Awaited<
    ReturnType<typeof getAgentIncentiveView>
  > = null;
  if (!isAdmin) {
    incentiveView = await getAgentIncentiveView(agent.id);
  }
  const incentivePercent = incentiveView
    ? Math.min(
        100,
        Math.round((incentiveView.current / incentiveView.plan.target) * 100)
      )
    : 0;
  const incentiveReached = Boolean(
    incentiveView && incentiveView.current >= incentiveView.plan.target
  );

  return (
    <>
      {isAdmin && <NewOrderPopup initialUnread={unreadCount} />}
      <header className="topbar">
        <div>
          <p className="eyebrow">
            {isAdmin ? "Area amministratore" : "Area agente"}
          </p>
          <h1>Buongiorno, {agent.nome.split(" ")[0]}</h1>
        </div>
        <LogoutButton />
      </header>

      <section className="welcome-panel">
        <div>
          <p className="eyebrow light">Gestione ordini</p>
          <h2>Pronto per il prossimo ordine?</h2>
          <p>Trova un cliente, compila il carrello e genera il documento Excel in pochi passaggi.</p>
        </div>
        <Link href="/nuovo-ordine" className="primary-button">
          Nuovo ordine <span aria-hidden="true">-&gt;</span>
        </Link>
      </section>

      {incentiveView && (
        <section className="content-panel incentive-agent">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">Piano incentivante</p>
              <h2>{monthLabel(incentiveView.plan.month)}</h2>
            </div>
          </div>

          <div className="incentive-agent-grid">
            <div>
              <span className="stat-label">Obiettivo del mese (imponibile)</span>
              <strong className="incentive-target">
                {formatEur(incentiveView.plan.target)}
              </strong>
            </div>
            <div>
              <span className="stat-label">Premio</span>
              <strong className="incentive-prize">
                {formatEur(incentiveView.plan.prize)}
              </strong>
            </div>
            <div>
              <span className="stat-label">Raggiunto finora</span>
              <strong>{formatEur(incentiveView.current)}</strong>
            </div>
          </div>

          <div
            className="incentive-track"
            role="progressbar"
            aria-valuenow={incentivePercent}
            aria-valuemin={0}
            aria-valuemax={100}
          >
            <span style={{ width: `${incentivePercent}%` }} />
          </div>
          <p className="incentive-percent">{incentivePercent}%</p>

          {incentiveReached ? (
            <p className="form-note incentive-ok" role="status">
              🎉 Obiettivo raggiunto! Premi:{" "}
              <strong>{formatEur(incentiveView.plan.prize)}</strong>
            </p>
          ) : (
            <p className="incentive-missing">
              Ti mancano{" "}
              <strong>{formatEur(incentiveView.missing)}</strong> di imponibile
              per raggiungere l&apos;obiettivo del mese.
            </p>
          )}
        </section>
      )}

      <section className="stats-grid" aria-label="Riepilogo">
        <article className="stat-card">
          <span className="stat-label">Ordini questo mese</span>
          <strong>{stats.ordersMonth}</strong>
          <span className="stat-note">Registrati nel database</span>
        </article>
        <article className="stat-card">
          <span className="stat-label">Valore ordini mese</span>
          <strong>{formatEur(stats.valueMonth)}</strong>
          <span className="stat-note">Imponibile + trasporto</span>
        </article>
      </section>

      <section className="workspace-grid">
        <article className="content-panel">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">Attività recente</p>
              <h2>Ultimi ordini</h2>
            </div>
            <Link href="/ordini">Vedi tutto</Link>
          </div>
          {recentOrdersWithRead.length === 0 ? (
            <p className="empty-state">
              Nessun ordine registrato. Quando creerai un ordine lo troverai qui.
            </p>
          ) : (
            <div className="order-list">
              {recentOrdersWithRead.map((order) => (
                <Link
                  key={order.id}
                  href={`/ordini/${order.id}`}
                  className={`order-row${
                    isAdmin && order.read === false ? " is-unread" : ""
                  }${order.stato === "annullato" ? " is-cancelled" : ""}`}
                >
                  <div className="order-customer">
                    <span className="customer-icon" aria-hidden="true">
                      {(order.customers?.ragione_sociale ?? "?").slice(0, 1)}
                    </span>
                    <span>
                      <strong>{order.customers?.ragione_sociale ?? "Cliente sconosciuto"}</strong>
                      <small>{formatDate(order.data_ordine)}</small>
                      {order.stato === "annullato" && (
                        <small className="order-cancel-reason">
                          ✕ {order.annullamento_motivo ?? "Ordine annullato"}
                        </small>
                      )}
                    </span>
                  </div>
                  <span
                    className={`order-status${
                      order.stato === "annullato"
                        ? " order-status-cancelled"
                        : ""
                    }`}
                  >
                    {order.stato === "annullato"
                      ? "Annullato"
                      : order.file_url
                        ? "Inviato"
                        : "Registrato"}
                  </span>
                  <strong className="order-total">{formatEur(order.totale)}</strong>
                  <span className="row-arrow" aria-hidden="true">
                    -&gt;
                  </span>
                </Link>
              ))}
            </div>
          )}
        </article>

        <article className="content-panel clients-panel">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">Anagrafica</p>
              <h2>Clienti</h2>
            </div>
          </div>
          <Link href="/clienti" className="secondary-button">
            Apri anagrafica
          </Link>
        </article>
      </section>
    </>
  );
}
