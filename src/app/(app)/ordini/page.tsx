import { redirect } from "next/navigation";
import { getCurrentAgent, getCurrentAdmin } from "@/lib/supabase/session";
import { getMyOrders } from "@/lib/orders";
import { getAgentCommissionView } from "@/lib/commissions";
import { getReadOrderIds } from "@/lib/orders/read";
import { OrdersFilter } from "./orders-filter";
import { AgentCommissionPanel } from "./agent-commission-panel";

export const dynamic = "force-dynamic";

export default async function OrdiniPage() {
  const agent = await getCurrentAgent();
  if (!agent) redirect("/login");

  const [orders, isAdmin] = await Promise.all([
    getMyOrders(agent.id, 1000),
    getCurrentAdmin(),
  ]);

  // Lato amministratore: evidenzia gli ordini non ancora letti.
  let ordersWithRead = orders;
  if (isAdmin) {
    const readSet = await getReadOrderIds();
    ordersWithRead = orders.map((o) => ({
      ...o,
      read: readSet.has(o.id),
    }));
  }

  // Lato agente: vista "Ordini e provvigioni per cliente".
  const commissionView = isAdmin
    ? null
    : await getAgentCommissionView(agent.id);

  return (
    <>
      <header className="topbar">
        <div>
          <p className="eyebrow">
            {isAdmin ? "Ordini ricevuti" : "I miei ordini"}
          </p>
          <h1>Ordini</h1>
          <p className="list-meta">
            Consulta gli ordini emessi: cerca per cliente o data, scaricali o
            aprine il dettaglio.
          </p>
        </div>
      </header>

      <OrdersFilter
        orders={ordersWithRead}
        isAdmin={Boolean(isAdmin)}
        canManage={Boolean(isAdmin) && !isAdmin?.subAdmin}
      />

      {commissionView && <AgentCommissionPanel view={commissionView} />}
    </>
  );
}
