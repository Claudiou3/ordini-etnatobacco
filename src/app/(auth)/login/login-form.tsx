"use client";

import Link from "next/link";
import { useActionState } from "react";
import { loginAction, loginDemo, type AuthState } from "../actions";
import { AdminSetupForm } from "./admin-setup-form";
import { AdminLoginForm } from "./admin-login-form";
import type { LogoInfo } from "@/lib/logos";

export function LoginForm({
  hasConfig,
  hasAdmin,
  logos,
}: {
  hasConfig: boolean;
  hasAdmin: boolean;
  logos: { logo1: LogoInfo; logo2: LogoInfo };
}) {
  const [state, formAction, pending] = useActionState<AuthState, FormData>(
    loginAction,
    {}
  );

  return (
    <div className="auth-card">
      <div className="auth-logo">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={logos.logo1.src} alt="Logo" className="auth-logo-img" />
        {logos.logo2.present && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={logos.logo2.src} alt="Secondo logo" className="auth-logo-img" />
        )}
      </div>
      <h1>Accedi</h1>
      <p className="auth-subtitle">Accedi alla tua area agente</p>

      {!hasAdmin ? (
        <AdminSetupForm />
      ) : (
        <AdminLoginForm />
      )}

      <div className="auth-divider">Area agente</div>

      {!hasConfig ? (
        <div className="demo-panel">
          <p className="demo-text">
            Supabase non configurato: entra come agente demo per esplorare
            l&apos;app. In alternativa, dall&apos;accesso amministratore puoi
            inserire le API key nelle Impostazioni.
          </p>
          <form action={loginDemo}>
            <button type="submit" className="primary-button auth-submit">
              Entra in modalità demo
            </button>
          </form>
        </div>
      ) : (
        <form action={formAction} className="auth-form">
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
          <label className="form-field">
            <span className="form-label">Password</span>
            <input
              className="form-input"
              type="password"
              name="password"
              autoComplete="current-password"
              required
              minLength={8}
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

          <button className="primary-button auth-submit" type="submit" disabled={pending}>
            {pending ? "Accesso in corso…" : "Accedi"}
          </button>
        </form>
      )}

      <p className="auth-switch">
        Non hai un account? <Link href="/register">Registrati</Link>
      </p>
    </div>
  );
}
