import { redirect } from "next/navigation";
import { isSupabaseConfigured } from "@/lib/settings/runtime";
import { adminExists } from "@/lib/admin/store";
import { getSessionUser } from "@/lib/supabase/session";
import { getLogos } from "@/lib/logos";
import { LoginForm } from "./login-form";

export const metadata = {
  title: "Accedi | IOI Orders",
};

export default async function LoginPage() {
  const [isConfig, user, logos] = await Promise.all([
    isSupabaseConfigured(),
    getSessionUser(),
    getLogos(),
  ]);
  if (user) redirect("/dashboard");

  const hasAdmin = await adminExists();

  return (
    <LoginForm
      hasConfig={isConfig}
      hasAdmin={hasAdmin}
      logos={logos}
    />
  );
}

