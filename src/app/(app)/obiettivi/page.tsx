import { redirect } from "next/navigation";
import { getCurrentAdmin } from "@/lib/supabase/session";
import {
  listIncentiveGare,
  getClassificaRange,
  periodoAttualeGare,
  todayISO,
  type IncentiveGara,
} from "@/lib/incentives";
import { ObiettiviPanel } from "./obiettivi-panel";

export const dynamic = "force-dynamic";

function isDate(v: string | undefined): v is string {
  return Boolean(v && /^\d{4}-\d{2}-\d{2}$/.test(v));
}

function defaultRange(gare: IncentiveGara[]): { from: string; to: string } {
  const attivo = periodoAttualeGare(gare);
  if (attivo) return attivo;
  const now = todayISO();
  return { from: now.slice(0, 8) + "01", to: now };
}

export default async function ObiettiviPage({
  searchParams,
}: {
  searchParams: Promise<{ da?: string; a?: string }>;
}) {
  const admin = await getCurrentAdmin();
  if (!admin) redirect("/login");

  const sp = await searchParams;
  const gare = await listIncentiveGare();
  const def = defaultRange(gare);
  const from = isDate(sp.da) ? sp.da : def.from;
  const to = isDate(sp.a) ? sp.a : def.to;
  const range = from <= to ? { from, to } : { from: to, to: from };
  const ranking = await getClassificaRange(range.from, range.to);

  return (
    <>
      <header className="topbar">
        <div>
          <p className="eyebrow">Area amministratore</p>
          <h1>Obiettivi agenti</h1>
          <p className="list-meta">
            Crea gare su periodi liberi (anche più mesi): obiettivo di
            imponibile raggiungibile da tutti oppure gara miglior venditore con
            premio unico al 1° della classifica del periodo.
          </p>
        </div>
      </header>
      <ObiettiviPanel
        gare={gare}
        canEdit={!admin.subAdmin}
        range={range}
        ranking={ranking}
      />
    </>
  );
}

