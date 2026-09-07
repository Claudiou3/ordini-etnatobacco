import { promises as fs } from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { appDataDir } from "@/lib/data-dir";
import { getAppSetting, setAppSetting } from "@/lib/supabase/app-settings";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Reset password AGENTI via link email (canale SMTP dell'app, come per
 * l'amministratore). Niente dipendenza dalle email/redirect di Supabase:
 * - il token è monouso, con scadenza 30 minuti, salvato SOLO come hash;
 * - il cambio password viene eseguito dal server con la service role key
 *   SOLO se il token è valido e legato all'email richiedente.
 * In questo modo nessun altro può cambiare la password di un agente.
 */

const RESET_FILE = path.join(appDataDir(), "agent-reset.json");
const RESET_SETTING_KEY = "agent_reset";
const RESET_TTL_MS = 30 * 60 * 1000;

type AgentResetEntry = {
  userId: string;
  email: string;
  tokenHash: string;
  expiresAt: number;
};

async function readResetEntry(): Promise<AgentResetEntry | null> {
  const remote = await getAppSetting<AgentResetEntry>(RESET_SETTING_KEY);
  if (remote?.tokenHash && remote?.email) return remote;
  try {
    return JSON.parse(await fs.readFile(RESET_FILE, "utf8")) as AgentResetEntry;
  } catch {
    return null;
  }
}

async function writeResetEntry(entry: AgentResetEntry): Promise<boolean> {
  const saved = await setAppSetting(RESET_SETTING_KEY, entry);
  if (saved) return true;
  try {
    await fs.mkdir(path.dirname(RESET_FILE), { recursive: true });
    await fs.writeFile(RESET_FILE, JSON.stringify(entry, null, 2), {
      mode: 0o600,
    });
    return true;
  } catch {
    return false;
  }
}

async function clearResetEntry(): Promise<void> {
  try {
    await setAppSetting(RESET_SETTING_KEY, null);
  } catch {
    // ignore
  }
  try {
    await fs.rm(RESET_FILE, { force: true });
  } catch {
    // ignore
  }
}

/** Trova l'id dell'utente Supabase che ha quella email (paginazione completa). */
async function findUserIdByEmail(
  admin: NonNullable<Awaited<ReturnType<typeof createAdminClient>>>,
  email: string
): Promise<string | null> {
  const wanted = email.trim().toLowerCase();
  let page = 1;
  const perPage = 1000;
  for (;;) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage });
    if (error) return null;
    const users = data?.users ?? [];
    const target = users.find(
      (u) => typeof u.email === "string" && u.email.toLowerCase() === wanted
    );
    if (target) return target.id;
    if (users.length < perPage || users.length === 0) return null;
    page += 1;
  }
}

/**
 * Crea il token per l'agente con quell'email. Se l'email non corrisponde a un
 * agente registrato ritorna ok:false SENZA dire perché (il chiamante mostrerà
 * il messaggio generico, per non rivelare quali email esistono).
 */
export async function createAgentPasswordResetToken(
  email: string
): Promise<{ ok: boolean; token?: string }> {
  const admin = await createAdminClient();
  if (!admin) return { ok: false };
  const userId = await findUserIdByEmail(admin, email);
  if (!userId) return { ok: false };

  const token = crypto.randomBytes(24).toString("base64url");
  const entry: AgentResetEntry = {
    userId,
    email: email.trim().toLowerCase(),
    tokenHash: crypto.createHash("sha256").update(token).digest("hex"),
    expiresAt: Date.now() + RESET_TTL_MS,
  };
  if (!(await writeResetEntry(entry))) return { ok: false };
  return { ok: true, token };
}

/**
 * Verifica il token e imposta la nuova password dell'agente.
 * Monouso: dopo l'uso (o alla scadenza) il token non è più valido.
 */
export async function completeAgentPasswordReset(
  email: string,
  token: string,
  newPassword: string
): Promise<{ ok: boolean; error?: string }> {
  const entry = await readResetEntry();
  const emailNorm = email.trim().toLowerCase();
  if (!entry || entry.email !== emailNorm) {
    return { ok: false, error: "Richiesta non valida: ripeti la procedura." };
  }
  const expected = crypto.createHash("sha256").update(token).digest("hex");
  const provided = Buffer.from(expected, "hex");
  const stored = Buffer.from(entry.tokenHash, "hex");
  if (
    provided.length !== stored.length ||
    !crypto.timingSafeEqual(provided, stored)
  ) {
    return { ok: false, error: "Link non valido: ripeti la procedura." };
  }
  if (entry.expiresAt < Date.now()) {
    return { ok: false, error: "Link scaduto: richiedi un nuovo reset." };
  }
  if (newPassword.length < 8) {
    return { ok: false, error: "La nuova password deve avere almeno 8 caratteri." };
  }

  const admin = await createAdminClient();
  if (!admin) {
    return { ok: false, error: "Servizio non disponibile, riprova più tardi." };
  }
  const { error: updateError } = await admin.auth.admin.updateUserById(
    entry.userId,
    { password: newPassword }
  );
  if (updateError) {
    return {
      ok: false,
      error: "Impossibile aggiornare la password: " + updateError.message,
    };
  }

  await clearResetEntry();
  return { ok: true };
}
