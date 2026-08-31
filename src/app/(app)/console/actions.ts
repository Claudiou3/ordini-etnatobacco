"use server";

import { cookies } from "next/headers";
import {
  ADMIN_SESSION_COOKIE,
  updateAdminCredentials,
  verifyAdmin,
} from "@/lib/admin/store";
import { getCurrentAdmin } from "@/lib/supabase/session";
import { countUnreadAdminOrders } from "@/lib/orders";

/**
 * Numero di ordini non ancora letti dall'amministratore: usato dal pop-up
 * della Consolle per segnalare l'arrivo di un nuovo ordine.
 */
export async function getUnreadOrdersCountAction(): Promise<{ count: number }> {
  return { count: await countUnreadAdminOrders() };
}

export type AdminCredState = {
  ok?: boolean;
  error?: string;
  message?: string;
};

/**
 * Verifica che email e password attuali dell'amministratore siano corrette.
 * Solo se coincidono si abilita la riscrittura di nuovo utente e nuova password.
 */
export async function verifyAdminCredentialsAction(
  currentEmail: string,
  currentPassword: string
): Promise<AdminCredState> {
  const admin = await getCurrentAdmin();
  if (!admin || admin.subAdmin) {
    return { error: "Operazione riservata all'amministratore." };
  }
  if (!currentEmail.trim() || !currentPassword) {
    return { error: "Inserisci utente e password attuali." };
  }
  if (!(await verifyAdmin(currentEmail, currentPassword))) {
    return { error: "Utente o password attuali non corretti." };
  }
  return { ok: true };
}

/**
 * Sostituisce email e password dell'amministratore dopo la verifica delle
 * credenziali attuali. Invalida la sessione corrente: si deve riaccedere
 * con il nuovo utente e la nuova password.
 */
export async function updateAdminCredentialsAction(
  currentEmail: string,
  currentPassword: string,
  newEmail: string,
  newPassword: string,
  confirmPassword: string
): Promise<AdminCredState> {
  const admin = await getCurrentAdmin();
  if (!admin || admin.subAdmin) {
    return { error: "Non autorizzato. Accedi come amministratore." };
  }
  if (!newEmail.trim()) {
    return { error: "Inserisci il nuovo indirizzo email." };
  }
  if (newPassword.length < 8) {
    return { error: "La nuova password deve avere almeno 8 caratteri." };
  }
  if (newPassword !== confirmPassword) {
    return { error: "Le nuove password non coincidono." };
  }

  const result = await updateAdminCredentials(
    currentEmail,
    currentPassword,
    newEmail,
    newPassword
  );
  if (!result.ok) {
    return { error: result.error ?? "Errore durante l'aggiornamento." };
  }

  // La sessione corrente punta alla vecchia email: la invalido.
  const cookieStore = await cookies();
  cookieStore.delete(ADMIN_SESSION_COOKIE);

  return {
    ok: true,
    message:
      "Credenziali aggiornate. Accedi di nuovo con il nuovo utente e la nuova password.",
  };
}
