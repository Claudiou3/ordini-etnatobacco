import { redirect } from "next/navigation";
import { getCurrentAdmin } from "@/lib/supabase/session";
import {
  listIncentiveGare,
  getClassificaMese,
  meseAttualeGare,
} from "@/lib/incentives";
import { ObiettiviPanel } from "./obiettivi-panel";

export const dynamic = "force-dynamic";

export default async function ObiettiviPage({
  searchParams,
}: {
  searchParams: Promise<{ mese?: string }>;
}) {
  const admin = await getCurrentAdmin();
  if (!admin) redirect("/login");

  const sp = await searchParams;
  const gare = await listIncentiveGare();
  const defaultMonth = meseAttualeGare(gare);
  const month = /^\d{4}-\d{2}$/.test(sp.mese ?? "")
    ? (sp.mese as string)
    : defaultMonth;
  const ranking = await getClassificaMese(month);

  return (
    <>
      <header className="topbar">
        <div>
          <p className="eyebrow">Area amministratore</p>
          <h1>Obiettivi agenti</h1>
          <p className="list-meta">
            Gare e premi del mese: obiettivo di imponibile raggiungibile da
            tutti gli agenti e gara miglior venditore con premio unico al 1°
            in classifica.
          </p>
        </div>
      </header>
      <ObiettiviPanel
        gare={gare}
        canEdit={!admin.subAdmin}
        month={month}
        ranking={ranking}
      />
    </>
  );
}
