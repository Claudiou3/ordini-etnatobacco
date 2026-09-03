"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { OrderListItem } from "@/lib/types";
import { sortOrdersByArrival } from "@/lib/orders/sort";
import { formatEur, formatDate } from "@/lib/format";
import { deleteOrderAction, cancelOrderAction, restoreOrderAction } from "./actions";
import { ConfirmDialog } from "./confirm-dialog";

/**
 * Elenco ordini con filtri: ricerca libera (ragione sociale, P.IVA, CF),
 * intervallo di date e pulsante "Vedi tutti" per mostrare tutti gli ordini
 * in ORDINE DI ARRIVO (l'ultimo trasmesso e' il primo). Ogni riga apre il
 * dettaglio ordine. Gli ordini ANNULLATI dall'amministratore compaiono in
 * grigio scuro con la motivazione e non generano provvigioni.
 */
export function OrdersFilter({
  orders,
  isAdmin = false,
  canManage = false,
}: {
  orders: OrderListItem[];
  isAdmin?: boolean;
  /** TRUE solo per l'amministratore PRINCIPALE (i sub-admin vedono ma non gestiscono). */
  canManage?: boolean;
}) {
  const [search, setSearch] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  // Lato amministratore: filtro Confermati / Non Confermati / Eliminati.
  const [statusFilter, setStatusFilter] = useState<
    "all" | "confirmed" | "unconfirmed" | "deleted"
  >("all");
  const [showAll, setShowAll] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);
  // Ordine in attesa di conferma eliminazione (modale "Sei certo…?").
  const [pendingDelete, setPendingDelete] = useState<OrderListItem | null>(null);
  // Ordine in attesa di ANNULLAMENTO (modale con motivazione).
  const [pendingCancel, setPendingCancel] = useState<OrderListItem | null>(null);
  const [cancelMotivo, setCancelMotivo] = useState("");
  const [cancelling, setCancelling] = useState(false);
  const [restoring, setRestoring] = useState<string | null>(null);
  const router = useRouter();

  async function confirmDelete() {
    if (!pendingDelete) return;
    const order = pendingDelete;
    setDeleting(order.id);
    const res = await deleteOrderAction(order.id);
    setDeleting(null);
    setPendingDelete(null);
    if (res.error) {
      window.alert(res.error);
      return;
    }
    router.refresh();
  }

  async function confirmCancel() {
    if (!pendingCancel) return;
    const order = pendingCancel;
    const motivo = cancelMotivo.trim();
    if (!motivo) {
      window.alert("Inserisci la motivazione dell'annullamento.");
      return;
    }
    setCancelling(true);
    const res = await cancelOrderAction(order.id, motivo);
    setCancelling(false);
    if (res.error) {
      window.alert(res.error);
      return;
    }
    setPendingCancel(null);
    setCancelMotivo("");
    router.refresh();
  }

  async function confirmRestore(order: OrderListItem) {
    const ok = window.confirm(
      `Ripristinare l'ordine ${order.numero_ordine}? Tornerà "attivo" e le provvigioni verranno di nuovo conteggiate.`
    );
    if (!ok) return;
    setRestoring(order.id);
    const res = await restoreOrderAction(order.id);
    setRestoring(null);
    if (res.error) {
      window.alert(res.error);
      return;
    }
    router.refresh();
  }

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const filtered = orders.filter((o) => {
      if (q) {
        const haystack = [
          o.customers?.ragione_sociale ?? "",
          o.partita_iva ?? "",
          o.codice_fiscale ?? "",
          o.numero_ordine ?? "",
        ]
          .join(" ")
          .toLowerCase();
        if (!haystack.includes(q)) return false;
      }
      if (dateFrom && o.data_ordine < dateFrom) return false;
      if (dateTo && o.data_ordine > dateTo) return false;
      // Lato amministratore: stato Confermato / Non Confermato / Eliminato.
      if (statusFilter === "deleted") {
        return o.stato === "annullato";
      }
      if (isAdmin && typeof o.read === "boolean") {
        if (statusFilter === "confirmed" && !o.read) return false;
        if (statusFilter === "unconfirmed" && o.read) return false;
      }
      return true;
    });
    // Ordine di ARRIVO: l'ultimo ordine trasmesso e' il primo della lista.
    return sortOrdersByArrival(filtered);
  }, [orders, search, dateFrom, dateTo, isAdmin, statusFilter]);

  // Amministratore: la tendina decide cosa mostrare.
  // Agente: comportamento storico (recenti / Vedi tutti).
  const visible = isAdmin ? filtered : showAll ? filtered : filtered.slice(0, 10);
  const listHeading = isAdmin
    ? statusFilter === "confirmed"
      ? "Ordini confermati"
      : statusFilter === "unconfirmed"
        ? "Ordini non confermati"
        : statusFilter === "deleted"
          ? "Ordini eliminati"
          : "Tutti gli ordini"
    : showAll
      ? "Tutti gli ordini"
      : "Ordini recenti";

  return (
    <>
      <section className="content-panel">
        <div className="panel-heading">
          <div>
            <p className="eyebrow">Filtri</p>
            <h2>Trova un ordine</h2>
            <p className="settings-help">
              Cerca per ragione sociale, P.IVA, codice fiscale o numero ordine,
              e filtra per intervallo di date.
            </p>
          </div>
        </div>

        <div className="orders-filters">
          <label className="form-field">
            <span className="form-label">Cerca (ragione sociale, P.IVA, CF)</span>
            <input
              className="form-input"
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Ragione sociale, P.IVA o codice fiscale…"
            />
          </label>
          <label className="form-field">
            <span className="form-label">Dal</span>
            <input
              className="form-input"
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
            />
          </label>
          <label className="form-field">
            <span className="form-label">Al</span>
            <input
              className="form-input"
              type="date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
            />
          </label>
        </div>

        <div className="form-actions">
          {isAdmin ? (
            <label className="orders-status-filter">
              <span className="form-label">Mostra ordini</span>
              <select
                value={statusFilter}
                onChange={(e) =>
                  setStatusFilter(
                    e.target.value as
                      | "all"
                      | "confirmed"
                      | "unconfirmed"
                      | "deleted"
                  )
                }
                className="form-input"
              >
                <option value="all">Tutti - Confermati e Non</option>
                <option value="confirmed">Confermati</option>
                <option value="unconfirmed">Non Confermati</option>
                <option value="deleted">Eliminati</option>
              </select>
            </label>
          ) : (
            <button
              type="button"
              className="primary-button"
              onClick={() => setShowAll((value) => !value)}
            >
              {showAll ? "Mostra solo i più recenti" : "Vedi tutti"}
            </button>
          )}
        </div>
      </section>

      <section className="content-panel">
        <div className="panel-heading">
          <div>
            <p className="eyebrow">Elenco ordini</p>
            <h2>{listHeading}</h2>
          </div>
          <span className="count-badge">{filtered.length} ordini</span>
        </div>

        {visible.length === 0 ? (
          <p className="empty-state">
            {orders.length === 0
              ? "Nessun ordine registrato. Il modulo \"Nuovo ordine\" genera gli ordini."
              : "Nessun ordine trovato con questi filtri."}
          </p>
        ) : (
          <div className="order-list">
            {visible.map((order) => (
              <div key={order.id} className="order-row-wrap">
                <Link
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
                      <strong>
                        {order.customers?.ragione_sociale ?? "Cliente sconosciuto"}
                      </strong>
                      <small>
                        {formatDate(order.data_ordine)} · {order.numero_ordine}
                      </small>
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
                  <strong className="order-total">
                    {formatEur(order.totale)}
                  </strong>
                  <span className="row-arrow" aria-hidden="true">
                    -&gt;
                  </span>
                </Link>
                <div className="order-actions">
                  {order.file_url && (
                    <a
                      href={order.file_url}
                      download
                      className="order-doc-btn"
                      title="Scarica l'ordine (file Excel)"
                      aria-label={`Scarica ordine ${order.numero_ordine}`}
                    >
                      📄
                    </a>
                  )}
                  <button
                    type="button"
                    className="order-doc-btn"
                    onClick={() =>
                      window.open(`/ordini/${order.id}?print=1`, "_blank")
                    }
                    title="Stampa l'ordine"
                    aria-label={`Stampa ordine ${order.numero_ordine}`}
                  >
                    🖨
                  </button>
                  {canManage &&
                    (order.stato === "annullato" ? (
                      <button
                        type="button"
                        className="order-doc-btn"
                        onClick={() => void confirmRestore(order)}
                        disabled={restoring === order.id}
                        title="Ripristina ordine (torna attivo, provvigioni di nuovo valide)"
                        aria-label={`Ripristina ordine ${order.numero_ordine}`}
                      >
                        {restoring === order.id ? "…" : "↩"}
                      </button>
                    ) : (
                      <button
                        type="button"
                        className="order-cancel-btn"
                        onClick={() => {
                          setCancelMotivo("");
                          setPendingCancel(order);
                        }}
                        disabled={deleting === order.id}
                        title="Annulla ordine (es. cliente che rifiuta la merce)"
                        aria-label={`Annulla ordine ${order.numero_ordine}`}
                      >
                        ✕
                      </button>
                    ))}
                  <button
                    type="button"
                    className="order-delete-btn"
                    onClick={() => setPendingDelete(order)}
                    disabled={deleting === order.id}
                    aria-label={`Elimina ordine ${order.numero_ordine}`}
                    title="Elimina ordine"
                  >
                    {deleting === order.id ? "…" : "🗑"}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {pendingDelete && (
        <ConfirmDialog
          title="Elimina ordine"
          message={
            <>
              Sei certo di volerlo eliminare?{" "}
              <strong>{pendingDelete.numero_ordine}</strong> per{" "}
              <strong>
                {pendingDelete.customers?.ragione_sociale ?? "cliente"}
              </strong>
              .<br />
              L&apos;operazione non può essere annullata.
            </>
          }
          confirmLabel="Sì"
          cancelLabel="No"
          busy={deleting === pendingDelete.id}
          onConfirm={() => void confirmDelete()}
          onCancel={() => setPendingDelete(null)}
        />
      )}

      {pendingCancel && (
        <div
          className="modal-overlay"
          onClick={(e) => {
            if (e.target === e.currentTarget && !cancelling) {
              setPendingCancel(null);
              setCancelMotivo("");
            }
          }}
        >
          <div
            className="modal-panel confirm-modal"
            role="dialog"
            aria-modal="true"
            aria-label="Annulla ordine"
          >
            <div className="modal-head">
              <h3>Annulla ordine</h3>
            </div>
            <div className="confirm-body">
              <p>
                Sei certo di voler annullare{" "}
                <strong>{pendingCancel.numero_ordine}</strong> per{" "}
                <strong>
                  {pendingCancel.customers?.ragione_sociale ?? "cliente"}
                </strong>
                ?<br />
                L&apos;ordine resterà visibile in grigio scuro e{" "}
                <strong>l&apos;agente non riceverà provvigioni</strong>.
              </p>
              <label className="form-field">
                <span className="form-label">
                  Motivazione dell&apos;annullamento *
                </span>
                <textarea
                  className="form-input cancel-reason-input"
                  value={cancelMotivo}
                  onChange={(e) => setCancelMotivo(e.target.value)}
                  rows={3}
                  maxLength={500}
                  autoFocus
                  placeholder="es. Il cliente ha rifiutato la merce"
                />
              </label>
            </div>
            <div className="confirm-actions">
              <button
                type="button"
                className="outline-button"
                onClick={() => {
                  setPendingCancel(null);
                  setCancelMotivo("");
                }}
                disabled={cancelling}
              >
                Indietro
              </button>
              <button
                type="button"
                className="danger-button"
                onClick={() => void confirmCancel()}
                disabled={cancelling || cancelMotivo.trim().length === 0}
              >
                {cancelling
                  ? "Annullamento…"
                  : "Conferma annullamento"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
