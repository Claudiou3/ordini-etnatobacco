import Link from "next/link";
import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/supabase/session";
import { searchCustomers } from "@/lib/customers";
import { CustomerForm } from "./customer-form";
import { CustomerCard } from "./customer-card";

export const dynamic = "force-dynamic";

export default async function ClientiPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const user = await getSessionUser();
  if (!user) redirect("/login");

  const { q = "" } = await searchParams;
  const query = q.trim();
  // La lista viene mostrata SOLO quando l'agente cerca: niente elenchi
  // precompilati di clienti (l'anagrafica completa è enorme).
  const customers = query ? await searchCustomers(query, 30) : [];

  return (
    <>
      <header className="topbar">
        <div>
          <p className="eyebrow">Anagrafica condivisa</p>
          <h1>Clienti</h1>
        </div>
      </header>

      <section className="content-panel">
        <div className="panel-heading">
          <div>
            <p className="eyebrow">Ricerca</p>
            <h2>Cerca un cliente</h2>
            <p className="settings-help">
              Digita la ragione sociale, la P.IVA o il codice fiscale: la
              ricerca avviene su tutta l&apos;anagrafica.
            </p>
          </div>
        </div>

        <form method="get" className="search-row" role="search">
          <label className="search-field">
            <span aria-hidden="true">/</span>
            <input
              type="search"
              name="q"
              defaultValue={q}
              placeholder="Ragione sociale, P.IVA, codice fiscale o città…"
            />
          </label>
          <button type="submit" className="primary-button">
            Cerca
          </button>
          {q && (
            <Link href="/clienti" className="outline-button">
              Azzera
            </Link>
          )}
        </form>

        {!query ? (
          <p className="empty-state">
            Usa la ricerca per trovare un cliente nell&apos;anagrafica, oppure
            inserisci un nuovo cliente nella sezione qui sotto.
          </p>
        ) : customers.length === 0 ? (
          <p className="empty-state">
            Nessun cliente trovato per &quot;{query}&quot;. Puoi inserirlo nella
            sezione &quot;Nuovo inserimento&quot; qui sotto.
          </p>
        ) : (
          <>
            <p className="list-meta">
              {customers.length} clienti trovati per &quot;{query}&quot;
            </p>
            <div className="customer-list">
              {customers.map((customer) => (
                <CustomerCard key={customer.id} customer={customer} />
              ))}
            </div>
          </>
        )}
      </section>

      <section className="content-panel">
        <div className="panel-heading">
          <div>
            <p className="eyebrow">Nuovo inserimento</p>
            <h2>Inserisci un nuovo cliente</h2>
          </div>
        </div>
        <CustomerForm />
      </section>
    </>
  );
}

