import { getSessionUser } from "@/lib/supabase/session";
import { CambiaPasswordForm } from "./cambia-form";

export const metadata = {
  title: "Nuova password | Ordini",
};

export default async function CambiaPasswordPage() {
  // Il link di recupero crea una sessione di recupero: se assente il link
  // non è valido (o è scaduto).
  const user = await getSessionUser();
  return <CambiaPasswordForm valid={Boolean(user)} />;
}
