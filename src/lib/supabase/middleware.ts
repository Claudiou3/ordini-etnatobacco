import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { hasSupabaseConfig } from "./env";
import {
  ADMIN_SESSION_COOKIE,
  SUBADMIN_SESSION_COOKIE,
} from "@/lib/session-cookies";

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

  const pathname = request.nextUrl.pathname;
  const isAuthRoute = pathname.startsWith("/login") || pathname.startsWith("/register");

  // Sessione locale amministratore/sub-amministratore (presenza del cookie).
  const hasLocalAdminSession =
    request.cookies.has(ADMIN_SESSION_COOKIE) ||
    request.cookies.has(SUBADMIN_SESSION_COOKIE);

  if (!user && !hasLocalAdminSession && !isAuthRoute) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.search = "";
    return NextResponse.redirect(url);
  }

  if (user && isAuthRoute) {
    const url = request.nextUrl.clone();
    url.pathname = "/dashboard";
    url.search = "";
    return NextResponse.redirect(url);
  }

  return supabaseResponse;
}
