import { redirect } from "next/navigation";
import { ResetAdminPasswordForm } from "./reset-admin-form";

export const metadata = {
  title: "Nuova password amministratore | Ordini",
};

export default async function ResetAdminPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string; email?: string }>;
}) {
  const params = await searchParams;
  const token = params.token ?? "";
  const email = params.email ?? "";

  // La pagina si apre SOLO con il link ricevuto via email (token + email).
  // Niente redirect alla dashboard se l'admin è già loggato: altrimenti il
  // link di reset non potrebbe mai essere usato da una sessione aperta.
  // La sicurezza resta nel token monouso legato all'email dell'account.
  if (!token || !email) {
    redirect("/login/admin");
  }

  return <ResetAdminPasswordForm token={token} email={email} />;
}
