import { redirect } from "next/navigation";
import { getCurrentAdmin } from "@/lib/supabase/session";
import { readCatalog } from "@/lib/catalog/template";
import { CatalogManager } from "./catalog-manager";
import { TemplateUpload } from "./template-upload";

export const dynamic = "force-dynamic";

export default async function CatalogoPage() {
  const admin = await getCurrentAdmin();
  if (!admin) redirect("/login");

  // Lettura "fresh": la pagina Catalogo dell'amministratore deve mostrare
  // sempre l'ultimo stato salvato (spunte "multiplo di 4", sconti, prezzi),
  // anche subito dopo un salvataggio.
  const items = await readCatalog({ fresh: true });
  const canEdit = !admin.subAdmin;

  return (
    <>
      <header className="topbar">
        <div>
          <p className="eyebrow">Area amministratore</p>
          <h1>Catalogo</h1>
          <p className="list-meta">
            Gestisci sconti (%), prezzo di vendita e vincolo &quot;multipli di
            4&quot; su ogni articolo del catalogo ({items.length} articoli). Le
            modifiche vengono salvate su <code>data/ordine_template.xlsx</code>;
            il file originale resta intatto.
          </p>
        </div>
      </header>

      {canEdit && <TemplateUpload />}

      {items.length === 0 ? (
        <section className="content-panel">
          <p className="empty-state">
            Catalogo non trovato. Carica il file <code>ordine_template.xlsx</code>{" "}
            con il pannello qui sopra oppure copialo nella cartella del progetto.
          </p>
        </section>
      ) : (
        <CatalogManager items={items} canEdit={canEdit} />
      )}
    </>
  );
}
