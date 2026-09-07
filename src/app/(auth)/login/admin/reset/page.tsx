import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/supabase/session";
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

  // Link valido solo se arrivato dall'email di recupero (token + email).
  if (!token || !email) {
    redirect("/login/admin");
  }

  const user = await getSessionUser();
  if (user) redirect("/dashboard");

  return <ResetAdminPasswordForm token={token} email={email} />;
}
