"use client";

import { useActionState } from "react";
import Link from "next/link";
import { updateAgentPasswordAction, type ResetPasswordState } from "../actions";
import { PasswordField } from "@/components/password-field";

export function CambiaPasswordForm({ valid }: { valid: boolean }) {
  const [state, formAction, pending] = useActionState<ResetPasswordState, FormData>(
    updateAgentPasswordAction,
    {}
  );

  if (!valid) {
    return (
      <div className="auth-card">
        <h1>Link non valido o scaduto</h1>
        <p className="auth-subtitle">
          Il link di recupero non è più valido. Richiedine uno nuovo dalla
          pagina di accesso.
        </p>
        <p className="auth-switch">
          <Link href="/recupero-password">Richiedi un nuovo link</Link>
        </p>
      </div>
    );
  }

  return (
    <div className="auth-card">
      <h1>Scegli la nuova password</h1>
      <p className="auth-subtitle">
        Inserisci la nuova password per il tuo account agente.
      </p>

      <form action={formAction} className="auth-form">
        <PasswordField
          name="password"
          label="Nuova password"
          minLength={8}
          autoComplete="new-password"
          placeholder="Almeno 8 caratteri"
        />
        <PasswordField
          name="confirm"
          label="Conferma password"
          minLength={8}
          autoComplete="new-password"
          placeholder="Ripeti la password"
        />

        {state.error && (
          <p className="form-error" role="alert">
            {state.error}
          </p>
        )}
        {state.message && (
          <p className="form-note" role="status">
            {state.message}
          </p>
        )}

        {!state.message && (
          <button
            className="primary-button auth-submit"
            type="submit"
            disabled={pending}
          >
            {pending ? "Salvataggio…" : "Aggiorna password"}
          </button>
        )}
        {state.message && (
          <p className="auth-switch">
            <Link href="/login">Vai all&apos;accesso agente</Link>
          </p>
        )}
      </form>
    </div>
  );
}
