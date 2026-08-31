import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentAgent, getCurrentAdmin } from "@/lib/supabase/session";
import {
  getDashboardStats,
  getRecentOrders,
  countUnreadAdminOrders,
} from "@/lib/orders";
import { getReadOrderIds } from "@/lib/orders/read";
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
