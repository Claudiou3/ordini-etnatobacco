"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import {
  updateAdminCredentialsAction,
  verifyAdminCredentialsAction,
} from "./actions";

function EyeIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      fill="none"
      viewBox="0 0 24 24"
      strokeWidth={1.8}
      stroke="currentColor"
      width="18"
      height="18"
      aria-hidden="true"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M2.036 12.322a1.012 1.012 0 0 1 0-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178Z"
      />
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z"
      />
    </svg>
  );
}

function EyeSlashIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      fill="none"
      viewBox="0 0 24 24"
      strokeWidth={1.8}
      stroke="currentColor"
      width="18"
      height="18"
      aria-hidden="true"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M3.98 8.223A10.477 10.477 0 0 0 1.934 12C3.226 16.338 7.244 19.5 12 19.5c.993 0 1.953-.138 2.863-.395M6.228 6.228A10.451 10.451 0 0 1 12 4.5c4.756 0 8.773 3.162 10.065 7.498a10.522 10.522 0 0 1-4.293 5.774M6.228 6.228L3 3m3.228 3.228 3.65 3.65m7.894 7.894L21 21m-3.228-3.228-3.65-3.65m0 0a3 3 0 1 0-4.243-4.243m4.242 4.242L9.88 9.88"
      />
    </svg>
  );
}

function PasswordInput({
  value,
  onChange,
  placeholder,
  autoComplete,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  autoComplete?: string;
}) {
  const [visible, setVisible] = useState(false);
  return (
    <span className="password-field">
      <input
        className="form-input"
        type={visible ? "text" : "password"}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        required
        minLength={8}
        autoComplete={autoComplete}
        placeholder={placeholder}
      />
      <button
        type="button"
        className="password-toggle"
        onClick={() => setVisible((v) => !v)}
        aria-label={visible ? "Nascondi password" : "Mostra password"}
        aria-pressed={visible}
        tabIndex={-1}
      >
        {visible ? <EyeSlashIcon /> : <EyeIcon />}
      </button>
    </span>
  );
}

/**
 * Pannello per SOSTITUIRE l'utente amministratore (indirizzo email) e la
 * password. Prima chiede le credenziali attuali; solo se coincidono abilita
 * la riscrittura del nuovo utente e della nuova password.
 * Usato sia nel modale della Consolle sia nella pagina /impostazioni.
 */
export function AdminCredentialsPanel() {
  const router = useRouter();
  const [currentEmail, setCurrentEmail] = useState("");
  const [currentPassword, setCurrentPassword] = useState("");
  const [newEmail, setNewEmail] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [verified, setVerified] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  async function handleVerify() {
    setBusy(true);
    setError(null);
    setMessage(null);
    const res = await verifyAdminCredentialsAction(
      currentEmail,
      currentPassword
    );
    if (!res.ok) {
      setError(res.error ?? "Verifica non riuscita.");
    } else {
      setVerified(true);
    }
    setBusy(false);
  }

  async function handleSave() {
    setBusy(true);
    setError(null);
    setMessage(null);
    const res = await updateAdminCredentialsAction(
      currentEmail,
      currentPassword,
      newEmail,
      newPassword,
      confirmPassword
    );
    if (!res.ok) {
      setError(res.error ?? "Aggiornamento non riuscito.");
    } else {
      setVerified(false);
      setMessage(res.message ?? "Credenziali aggiornate.");
      // La sessione corrente è stata invalidata: porta al login.
      window.setTimeout(() => {
        router.push("/login");
      }, 1800);
    }
    setBusy(false);
  }

  const currentComplete = currentEmail.trim() !== "" && currentPassword !== "";


  return (
    <>
      <p className="settings-help">
        <strong>
          Sostituisci utente amministratore (indirizzo email) e password.
        </strong>{" "}
        Inserisci prima le credenziali attuali: se coincidono potrai riscrivere
        il nuovo utente e la nuova password.
      </p>

      <section className="admin-cred-group">
        <p className="eyebrow">Credenziali attuali</p>
        <div className="form-grid">
          <label className="form-field span-2">
            <span className="form-label">
              Utente attuale (indirizzo email)
            </span>
            <input
              className="form-input"
              type="email"
              value={currentEmail}
              onChange={(e) => setCurrentEmail(e.target.value)}
              autoComplete="username"
              placeholder="email attuale"
            />
          </label>
          <label className="form-field span-2">
            <span className="form-label">Password attuale</span>
            <PasswordInput
              value={currentPassword}
              onChange={setCurrentPassword}
              autoComplete="current-password"
              placeholder="••••••••"
            />
          </label>
        </div>
        <div className="form-actions">
          <button
            type="button"
            className="primary-button"
            onClick={handleVerify}
            disabled={busy || !currentComplete}
          >
            {busy ? "Verifica in corso…" : "Verifica credenziali"}
          </button>
        </div>
      </section>

      {verified && (
        <section className="admin-cred-group">
          <p className="eyebrow">Nuove credenziali</p>
          <div className="form-grid">
            <label className="form-field span-2">
              <span className="form-label">
                Nuovo utente (indirizzo email)
              </span>
              <input
                className="form-input"
                type="email"
                value={newEmail}
                onChange={(e) => setNewEmail(e.target.value)}
                autoComplete="off"
                placeholder="nuovo indirizzo email"
              />
            </label>
            <label className="form-field">
              <span className="form-label">Nuova password</span>
              <PasswordInput
                value={newPassword}
                onChange={setNewPassword}
                autoComplete="new-password"
                placeholder="min. 8 caratteri"
              />
            </label>
            <label className="form-field">
              <span className="form-label">Conferma nuova password</span>
              <PasswordInput
                value={confirmPassword}
                onChange={setConfirmPassword}
                autoComplete="new-password"
                placeholder="ripeti la password"
              />
            </label>
          </div>
          <div className="form-actions">
            <button
              type="button"
              className="green-button"
              onClick={handleSave}
              disabled={
                busy ||
                newEmail.trim() === "" ||
                newPassword === "" ||
                confirmPassword === ""
              }
            >
              {busy ? "Salvataggio…" : "Salva nuove credenziali"}
            </button>
          </div>
        </section>
      )}

      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      {message && <p className="form-note">{message}</p>}
    </>
  );
}

