import { redirect } from "next/navigation";
import { getCurrentAdmin, getCurrentAgent } from "@/lib/supabase/session";
import { initials } from "@/lib/format";
import { getLogos } from "@/lib/logos";
import { AppNav } from "./nav";
import { ScrollNav } from "./scroll-nav";
import { DownloadCatalogButton } from "./download-catalog-button";

export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const [agent, admin, logos] = await Promise.all([
    getCurrentAgent(),
    getCurrentAdmin(),
    getLogos(),
  ]);
  if (!agent) redirect("/login");

  const roleLabel =
    agent.ruolo === "admin"
      ? "Amministratore"
      : agent.ruolo === "subadmin"
        ? "Sub-amministratore"
        : "Agente commerciale";

  return (
    <div className="dashboard-shell">
      <aside className="sidebar">
        <div className="brand-mark">
          <div className="brand-logos">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={logos.logo1.src} alt="Logo" className="brand-logo" />
            {logos.logo2.present && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={logos.logo2.src} alt="Secondo logo" className="brand-logo" />
            )}
          </div>
        </div>
        <div className="profile-block">
          <div className="avatar" aria-hidden="true">
            {initials(agent.nome)}
          </div>
          <div>
            <strong>{agent.nome}</strong>
            <span>{roleLabel}</span>
          </div>
        </div>
        <AppNav isAdmin={Boolean(admin)} />
        {!admin && (
          <DownloadCatalogButton iconUrl={logos.logo3.src || undefined} />
        )}
        <div className="sidebar-footer">
          <span className="status-dot" aria-hidden="true" />
          <span>{admin ? "Amministratore" : agent.email}</span>
        </div>
      </aside>
      <section className="content-area">{children}</section>
      <ScrollNav />
    </div>
  );
}
