import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/supabase/session";
import { RecuperoForm } from "./recupero-form";

export const metadata = {
  title: "Recupera password | Ordini",
};

export default async function RecuperoPasswordPage() {
  const user = await getSessionUser();
  if (user) redirect("/dashboard");
  return <RecuperoForm />;
}
