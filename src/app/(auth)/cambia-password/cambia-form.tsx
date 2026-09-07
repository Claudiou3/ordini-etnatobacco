"use client";

import { useActionState } from "react";
import Link from "next/link";
import { updateAgentPasswordAction, type ResetPasswordState } from "../actions";
import { PasswordField } from "@/components/password-field";

export function CambiaPasswordForm({
  token,
  email,
}: {
  token: string;
  email: string;
}) {
  const [state, formAction, pending] = useActionState<
    ResetPasswordState,
    FormData
  >(updateAgentPasswordAction, {});

  if (!token || !email) {
    return (
      <div className="auth-card">
        <h1>Link non valido o scaduto</h1>
        <p className="auth-subtitle">
          Il link di recupero non è più valido (o è arrivato da un&apos;email
          vecchia). Richiedine uno nuovo dalla pagina di accesso.
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
        <input type="hidden" name="token" value={token} />
        <input type="hidden" name="email" value={email} />
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
