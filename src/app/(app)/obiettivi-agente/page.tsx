import { redirect } from "next/navigation";
import { getCurrentAgent, getCurrentAdmin } from "@/lib/supabase/session";
import { getGareAgente, getClassificaRange } from "@/lib/incentives";
import { LogoutButton } from "../logout-button";
import { ObiettiviContent } from "./obiettivi-content";

export const dynamic = "force-dynamic";

export default async function ObiettiviAgentePage() {
  const [agent, admin] = await Promise.all([
    getCurrentAgent(),
    getCurrentAdmin(),
  ]);
  if (!agent) redirect("/login");
  // Gli amministratori gestiscono gli obiettivi dalla pagina dedicata.
  if (admin) redirect("/obiettivi");

  const gareView = await getGareAgente(agent.id);
  // Classifica del periodo attivo: serve all'agente per vedere subito chi ha
  // vinto (top 3 Oro/Argento/Bronzo della gara miglior venditore).
  const ranking = gareView
    ? await getClassificaRange(gareView.from, gareView.to)
    : [];

  return (
    <>
      <header className="topbar">
        <div>
          <p className="eyebrow">Area agente</p>
          <h1>Obiettivi</h1>
          <p className="list-meta">
            Obiettivi del periodo e gara miglior venditore definiti
            dall&apos;amministratore.
          </p>
        </div>
        <LogoutButton />
      </header>
      <ObiettiviContent
        gareView={gareView}
        ranking={ranking}
        agentId={agent.id}
      />
    </>
  );
}
