"use client";

import { useEffect } from "react";
import { createClient } from "@/lib/supabase/client";

/**
 * Mantiene valida la sessione dell'agente (Supabase) quando l'app è aperta,
 * SENZA alcun ping/timer periodico verso Vercel.
 *
 * Il token di accesso dura ~1 ora. Questo componente:
 * - attiva l'auto-refresh di supabase-js (la libreria rinnova il token poco
 *   prima della scadenza, senza chiamate continue al nostro server);
 * - quando l'app torna visibile (o la rete torna) controlla la sessione e,
 *   se il token è scaduto o in scadenza nei prossimi 10 minuti, lo rinnova:
 *   così riaprendo l'app dopo ore la sessione è ancora valida.
 * Tutto avviene SOLO su eventi reali (apertura/ritorno in primo piano) o
 * poco prima della scadenza del token: nessuna attività di "standby".
 */
export function SessionKeepAlive() {
  useEffect(() => {
    const supabase = createClient();
    if (!supabase) return;

    const refreshIfNeeded = async () => {
      try {
        const { data } = await supabase.auth.getSession();
        const session = data.session;
        if (!session) return;
        const expiresAt = session.expires_at;
        if (typeof expiresAt !== "number") return;
        const nowSec = Date.now() / 1000;
        // Scaduto o in scadenza nei prossimi 10 minuti: rinnova ora.
        if (expiresAt - nowSec < 10 * 60) {
          await supabase.auth.refreshSession();
        }
      } catch {
        // Rete assente o errore temporaneo: si ritenta al prossimo evento
        // (visibilità, online) o al prossimo auto-refresh della libreria.
      }
    };

    // Auto-refresh di supabase-js: rinnova ~1 minuto prima della scadenza.
    void supabase.auth.startAutoRefresh();

    const onVisible = () => {
      if (document.visibilityState === "visible") void refreshIfNeeded();
    };
    const onOnline = () => void refreshIfNeeded();

    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("online", onOnline);
    void refreshIfNeeded();

    return () => {
      void supabase.auth.stopAutoRefresh();
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("online", onOnline);
    };
  }, []);

  return null;
}
