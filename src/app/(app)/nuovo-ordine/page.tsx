import { redirect } from "next/navigation";
import { getCurrentAgent } from "@/lib/supabase/session";
import { getOrderCatalog, getGiftArticles } from "@/lib/catalog/order-catalog";
import { getShippingSettings } from "@/lib/shipping-settings";
import { NewOrderForm } from "./new-order-form";

export const dynamic = "force-dynamic";

export default async function NuovoOrdinePage() {
  const agent = await getCurrentAgent();
  if (!agent) redirect("/login");

  const [groups, giftArticles, shippingSettings] = await Promise.all([
    getOrderCatalog(),
    getGiftArticles(),
    getShippingSettings(),
  ]);

  return (
    <>
      <header className="topbar">
        <div>
          <p className="eyebrow">Nuovo ordine</p>
          <h1>Prepara l&apos;ordine</h1>
          <p className="list-meta">
            Cerca il cliente, scegli gli articoli dal catalogo e seleziona
            l&apos;eventuale omaggio.
          </p>
        </div>
      </header>

      <NewOrderForm
        groups={groups}
        giftArticles={giftArticles}
        shippingSettings={shippingSettings}
      />
    </>
  );
}
