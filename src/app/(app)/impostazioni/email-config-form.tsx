"use client";

import { useActionState } from "react";
import type { EmailConfigWithStatus } from "@/lib/email/config";
import {
  saveEmailConfigAction,
  type EmailConfigActionState,
} from "./actions";

/** Dropdown "Configurazione server email" nelle Impostazioni. */
export function EmailConfigForm({
  config,
}: {
  config: EmailConfigWithStatus;
}) {
  const [state, formAction, pending] =
    useActionState<EmailConfigActionState, FormData>(saveEmailConfigAction, {});

  return (
    <details className="email-config-panel">
      <summary className="email-config-head">
        <span>
          <strong>Configurazione server email</strong>
          <small>
            Account mittente, server SMTP/IMAP e password (hosting).
          </small>
        </span>
        <span className="catalog-group-caret" aria-hidden="true">
          ▾
        </span>
      </summary>

      <form action={formAction} className="email-config-form">
        <div className="email-config-grid">
          <label className="form-field">
            <span className="form-label">Nome visualizzato</span>
            <input
              className="form-input"
              name="displayName"
              defaultValue={config.displayName}
            />
          </label>
          <label className="form-field">
            <span className="form-label">Indirizzo e-mail (mittente)</span>
            <input
              className="form-input"
              name="account"
              type="email"
              defaultValue={config.account}
            />
          </label>

          <label className="form-field">
            <span className="form-label">Server posta in arrivo (IMAP)</span>
            <input
              className="form-input"
              name="imapServer"
              defaultValue={config.imapServer}
            />
          </label>
          <label className="form-field">
            <span className="form-label">Porta in arrivo</span>
            <input
              className="form-input"
              name="imapPort"
              defaultValue={config.imapPort}
            />
          </label>
          <label className="form-field">
            <span className="form-label">Sicurezza in arrivo</span>
            <input
              className="form-input"
              name="imapSecure"
              defaultValue={config.imapSecure}
            />
          </label>

          <label className="form-field">
            <span className="form-label">Server posta in uscita (SMTP)</span>
            <input
              className="form-input"
              name="smtpServer"
              defaultValue={config.smtpServer}
            />
          </label>
          <label className="form-field">
            <span className="form-label">Porta in uscita</span>
            <input
              className="form-input"
              name="smtpPort"
              defaultValue={config.smtpPort}
            />
          </label>
          <label className="form-field">
            <span className="form-label">Sicurezza in uscita</span>
            <input
              className="form-input"
              name="smtpSecure"
              defaultValue={config.smtpSecure}
            />
          </label>

          <label className="form-field">
            <span className="form-label">Nome utente account</span>
            <input
              className="form-input"
              name="username"
              defaultValue={config.username}
            />
          </label>
          <label className="form-field">
            <span className="form-label">Password</span>
            <input
              className="form-input"
              name="password"
              type="password"
              autoComplete="new-password"
              placeholder={
                config.passwordSet
                  ? "•••••••• (inserisci la nuova password per aggiornarla)"
                  : "Inserisci la password…"
              }
            />
          </label>
        </div>

        <div className="form-actions">
          <button
            className="primary-button"
            type="submit"
            disabled={pending}
          >
            {pending ? "Salvataggio…" : "Salva configurazione email"}
          </button>
        </div>

        {state.error && (
          <p className="form-error" role="alert">
            {state.error}
          </p>
        )}
        {state.success && (
          <p className="form-note" role="status">
            Configurazione email salvata.
          </p>
        )}
      </form>
    </details>
  );
}
