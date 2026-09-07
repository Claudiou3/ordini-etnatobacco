import { redirect } from "next/navigation";
import Link from "next/link";
import type { CSSProperties } from "react";
import { adminExists } from "@/lib/admin/store";
import { getSessionUser } from "@/lib/supabase/session";
import { getLogos } from "@/lib/logos";
import { AdminSetupForm } from "../admin-setup-form";
import { AdminLoginForm } from "../admin-login-form";

export const metadata = {
  title: "Accesso amministratore | Ordini",
};

/**
 * Pagina di accesso riservata all'amministratore (e ai sub-amministratori).
 * La pagina /login (agenti) NON mostra più i campi dell'amministratore:
 * per gestire la piattaforma si entra da qui (/login/admin).
 * - Se l'account amministratore non esiste ancora: "Configurazione
 *   amministratore" (primo accesso).
 * - Altrimenti: il modulo di accesso amministratore/sub-amministratore.
 */
export default async function AdminLoginPage() {
  const [user, logos] = await Promise.all([getSessionUser(), getLogos()]);
  if (user) redirect("/dashboard");

  const hasAdmin = await adminExists();

  return (
    <div className="auth-card">
      <div className="auth-logo">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={logos.logo1.src}
          alt="Logo"
          className="auth-logo-img"
          style={{ "--logo-size": `${logos.logo1.size}px` } as CSSProperties}
        />
        {logos.logo2.present && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={logos.logo2.src}
            alt="Secondo logo"
            className="auth-logo-img"
            style={{ "--logo-size": `${logos.logo2.size}px` } as CSSProperties}
          />
        )}
      </div>

      {!hasAdmin ? <AdminSetupForm /> : <AdminLoginForm />}

      <p className="auth-switch">
        <Link href="/login">← Vai all&apos;accesso agente</Link>
      </p>
    </div>
  );
}
