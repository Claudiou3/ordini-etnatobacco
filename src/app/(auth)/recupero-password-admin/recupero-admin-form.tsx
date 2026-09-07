"use client";

import { useRef, useActionState } from "react";
import Link from "next/link";
import {
  requestAdminPasswordReset,
  type ResetPasswordState,
} from "../actions";

export function RecuperoAdminForm() {
  const formRef = useRef<HTMLFormElement | null>(null);
  const [state, formAction, pending] = useActionState<
    ResetPasswordState,
    FormData
  >(requestAdminPasswordReset, {});

  function handleSubmit() {
    const input = formRef.current?.querySelector<HTMLInputElement>(
      'input[name="origin"]'
    );
    if (input) input.value = window.location.origin;
  }

  return (
    <div className="auth-card">
      <h1>Password dimenticata?</h1>
      <p className="auth-subtitle">
        Inserisci l&apos;email dell&apos;account amministratore: riceverai un
        link (valido 30 minuti) per scegliere una nuova password.
      </p>

      <form
        ref={formRef}
        action={formAction}
        onSubmit={handleSubmit}
        className="auth-form"
      >
        <input type="hidden" name="origin" value="" />
        <label className="form-field">
          <span className="form-label">Email amministratore</span>
          <input
            className="form-input"
            type="email"
            name="email"
            autoComplete="email"
            required
          />
        </label>

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

        <button
          className="primary-button auth-submit"
          type="submit"
          disabled={pending}
        >
          {pending ? "Invio…" : "Invia link di recupero"}
        </button>
      </form>

      <p className="auth-switch">
        <Link href="/login/admin">← Torna all&apos;accesso amministratore</Link>
      </p>
    </div>
  );
}
