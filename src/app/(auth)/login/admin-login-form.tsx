"use client";

import { useActionState } from "react";
import { adminLogin, type AuthState } from "../actions";
import { PasswordField } from "@/components/password-field";

export function AdminLoginForm() {
  const [state, formAction, pending] = useActionState<AuthState, FormData>(
    adminLogin,
    {}
  );

  return (
    <div className="admin-card">
      <p className="eyebrow">Area riservata</p>
      <h2>Accesso amministratore</h2>
      <p className="auth-subtitle">
        Accedi come amministratore o sub-amministratore. Solo
        l&apos;amministratore può modificare le Impostazioni.
      </p>
      <form action={formAction} className="auth-form" autoComplete="off">
        <label className="form-field">
          <span className="form-label">Email</span>
          <input
            className="form-input"
            type="email"
            name="email"
            placeholder="Inserisci la tua email"
            required
            autoComplete="off"
          />
        </label>

        <PasswordField
          name="password"
          label="Password"
          autoComplete="new-password"
          placeholder="Inserisci la password"
        />

        {state.error && (
          <p className="form-error" role="alert">
            {state.error}
          </p>
        )}

        <button className="primary-button auth-submit" type="submit" disabled={pending}>
          {pending ? "Accesso…" : "Accedi"}
        </button>
      </form>
    </div>
  );
}
