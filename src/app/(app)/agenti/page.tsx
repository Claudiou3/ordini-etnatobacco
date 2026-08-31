import { redirect } from "next/navigation";
import { getCurrentAdmin } from "@/lib/supabase/session";
import {
  getAgentsCommissionData,
  getCommissionRates,
} from "@/lib/commissions";
import { CommissionPanel } from "./commission-panel";

export const dynamic = "force-dynamic";

export default async function AgentiPage() {
  const admin = await getCurrentAdmin();
  if (!admin) redirect("/login");

  const [agents, rates] = await Promise.all([
    getAgentsCommissionData(),
    getCommissionRates(),
  ]);

  return (
    <>
      <header className="topbar">
        <div>
          <p className="eyebrow">Area amministratore</p>
          <h1>Agenti e provvigioni</h1>
        </div>
      </header>
      <CommissionPanel
        agents={agents}
        initialRates={rates}
        canEdit={!admin.subAdmin}
      />
    </>
  );
}
