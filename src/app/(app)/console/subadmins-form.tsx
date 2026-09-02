"use client";

import { useActionState, useState } from "react";
import { useRouter } from "next/navigation";
import {
  deleteSubadminAction,
  saveSubadminAction,
  type SubadminActionState,
} from "./actions";
import { MAX_SUBADMINS } from "@/lib/subadmin/types";
import type { SubadminView } from "@/lib/subadmin/types";

function SubadminRow({
  slot,
  existing,
}: {
  slot: number;
  existing?: SubadminView;
}) {
  const router = useRouter();
  const [state, formAction, pending] = useActionState<
    SubadminActionState,
    FormData
  >((_prev, formData) => saveSubadminAction(slot, formData), {});
  const [deleting, setDeleting] = useState(false);

  async function handleDelete() {
    const label = existing?.email ?? `lo slot ${slot}`;
    const ok = window.confirm(
      `Eliminare il sub-amministratore ${label}? Non potrà più accedere con queste credenziali.`
    );
    if (!ok) return;
    setDeleting(true);
    const res = await deleteSubadminAction(slot);
    setDeleting(false);
    if (!res.success) {
      window.alert(res.error ?? "Errore durante l'eliminazione.");
    } else {
      router.refresh();
    }
  }

  return (
    <div className={`subadmin-row${existing ? " is-active" : ""}`}>
      <div className="subadmin-head">
        <strong>
          Sub-amministratore {slot} di {MAX_SUBADMINS}
        </strong>
        {existing && (
          <span className="subadmin-status">
            Attivo · {existing.email}
          </span>
        )}
      </div>
      <form action={formAction} className="subadmin-form">
        <div className="form-grid">
          <label className="form-field span-2">
            <span className="form-label">Email</span>
            <input
              className="form-input"
              type="email"
              name="email"
              defaultValue={existing?.email ?? ""}
              required
              autoComplete="off"
              placeholder="email del sub-amministratore"
            />
          </label>
          <label className="form-field span-2">
            <span className="form-label">Password</span>
            <input
              className="form-input"
              type="password"
              name="password"
              minLength={8}
              autoComplete="new-password"
              placeholder={
                existing
                  ? "•••••••• (lascia vuoto per non cambiarla)"
                  : "min. 8 caratteri"
              }
            />
          </label>
        </div>
        <div className="subadmin-actions">
          <button
            type="submit"
            className="primary-button"
            disabled={pending || deleting}
          >
            {pending ? "Salvataggio…" : existing ? "Aggiorna" : "Crea"}
          </button>
          {existing && (
            <button
              type="button"
              className="danger-button"
              onClick={() => void handleDelete()}
              disabled={pending || deleting}
            >
              {deleting ? "Eliminazione…" : "Elimina"}
            </button>
          )}
        </div>
        {state.error && (
          <p className="form-error" role="alert">
            {state.error}
          </p>
        )}
        {state.success && (
          <p className="form-note">
            Sub-amministratore {slot} salvato.
          </p>
        )}
      </form>
    </div>
  );
}

/**
 * Sezione "Sub-amministratori" della Consolle di comando: 6 slot (email +
 * password) creati, modificati ed ELIMINATI dall'amministratore principale.
 */
export function SubadminsForm({ subadmins }: { subadmins: SubadminView[] }) {
  const bySlot = new Map(subadmins.map((s) => [s.slot, s]));
  return (
    <div>
      <p className="settings-help">
        Crea fino a {MAX_SUBADMINS} sub-amministratori: livello inferiore
        all&apos;amministratore. Possono solo{" "}
        <strong>visualizzare</strong> la piattaforma e non vedono il pulsante
        &quot;Impostazioni&quot;. Email e password restano sempre modificabili;
        con il pulsante <strong>&quot;Elimina&quot;</strong> sganci il
        sub-amministratore (non potrà più accedere).
      </p>
      <div className="subadmins-grid">
        {Array.from({ length: MAX_SUBADMINS }, (_, i) => i + 1).map((slot) => (
          <SubadminRow key={slot} slot={slot} existing={bySlot.get(slot)} />
        ))}
      </div>
    </div>
  );
}
