import { createServerClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";
import { NextResponse, type NextRequest } from "next/server";
import { hasSupabaseConfig } from "./env";
import {
  ADMIN_SESSION_COOKIE,
  SUBADMIN_SESSION_COOKIE,
} from "@/lib/session-cookies";

// Cache breve (30 s) dello stato agente per il Proxy: evita una query al DB
// a ogni navigazione quando molti agenti sono collegati insieme.
const agentStatusCache = new Map<string, { active: boolean; expires: number }>();
const AGENT_STATUS_CACHE_TTL = 30_000;

/**
 * TRUE se l'agente Supabase è ancora "attivo" (riga in agents con stato
 * attivo). Gli agenti DISATTIVATI dall'amministratore non devono poter usare
 * l'app (nemmeno con una sessione già aperta). In caso di errore transitorio
 * la richiesta passa: sono le pagine a fare la verifica definitiva.
 */
async function isAgentActive(
  supabase: SupabaseClient,
  userId: string
): Promise<boolean> {
  const now = Date.now();
  const hit = agentStatusCache.get(userId);
  if (hit && hit.expires > now) return hit.active;

  let active = true;
  try {
    const { data, error } = await supabase
      .from("agents")
      .select("stato")
      .eq("id", userId)
      .maybeSingle();
    if (!error && data) active = data.stato === "attivo";
  } catch {
    // errore transitorio: lascia passare (le pagine controllano di nuovo)
  }

  if (agentStatusCache.size > 500) agentStatusCache.clear();
  agentStatusCache.set(userId, { active, expires: now + AGENT_STATUS_CACHE_TTL });
  return active;
}

/**
 * Aggiorna/verifica la sessione Supabase e protegge le route:
 * - utenti non autenticati -> /login
 * - utenti autenticati che visitano /login o /register -> /dashboard
 *
 * L'amministratore (e i sub-amministratori) usa una sessione LOCALE firmata
 * (cookie ioi_admin_session / ioi_subadmin_session) che NON passa da Supabase
 * Auth. Senza gestirla qui si crea un loop: il proxy rimandava al login ogni
 * pagina protetta, ma il login (che vede il cookie valido) rimandava al
 * dashboard. La presenza del cookie viene quindi considerata come
 * "autenticato" per il proxy; la verifica vera e propria (firma + scadenza)
 * resta alle pagine, che se il cookie non è valido riportano al login SENZA
 * creare loop (per questo non reindirizziamo via dalle route di auth in base
 * al solo cookie: lo fa la pagina stessa).
 */
export async function updateSession(request: NextRequest) {
  const pathname = request.nextUrl.pathname;

  // File "pubblici" che il browser deve poter raggiungere ANCHE senza login:
  // il manifest PWA, il service worker e le immagini/loghi. Se fossero
  // protetti, il telefono non riceverebbe l'icona/manifest validi e Chrome
  // proporrebbe solo la "scorciatoia" (con il logo di Chrome sull'icona)
  // invece della vera installazione PWA.
  const isPublicAsset =
    pathname.startsWith("/manifest.webmanifest") ||
    pathname.startsWith("/sw.js") ||
    pathname.startsWith("/auth/callback") ||
    pathname.startsWith("/recupero-password") ||
    pathname.startsWith("/cambia-password") ||
    /\.(?:svg|png|jpg|jpeg|gif|webp|ico)$/.test(pathname);
  if (isPublicAsset) return NextResponse.next({ request });

  if (!hasSupabaseConfig()) {
    // Supabase non configurato: lascia passare, le pagine mostrano
    // un messaggio di configurazione mancante.
    return NextResponse.next({ request });
  }

  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookieOptions: {
        path: "/",
        sameSite: "lax",
        secure: process.env.NODE_ENV === "production",
      },
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  // Da chiamare subito dopo createServerClient, prima di qualsiasi altra logica.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const isAuthRoute =
    pathname.startsWith("/login") || pathname.startsWith("/register");

  // Sessione locale amministratore/sub-amministratore (presenza del cookie).
  const hasLocalAdminSession =
    request.cookies.has(ADMIN_SESSION_COOKIE) ||
    request.cookies.has(SUBADMIN_SESSION_COOKIE);

  // Un agente DISATTIVATO non è considerato autenticato (pur avendo una
  // sessione Supabase valida): viene rimandato al login senza loop.
  let agentActive = true;
  if (user) agentActive = await isAgentActive(supabase, user.id);
  const effectiveUser = user && agentActive ? user : null;

  if (!effectiveUser && !hasLocalAdminSession && !isAuthRoute) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.search = "";
    return NextResponse.redirect(url);
  }

  if (effectiveUser && isAuthRoute) {
    const url = request.nextUrl.clone();
    url.pathname = "/dashboard";
    url.search = "";
    return NextResponse.redirect(url);
  }

  return supabaseResponse;
}
