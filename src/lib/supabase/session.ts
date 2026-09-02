import { cookies } from "next/headers";
import { createClient } from "./server";
import {
  ADMIN_SESSION_COOKIE,
  ADMIN_SESSION_TTL_MS,
  getAdminSessionKey,
  verifyAdminSessionToken,
} from "@/lib/admin/store";
import { SUBADMIN_SESSION_COOKIE } from "@/lib/session-cookies";
import type { Agent } from "@/lib/types";

const DEMO_COOKIE = "ioi_demo_session";
export { SUBADMIN_SESSION_COOKIE };

// Cache breve (30s) dell'utente Supabase per sessione: evita il rate limit
// dell'API Auth (429) che scatta con molte chiamate ravvicinate
// (es. la ricerca clienti lancia una verifica a ogni tasto).
const sessionUserCache = new Map<string, { id: string; expires: number }>();
const SESSION_CACHE_TTL = 30_000;

async function getSupabaseUser(): Promise<SessionUser | null> {
  const supabase = await createClient();
  if (!supabase) return null;

  try {
    const {
      data: { session },
    } = await supabase.auth.getSession();
    const token = session?.access_token ?? "";
    if (!token) return null;

    const key = token.slice(0, 48);
    const hit = sessionUserCache.get(key);
    if (hit && hit.expires > Date.now()) return { id: hit.id };

    // getUser() valida davvero il token con il server Auth (sicuro).
    const {
      data: { user },
      error,
    } = await supabase.auth.getUser(token);
    if (error || !user) return null;

    if (sessionUserCache.size > 200) sessionUserCache.clear();
    sessionUserCache.set(key, { id: user.id, expires: Date.now() + SESSION_CACHE_TTL });
    return { id: user.id };
  } catch {
    // sessione non valida o errore di rete: consideriamo non autenticati
    return null;
  }
}

export type SessionUser = { id: string };

export type AdminSession = {
  email: string;
  isAdmin: true;
  /** TRUE per i sub-amministratori (solo lettura, niente Impostazioni). */
  subAdmin?: boolean;
};

export const DEMO_AGENT: Agent = {
  id: "demo-agent",
  email: "demo@ioi.local",
  nome: "Agente Demo",
  ruolo: "agente",
  stato: "attivo",
  created_at: "2026-01-01T00:00:00.000Z",
};

export const ADMIN_AGENT: Agent = {
  id: "admin-agent",
  email: "amministratore@ioi.local",
  nome: "Amministratore",
  ruolo: "admin",
  stato: "attivo",
  created_at: "2026-01-01T00:00:00.000Z",
};

/** Profilo sintetico per i sub-amministratori (livello inferiore). */
export const SUBADMIN_AGENT: Agent = {
  id: "subadmin",
  email: "subadmin@ioi.local",
  nome: "Sub-amministratore",
  ruolo: "subadmin",
  stato: "attivo",
  created_at: "2026-01-01T00:00:00.000Z",
};

async function hasDemoSession(): Promise<boolean> {
  const cookieStore = await cookies();
  return Boolean(cookieStore.get(DEMO_COOKIE)?.value);
}

/** Legge la sessione admin locale (cookie firmato). */
async function getAdminEmailFromSession(): Promise<string | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(ADMIN_SESSION_COOKIE)?.value;
  if (!token) return null;
  const key = await getAdminSessionKey();
  return verifyAdminSessionToken(token, key);
}

/** Legge la sessione dei sub-amministratori (cookie firmato). */
async function getSubadminEmailFromSession(): Promise<string | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(SUBADMIN_SESSION_COOKIE)?.value;
  if (!token) return null;
  const key = await getAdminSessionKey();
  return verifyAdminSessionToken(token, key);
}

/** Opzioni cookie per le sessioni locali (admin / sub-admin). */
export function localSessionCookieOptions(): {
  httpOnly: true;
  sameSite: "lax";
  secure: boolean;
  path: string;
  maxAge: number;
} {
  return {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: Math.floor(ADMIN_SESSION_TTL_MS / 1000),
  };
}

/**
 * Ritorna l'utente autenticato della richiesta corrente.
 * La sessione amministratore locale e' SEMPRE valida (anche con Supabase
 * configurato: gestisce Impostazioni e API key). Senza Supabase valgono
 * anche la sessione demo.
 */
export async function getSessionUser(): Promise<SessionUser | null> {
  if (await getAdminEmailFromSession()) return { id: "admin-agent" };
  if (await getSubadminEmailFromSession()) return { id: "subadmin" };

  const supabaseUser = await getSupabaseUser();
  if (supabaseUser) return supabaseUser;

  if (await hasDemoSession()) return { id: "demo-agent" };
  return null;
}

/**
 * Ritorna la riga dell'agente (profilo) collegata all'utente corrente.
 * L'amministratore locale viene sempre riconosciuto.
 */
export async function getCurrentAgent(): Promise<Agent | null> {
  const user = await getSessionUser();
  if (!user) return null;

  // Amministratore locale: NON esporre mai l'email reale nell'interfaccia.
  // L'identita' usata per i controlli interni (getCurrentAdmin) resta in admin.json.
  if (await getAdminEmailFromSession()) {
    return ADMIN_AGENT;
  }

  // Sub-amministratore: profilo sintetico (livello inferiore, solo lettura).
  if (await getSubadminEmailFromSession()) {
    return SUBADMIN_AGENT;
  }

  const supabase = await createClient();
  if (!supabase) {
    if (user.id === "demo-agent") return DEMO_AGENT;
    return null;
  }

  const { data } = await supabase
    .from("agents")
    .select("id, email, nome, ruolo, stato, created_at")
    .eq("id", user.id)
    .maybeSingle();

  return (data as Agent | null) ?? null;
}

/**
 * Ritorna la sessione amministratore se l'utente corrente e' admin
 * (amministratore principale o sub-amministratore).
 * La sessione admin locale ha priorita'; con Supabase vale anche
 * l'agente con ruolo "admin".
 */
export async function getCurrentAdmin(): Promise<AdminSession | null> {
  const email = await getAdminEmailFromSession();
  if (email) return { email, isAdmin: true, subAdmin: false };

  const sub = await getSubadminEmailFromSession();
  if (sub) return { email: sub, isAdmin: true, subAdmin: true };

  const supabase = await createClient();
  if (!supabase) return null;

  const agent = await getCurrentAgent();
  if (agent && agent.ruolo === "admin") {
    return { email: agent.email, isAdmin: true, subAdmin: false };
  }
  return null;
}

/**
 * TRUE solo per l'AMMINISTRATORE PRINCIPALE (i sub-amministratori sono
 * in sola lettura: nessuna modifica da Impostazioni e dintorni).
 */
export function isFullAdmin(admin: AdminSession | null): boolean {
  return Boolean(admin && !admin.subAdmin);
}

/**
 * TRUE SOLO per la sessione dell'Amministratore principale (l'account che
 * gestisce Consolle/Impostazioni), NON per agenti con ruolo admin su Supabase.
 * Usata per le operazioni riservate, es. eliminare un'anagrafica cliente.
 */
export async function isPrimaryAdmin(): Promise<boolean> {
  return Boolean(await getAdminEmailFromSession());
}


