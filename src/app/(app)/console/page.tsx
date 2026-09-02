import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentAdmin } from "@/lib/supabase/session";
import { getAgentsCommissionData, getCommissionRates } from "@/lib/commissions";
import { readCatalog } from "@/lib/catalog/template";
import { countUnreadAdminOrders } from "@/lib/orders";
import { formatEur } from "@/lib/format";
import { NewOrderPopup } from "./new-order-popup";
import { AdminSettingsModal } from "./admin-settings-modal";
import { UsersModal } from "./users-modal";
import { listSubadmins } from "@/lib/subadmin/store";

export const dynamic = "force-dynamic";

const TILES = [
  {
    href: "/catalogo",
    title: "Catalogo",
    desc: "Sconti % e prezzo di vendita su ogni prodotto.",
  },
  {
    href: "/agenti",
    title: "Agenti e provvigioni",
    desc: "Agenti attivi, ordini, imponibili e provvigioni per gruppo.",
  },
  {
    href: "/ordini",
    title: "Ordini",
    desc: "Tutti gli ordini della piattaforma, con file Excel allegati.",
  },
  {
    href: "/clienti",
    title: "Anagrafica clienti",
    desc: "Ricerca e gestione dell'anagrafica condivisa.",
  },
  {
    href: "/impostazioni",
    title: "Impostazioni",
    desc: "Chiavi API, email ordini, import anagrafica da Excel.",
  },
  {
    href: "/dashboard",
    title: "Dashboard",
    desc: "Riepilogo ordini e attivita' della piattaforma.",
  },
] as const;

export default async function ConsolePage() {
  const admin = await getCurrentAdmin();
  if (!admin) redirect("/login");

  const [agents, items, rates] = await Promise.all([
    getAgentsCommissionData(),
    readCatalog(),
    getCommissionRates(),
  ]);
  const unreadCount = await countUnreadAdminOrders();
  const totalOrders = agents.reduce((sum, a) => sum + a.orders.length, 0);
  const totalImponibile = agents.reduce((sum, a) => sum + a.totale, 0);
  const discounted = items.filter((i) => i.sconto > 0).length;
  // I sub-amministratori sono in sola lettura: la gestione degli utenti
  // (Sub-amministratori) e' riservata all'amministratore principale.
  const subadmins = admin.subAdmin ? [] : await listSubadmins();

  return (
    <>
      <NewOrderPopup initialUnread={unreadCount} />
      <header className="topbar">
        <div>
          <p className="eyebrow">Area amministratore</p>
          <h1>Consolle di comando</h1>
          <p className="list-meta">
            Controllo completo della piattaforma: catalogo, prezzi, agenti,
            ordini, impostazioni e utenti.
          </p>
        </div>
        {!admin.subAdmin && (
          <div className="topbar-actions">
            <UsersModal subadmins={subadmins} />
            <AdminSettingsModal />
          </div>
        )}
      </header>

      <section className="stats-grid console-stats" aria-label="Riepilogo piattaforma">
        <article className="stat-card">
          <span className="stat-label">Agenti attivi</span>
          <strong>{agents.filter((a) => a.stato === "attivo").length}</strong>
          <span className="stat-note">Registrati e attivi</span>
        </article>
        <article className="stat-card">
          <span className="stat-label">Ordini complessivi</span>
          <strong>{totalOrders}</strong>
          <span className="stat-note">Effettuati dagli agenti</span>
        </article>
        <article className="stat-card">
          <span className="stat-label">Totale imponibile</span>
          <strong>{formatEur(totalImponibile)}</strong>
          <span className="stat-note">Solo merce, senza spedizione e IVA</span>
        </article>
        <article className="stat-card">
          <span className="stat-label">Articoli catalogo</span>
          <strong>{items.length}</strong>
          <span className="stat-note">
            {discounted} con sconto attivo
          </span>
        </article>
      </section>

      <section className="console-tiles" aria-label="Funzioni amministratore">
        {TILES.filter(
          (tile) => !(admin.subAdmin && tile.href === "/impostazioni")
        ).map((tile) => (
          <Link key={tile.href} href={tile.href} className="console-tile">
            <span className="console-tile-body">
              <strong>{tile.title}</strong>
              <small>{tile.desc}</small>
            </span>
          </Link>
        ))}
      </section>

      <section className="content-panel console-note">
        <p className="settings-help">
          Provvigioni correnti: Occhiali/Kit/Mix{" "}
          <strong>{rates.occhiali}%</strong> · Espositori{" "}
          <strong>{rates.espositori}%</strong> · Astucci{" "}
          <strong>{rates.astucci}%</strong>. Puoi modificarle nella sezione{" "}
          <Link href="/agenti">Agenti e provvigioni</Link>.
        </p>
      </section>
    </>
  );
}
