import { redirect } from "next/navigation";
import { getCurrentAdmin, getSessionUser } from "@/lib/supabase/session";
import { CustomerSearch } from "./customer-search";
import { CustomerForm } from "./customer-form";

export const dynamic = "force-dynamic";

export default async function ClientiPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");

  // Solo l'amministratore principale puo' eliminare anagrafiche:
  // gli agenti vedono la ricerca e la modifica, ma non il pulsante "Elimina".
  const admin = await getCurrentAdmin();
  const canDelete = Boolean(admin && !admin.subAdmin);

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
              Digita la ragione sociale, la P.IVA o il codice fiscale: i
              risultati compaiono subito mentre scrivi, su tutta
              l&apos;anagrafica.
            </p>
          </div>
        </div>

        <CustomerSearch canDelete={canDelete} />
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

