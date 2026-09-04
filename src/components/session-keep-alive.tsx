"use client";

import { useEffect } from "react";
import { createClient } from "@/lib/supabase/client";

/**
 * Mantiene viva la sessione dell'agente (Supabase) mentre l'app è aperta.
 *
 * Perché: il token di accesso dura ~1 ora. Se l'app resta in background (o
 * viene riaperta da Home dopo ore, tipico di Android/iPhone) senza che una
 * pagina usi il client Supabase, il token scade e al prossimo giro il proxy
 * deve fare il refresh tutto in una volta, nel momento peggiore (rete lenta,
 * avvio da Home). Questo componente:
 * - attiva l'auto-refresh di supabase-js (rinnova poco prima della scadenza
 *   e riscrive i cookie, che hanno scadenza lunghissima);
 * - quando l'app torna visibile o la rete torna, controlla la sessione e, se
 *   il token è scaduto o in scadenza nei prossimi 10 minuti, lo rinnova
 *   subito: così al ritorno la sessione è già valida e non viene mai
 *   "buttata fuori".
 */
export function SessionKeepAlive() {
  useEffect(() => {
    const supabase = createClient();
    if (!supabase) return;

    let timer: ReturnType<typeof setInterval> | null = null;

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
        // Rete assente o errore temporaneo: si ritenta alla prossima occasione
        // (visibilitychange, online, timer). Non serve mostrare errori.
      }
    };

    // Auto-refresh di supabase-js (rinnova poco prima della scadenza).
    void supabase.auth.startAutoRefresh();

    // Controllo preventivo periodico (copre anche eventuali auto-refresh
    // sospesi dal browser quando l'app era in background).
    timer = setInterval(() => void refreshIfNeeded(), 15 * 60 * 1000);

    const onVisible = () => {
      if (document.visibilityState === "visible") void refreshIfNeeded();
    };
    const onOnline = () => void refreshIfNeeded();

    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("online", onOnline);
    void refreshIfNeeded();

    return () => {
      void supabase.auth.stopAutoRefresh();
      if (timer) clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("online", onOnline);
    };
  }, []);

  return null;
}
