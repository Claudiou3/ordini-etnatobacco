import { redirect } from "next/navigation";
import { isSupabaseConfigured } from "@/lib/settings/runtime";
import { getSessionUser } from "@/lib/supabase/session";
import { getLogos } from "@/lib/logos";
import { LoginForm } from "./login-form";

export const metadata = {
  title: "Accedi | Ordini",
};

export default async function LoginPage() {
  const [isConfig, user, logos] = await Promise.all([
    isSupabaseConfigured(),
    getSessionUser(),
    getLogos(),
  ]);
  if (user) redirect("/dashboard");

  return <LoginForm hasConfig={isConfig} logos={logos} />;
}

