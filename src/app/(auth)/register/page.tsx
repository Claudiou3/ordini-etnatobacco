import { redirect } from "next/navigation";
import { isSupabaseConfigured } from "@/lib/settings/runtime";
import { getSessionUser } from "@/lib/supabase/session";
import { getLogos } from "@/lib/logos";
import { RegisterForm } from "./register-form";

export const metadata = {
  title: "Registrazione | Ordini",
};

export default async function RegisterPage() {
  const [isConfig, user, logos] = await Promise.all([
    isSupabaseConfigured(),
    getSessionUser(),
    getLogos(),
  ]);
  if (user) redirect("/dashboard");

  return <RegisterForm hasConfig={isConfig} logos={logos} />;
}
