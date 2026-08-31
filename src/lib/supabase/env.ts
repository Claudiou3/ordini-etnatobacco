/**
 * Centralizza i controlli sulla presenza delle variabili d'ambiente Supabase.
 * Le chiavi pubbliche (NEXT_PUBLIC_*) sono inline nel client; la service role
 * key esiste solo lato server.
 */

export function hasSupabaseConfig(): boolean {
  return Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  );
}

export function hasServiceRole(): boolean {
  return Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY);
}
