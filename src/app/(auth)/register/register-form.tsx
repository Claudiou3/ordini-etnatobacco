"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import type { CSSProperties } from "react";
import { registerAction, type AuthState } from "../actions";
import { PasswordField } from "@/components/password-field";
import type { LogoInfo } from "@/lib/logos";

export function RegisterForm({
  hasConfig,
  logos,
}: {
  hasConfig: boolean;
  logos: { logo1: LogoInfo; logo2: LogoInfo };
}) {
  const [state, formAction, pending] = useActionState<AuthState, FormData>(
    registerAction,
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
    <div className="auth-card">
      <div className="auth-logo">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={logos.logo1.src}
          alt="Logo"
          className="auth-logo-img"
          style={{ "--logo-size": `${logos.logo1.size}px` } as CSSProperties}
        />
        {logos.logo2.present && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={logos.logo2.src}
            alt="Secondo logo"
            className="auth-logo-img"
            style={{ "--logo-size": `${logos.logo2.size}px` } as CSSProperties}
          />
        )}
      </div>
      <h1>Registrazione</h1>
      <p className="auth-subtitle">Crea il tuo account agente</p>

      {!hasConfig && (
        <p className="config-warning" role="status">
          Supabase non configurato: la registrazione reale è disattivata. Puoi
          provare subito l&apos;app dalla pagina di{" "}
          <Link href="/login">login</Link> con la modalità demo.
        </p>
      )}

      <form action={formAction} onSubmit={handleSubmit} className="auth-form">
        <label className="form-field">
          <span className="form-label">Nome completo</span>
          <input
            className="form-input"
            type="text"
            name="nome"
            autoComplete="name"
            required
            minLength={2}
          />
        </label>
        <label className="form-field">
          <span className="form-label">Email</span>
          <input
            className="form-input"
            type="email"
            name="email"
            autoComplete="email"
            required
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
        {state.message && (
          <p className="form-note" role="status">
            {state.message}
          </p>
        )}

        <button className="primary-button auth-submit" type="submit" disabled={pending}>
          {pending ? "Registrazione in corso…" : "Registrati"}
        </button>
      </form>

      <p className="auth-switch">
        Hai già un account? <Link href="/login">Accedi</Link>
      </p>
    </div>
  );
}
