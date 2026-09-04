"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import type { SupabaseClient, User } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
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

/** Vero se Supabase segnala che l'email dell'account non è ancora confermata. */
function isEmailNotConfirmedError(error: {
  message?: string;
  code?: string;
}): boolean {
  const message = (error?.message ?? "").toLowerCase();
  const code = (error?.code ?? "").toLowerCase();
  return message.includes("email not confirmed") || code === "email_not_confirmed";
}

/**
 * Conferma l'email di un utente esistente usando la service role key
 * (operazione SOLO server, mai nel browser). Quando il progetto Supabase
 * ha "Confirm email" attivo, un agente appena registrato non può accedere
 * finché non clicca il link: qui attiviamo l'account direttamente.
 * Trova l'utente per email con paginazione completa.
 */
async function confirmUserEmail(
  admin: SupabaseClient,
  email: string
): Promise<boolean> {
  const wanted = email.trim().toLowerCase();
  let page = 1;
  const perPage = 1000;
  for (;;) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage });
    if (error) return false;
    const users = data?.users ?? [];
    const target = users.find(
      (u) => typeof u.email === "string" && u.email.toLowerCase() === wanted
    );
    if (target) {
      const { error: updateError } = await admin.auth.admin.updateUserById(
        target.id,
        { email_confirm: true }
      );
      return !updateError;
    }
    if (users.length < perPage || users.length === 0) return false;
    page += 1;
  }
}

/**
 * Garantisce che esista la riga in `agents` per l'utente appena autenticato.
 * Di norma la crea il trigger `handle_new_user` alla registrazione; questo
 * passaggio copre i casi in cui manca (es. utenti creati prima del trigger
 * o migrazioni non applicate), evitando il rimbalzo al login dopo l'accesso.
 */
async function ensureAgentRow(
  admin: SupabaseClient,
  user: Pick<User, "id" | "email" | "user_metadata">
): Promise<void> {
  try {
    const { data: existing } = await admin
      .from("agents")
      .select("id")
      .eq("id", user.id)
      .maybeSingle();
    if (existing) return;

    const meta = (user.user_metadata ?? {}) as Record<string, unknown>;
    const nome =
      typeof meta.nome === "string" && meta.nome.trim()
        ? meta.nome.trim()
        : (user.email ?? "Agente");
    const ruolo =
      typeof meta.ruolo === "string" && meta.ruolo ? meta.ruolo : "agente";

    await admin.from("agents").insert({
      id: user.id,
      email: user.email ?? "",
      nome,
      ruolo,
    });
  } catch {
    // Se il trigger funziona la riga esiste già: qui si interviene solo
    // quando manca, senza mai bloccare l'accesso in caso di errore.
  }
}

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

  let { error } = await supabase.auth.signInWithPassword(parsed.data);

  // Account esistente ma email non ancora confermata (progetto Supabase con
  // "Confirm email" attivo). La password è già stata verificata da Supabase
  // prima di questo errore, quindi possiamo attivare l'account qui (solo
  // server, con la service role) e ripetere l'accesso automaticamente.
  if (error && isEmailNotConfirmedError(error)) {
    const admin = await createAdminClient();
    if (admin && (await confirmUserEmail(admin, parsed.data.email))) {
      const retry = await supabase.auth.signInWithPassword(parsed.data);
      error = retry.error ?? null;
    }
  }

  if (error) {
    if (isEmailNotConfirmedError(error)) {
      return {
        error:
          "Account non ancora attivato: apri l'email di conferma ricevuta alla registrazione (controlla anche lo spam). Se non la trovi, contatta l'amministratore.",
      };
    }
    return { error: "Credenziali non valide. Controlla email e password e riprova." };
  }

  // Sessione creata: verifica che esista la riga agente (copre i casi in cui
  // il trigger del database non è presente) e porta alla dashboard.
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (user) {
    const admin = await createAdminClient();
    if (admin) await ensureAgentRow(admin, user);
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

  const admin = await createAdminClient();

  if (admin) {
    // Flusso principale: crea l'account GIÀ ATTIVO con la service role key
    // (operazione SOLO server, mai nel browser). In questo modo Supabase NON
    // invia nessuna email di conferma e l'agente può subito accedere.
    const { error: createError } = await admin.auth.admin.createUser({
      email: parsed.data.email,
      password: parsed.data.password,
      email_confirm: true,
      user_metadata: { nome: parsed.data.nome, ruolo: "agente" },
    });
    if (createError) {
      return { error: "Registrazione non riuscita: " + createError.message };
    }
  } else {
    // Fallback (service role non configurata): registrazione standard.
    // Con "Confirm email" attivo nel progetto Supabase può inviare una email
    // di conferma: è il caso limite, da eliminare configurando la chiave.
    const { error: signUpError } = await supabase.auth.signUp({
      email: parsed.data.email,
      password: parsed.data.password,
      options: {
        data: { nome: parsed.data.nome, ruolo: "agente" },
      },
    });
    if (signUpError) {
      return { error: "Registrazione non riuscita: " + signUpError.message };
    }
  }

  // Accesso immediato con le credenziali appena create.
  const signIn = await supabase.auth.signInWithPassword({
    email: parsed.data.email,
    password: parsed.data.password,
  });

  if (signIn.error) {
    if (isEmailNotConfirmedError(signIn.error)) {
      return {
        message:
          "Account creato! Per attivarlo apri l'email di conferma che ti è stata inviata (controlla anche lo spam), poi accedi.",
      };
    }
    return {
      message:
        "Registrazione riuscita. Ora puoi accedere con le credenziali appena create.",
    };
  }

  const {
    data: { user: me },
  } = await supabase.auth.getUser();
  if (me) {
    const admin = await createAdminClient();
    if (admin) await ensureAgentRow(admin, me);
  }

  redirect("/dashboard");
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
