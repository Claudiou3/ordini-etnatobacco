"use client";

import { useActionState } from "react";
import Link from "next/link";
import {
  completeAdminPasswordResetAction,
  type ResetPasswordState,
} from "../../../actions";
import { PasswordField } from "@/components/password-field";

export function ResetAdminPasswordForm({
  token,
  email,
}: {
  token: string;
  email: string;
}) {
  const [state, formAction, pending] = useActionState<
    ResetPasswordState,
    FormData
  >(completeAdminPasswordResetAction, {});

  return (
    <div className="auth-card">
      <h1>Scegli la nuova password</h1>
      <p className="auth-subtitle">
        Imposta la nuova password per l&apos;account amministratore.
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
            <Link href="/login/admin">Vai all&apos;accesso amministratore</Link>
          </p>
        )}
      </form>
    </div>
  );
}
