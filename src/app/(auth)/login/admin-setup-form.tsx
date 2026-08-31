"use client";

import { useActionState, useState } from "react";
import { createAdminPassword, type AuthState } from "../actions";
import { PasswordField } from "@/components/password-field";

export function AdminSetupForm() {
  const [state, formAction, pending] = useActionState<AuthState, FormData>(
    createAdminPassword,
    {}
  );
  const [localError, setLocalError] = useState<string | null>(null);

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    const data = new FormData(event.currentTarget);
    const password = String(data.get("password") ?? "");
    const confirm = String(data.get("confirm") ?? "");
    if (password !== confirm) {
      event.preventDefault();
      setLocalError("Le password non coincidono. Controlla e riprova.");
      return;
    }
    setLocalError(null);
  }

  return (
    <div className="admin-card">
      <p className="eyebrow">Primo accesso</p>
      <h2>Configurazione amministratore</h2>
      <p className="auth-subtitle">
        Crea la password per l&apos;account amministratore: potrai gestire le
        API key nella sezione Impostazioni.
      </p>
      <form action={formAction} onSubmit={handleSubmit} className="auth-form">
        <label className="form-field">
          <span className="form-label">Email amministratore</span>
          <input
            className="form-input"
            type="email"
            name="email"
            placeholder="Inserisci la tua email"
            required
            autoComplete="username"
          />
        </label>

        <PasswordField
          name="password"
          label="Password"
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

        {localError && (
          <p className="form-error" role="alert">
            {localError}
          </p>
        )}
        {state.error && (
          <p className="form-error" role="alert">
            {state.error}
          </p>
        )}

        <button className="primary-button auth-submit" type="submit" disabled={pending}>
          {pending ? "Salvataggio…" : "Crea password"}
        </button>
      </form>
    </div>
  );
}
