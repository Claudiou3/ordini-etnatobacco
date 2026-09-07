import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/supabase/session";
import { RecuperoAdminForm } from "./recupero-admin-form";

export const metadata = {
  title: "Recupera password amministratore | Ordini",
};

export default async function RecuperoPasswordAdminPage() {
  const user = await getSessionUser();
  if (user) redirect("/dashboard");
  return <RecuperoAdminForm />;
}
