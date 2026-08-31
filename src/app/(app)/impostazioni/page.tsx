import { redirect } from "next/navigation";
import { getCurrentAdmin } from "@/lib/supabase/session";
import { listSettingsStatus } from "@/lib/settings/runtime";
import { getEmailConfig } from "@/lib/email/config";
import { getLogos } from "@/lib/logos";
import { getShippingSettings } from "@/lib/shipping-settings";
import { listSubadmins } from "@/lib/subadmin/store";
import { SettingsForm } from "./settings-form";
import { EmailConfigForm } from "./email-config-form";
import { ImportExcel } from "./import-excel";
import { LogosForm } from "./logos-form";
import { SubadminsForm } from "./subadmins-form";
import { ShippingForm } from "./shipping-form";
import { AdminCredentialsPanel } from "../console/admin-credentials-panel";
import { LogoutButton } from "../logout-button";

export const dynamic = "force-dynamic";

export default async function ImpostazioniPage() {
  const admin = await getCurrentAdmin();
  if (!admin) redirect("/login");
  // I sub-amministratori sono in SOLA LETTURA: non possono accedere
  // alle Impostazioni (dove si effettuano le modifiche).
  if (admin.subAdmin) redirect("/console");

  const [keys, emailConfig, logos, subadmins, shipping] = await Promise.all([
    listSettingsStatus(),
    getEmailConfig(),
    getLogos(),
    listSubadmins(),
    getShippingSettings(),
  ]);

  return (
    <>
      <header className="topbar">
        <div>
          <p className="eyebrow">Area amministratore</p>
          <h1>Impostazioni</h1>
          <p className="list-meta">
            Gestisci loghi, anagrafica clienti, API key, server email e
            l&apos;account amministratore.
          </p>
        </div>
        <LogoutButton />
      </header>

      <section className="content-panel">
        <div className="panel-heading">
          <div>
            <p className="eyebrow">Loghi</p>
            <h2>Loghi della piattaforma</h2>
          </div>
        </div>
        <LogosForm logos={logos} />
      </section>

      <ImportExcel />

      <ShippingForm settings={shipping} />

      <SettingsForm keys={keys} />

      <EmailConfigForm config={emailConfig} />

      <section className="content-panel">
        <div className="panel-heading">
          <div>
            <p className="eyebrow">Sub-amministratori</p>
            <h2>Utenti con accesso in sola lettura</h2>
          </div>
        </div>
        <SubadminsForm subadmins={subadmins} />
      </section>

      <section className="content-panel">
        <div className="panel-heading">
          <div>
            <p className="eyebrow">Account amministratore</p>
            <h2>Sostituisci utente amministratore e password</h2>
          </div>
        </div>
        <AdminCredentialsPanel />
      </section>
    </>
  );
}

