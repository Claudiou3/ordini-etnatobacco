"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import {
  ADMIN_SESSION_COOKIE,
  ADMIN_SESSION_TTL_MS,
  createAdmin,
  createAdminSessionToken,
  getAdminSessionKey,
  verifyAdmin,
} from "@/lib/admin/store";
import { verifySubadmin } from "@/lib/subadmin/store";
import {
  SUBADMIN_SESSION_COOKIE,
  localSessionCookieOptions,
} from "@/lib/supabase/session";

const DEMO_COOKIE = "ioi_demo_session";

export type AuthState = { error?: string; message?: string };

const loginSchema = z.object({
  email: z.email(),
  password: z.string().min(8),
});

export async function loginAction(
  _prev: AuthState,
  formData: FormData
): Promise<AuthState> {
  const parsed = loginSchema.safeParse({
    email: String(formData.get("email") ?? ""),
    password: String(formData.get("password") ?? ""),
  });

  if (!parsed.success) {
    return { error: "Controlla i dati: email valida e password (min. 8 caratteri)." };
  }

  const supabase = await createClient();
  if (!supabase) {
    return {
      error:
        "Configurazione Supabase mancante: aggiungi le variabili d'ambiente (vedi .env.example).",
    };
  }

  const { error } = await supabase.auth.signInWithPassword(parsed.data);
  if (error) {
    return { error: "Credenziali non valide. Controlla email e password e riprova." };
  }

  redirect("/dashboard");
}

const registerSchema = z
  .object({
    nome: z.string().trim().min(2),
    email: z.email(),
    password: z.string().min(8),
    confirm: z.string().min(8),
  })
  .refine((data) => data.password === data.confirm, {
    message: "Le password non coincidono.",
    path: ["confirm"],
  });

export async function registerAction(
  _prev: AuthState,
  formData: FormData
): Promise<AuthState> {
  const parsed = registerSchema.safeParse({
    nome: String(formData.get("nome") ?? ""),
    email: String(formData.get("email") ?? ""),
    password: String(formData.get("password") ?? ""),
    confirm: String(formData.get("confirm") ?? ""),
  });

  if (!parsed.success) {
    return {
      error: "Controlla i dati: nome, email valida, password (min. 8 caratteri) e conferma password.",
    };
  }

  const supabase = await createClient();
  if (!supabase) {
    return {
      error:
        "Configurazione Supabase mancante: aggiungi le variabili d'ambiente (vedi .env.example).",
    };
  }

  const { error } = await supabase.auth.signUp({
    email: parsed.data.email,
    password: parsed.data.password,
    options: {
      data: { nome: parsed.data.nome, ruolo: "agente" },
    },
  });

  if (error) {
    return { error: "Registrazione non riuscita: " + error.message };
  }

  return {
    message:
      "Registrazione inviata. Controlla la tua email per confermare l'account, poi accedi.",
  };
}

/**
 * Primo accesso: crea l'account amministratore con email e password.
 * Dopo la creazione imposta la sessione admin e porta alle impostazioni.
 */
export async function createAdminPassword(
  _prev: AuthState,
  formData: FormData
): Promise<AuthState> {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");
  const confirm = String(formData.get("confirm") ?? "");

  if (!email) return { error: "Inserisci l'email amministratore." };
  if (password.length < 8) {
    return { error: "La password deve avere almeno 8 caratteri." };
  }
  if (password !== confirm) return { error: "Le password non coincidono." };

  const result = await createAdmin(email, password);
  if (!result.ok) return { error: result.error ?? "Errore durante la creazione." };

  const key = await getAdminSessionKey();
  const token = createAdminSessionToken(email, key);
  const cookieStore = await cookies();
  cookieStore.set(ADMIN_SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: Math.floor(ADMIN_SESSION_TTL_MS / 1000),
  });

  redirect("/impostazioni");
}

/** Login dell'amministratore (email + password) o di un sub-amministratore. */
export async function adminLogin(
  _prev: AuthState,
  formData: FormData
): Promise<AuthState> {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");

  const key = await getAdminSessionKey();

  // Amministratore principale.
  if (await verifyAdmin(email, password)) {
    const token = createAdminSessionToken(email, key);
    const cookieStore = await cookies();
    cookieStore.set(ADMIN_SESSION_COOKIE, token, localSessionCookieOptions());
    redirect("/dashboard");
  }

  // Sub-amministratore (livello inferiore: solo lettura).
  if (await verifySubadmin(email, password)) {
    const token = createAdminSessionToken(email, key);
    const cookieStore = await cookies();
    cookieStore.set(SUBADMIN_SESSION_COOKIE, token, localSessionCookieOptions());
    redirect("/dashboard");
  }

  return { error: "Credenziali amministratore non valide." };
}

/**
 * Accesso in modalita' demo: attivo SOLO quando Supabase non e' configurato.
 * Consente di provare l'app (dashboard, clienti, ordini) senza servizi esterni.
 */
export async function loginDemo(): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.set(DEMO_COOKIE, "demo", {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24,
  });
  redirect("/dashboard");
}

export async function logoutAction(): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.delete(DEMO_COOKIE);
  cookieStore.delete(ADMIN_SESSION_COOKIE);
  cookieStore.delete(SUBADMIN_SESSION_COOKIE);

  const supabase = await createClient();
  if (supabase) {
    await supabase.auth.signOut();
  }
  redirect("/login");
}
