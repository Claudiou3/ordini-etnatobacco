import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getCurrentAgent, getCurrentAdmin } from "@/lib/supabase/session";
import { getOrderDetail } from "@/lib/orders";
import { getReadOrderIds } from "@/lib/orders/read";
import { formatEur, formatDate } from "@/lib/format";
import { PrintTrigger } from "../print-trigger";
import { OrderCancelControl } from "../order-cancel-control";
import { ConfirmOrderButton } from "../confirm-order-button";

export const dynamic = "force-dynamic";

export default async function OrderDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ print?: string }>;
}) {
  const agent = await getCurrentAgent();
  if (!agent) redirect("/login");

  const { id } = await params;
  const sp = await searchParams;
  const printMode = sp.print === "1";
  const detail = await getOrderDetail(id, agent.id);
  if (!detail) notFound();

  const { order, items } = detail;
  const admin = await getCurrentAdmin();
  // "Confermato" = ordine che l'amministratore ha confermato esplicitamente
  // (pulsante "Confermato"). Aprire l'ordine NON basta piu'.
  const readSet = await getReadOrderIds();
  const confirmed = readSet.has(order.id);
  const canConfirm = Boolean(admin && !admin.subAdmin);
  const isCancelled = order.stato === "annullato";
  const cliente = order.customers?.ragione_sociale ?? "Cliente sconosciuto";

  return (
    <>
      {printMode && <PrintTrigger />}
      <header className="topbar">
        <div>
          <p className="eyebrow">
            <Link href="/ordini">← Tutti gli ordini</Link>
          </p>
          <h1>Ordine {order.numero_ordine}</h1>
        </div>
        <OrderCancelControl
          orderId={order.id}
          numeroOrdine={order.numero_ordine}
          cliente={cliente}
          isCancelled={isCancelled}
          canManage={admin !== null && !admin.subAdmin}
        />
      </header>

      {isCancelled && (
        <section className="content-panel cancelled-banner">
          <p className="form-error" role="alert">
            <strong>ORDINE ANNULLATO</strong> —{" "}
            {order.annullamento_motivo ?? "Nessuna motivazione inserita."}
          </p>
        </section>
      )}

      <section className="content-panel">
        <dl className="detail-grid">
          <div>
            <dt>Cliente</dt>
            <dd>{cliente}</dd>
          </div>
          <div>
            <dt>P.IVA / Codice fiscale</dt>
            <dd>
              {[order.partita_iva, order.codice_fiscale]
                .filter(Boolean)
                .join(" / ") || "—"}
            </dd>
          </div>
          <div>
            <dt>Data ordine</dt>
            <dd>{formatDate(order.data_ordine)}</dd>
          </div>
          <div>
            <dt>Pagamento</dt>
            <dd>{order.pagamento ?? "—"}</dd>
          </div>
          {order.file_url && (
            <div>
              <dt>File Excel</dt>
              <dd>
                <a href={order.file_url} download>
                  Scarica
                </a>
              </dd>
            </div>
          )}
        </dl>
      </section>

      <section className="content-panel">
        <div className="panel-heading">
          <div>
            <p className="eyebrow">Dettaglio</p>
            <h2>Articoli</h2>
          </div>
        </div>

        {items.length === 0 ? (
          <p className="empty-state">Nessun articolo in questo ordine.</p>
        ) : (
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>#</th>
                  <th>Descrizione</th>
                  <th>Diottria</th>
                  <th>Prezzo</th>
                  <th>Sconto</th>
                  <th>IVA</th>
                  <th>Qtà</th>
                  <th>Subtotale</th>
                </tr>
              </thead>
              <tbody>
                {items.map((item) => (
                  <tr key={item.id}>
                    <td>{item.product_row ?? "—"}</td>
                    <td>{item.descrizione}</td>
                    <td>{item.diottria ?? "—"}</td>
                    <td>{formatEur(item.prezzo)}</td>
                    <td>{item.sconto ? formatEur(item.sconto) : "—"}</td>
                    <td>{item.iva}%</td>
                    <td>{item.quantita}</td>
                    <td>{formatEur(item.subtotale)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <dl className="totals-box">
          <div>
            <dt>Imponibile</dt>
            <dd>{formatEur(order.imponibile)}</dd>
          </div>
          <div>
            <dt>Trasporto</dt>
            <dd>{formatEur(order.trasporto)}</dd>
          </div>
          <div>
            <dt>IVA</dt>
            <dd>{formatEur(order.iva)}</dd>
          </div>
          <div className="grand">
            <dt>Totale</dt>
            <dd>{formatEur(order.totale)}</dd>
          </div>
        </dl>
      </section>

      {canConfirm && (
        <section className="content-panel">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">Conferma ordine</p>
              <h2>
                {confirmed
                  ? "Ordine confermato"
                  : "Ordine non ancora confermato"}
              </h2>
            </div>
          </div>
          <ConfirmOrderButton orderId={order.id} confirmed={confirmed} />
        </section>
      )}
    </>
  );
}
