"use client";

import { useActionState } from "react";
import type { SettingsStatus } from "@/lib/settings/runtime";
import { saveSetting, clearSetting, type SettingsActionState } from "./actions";

export function SettingsForm({ keys }: { keys: SettingsStatus[] }) {
  const [state, formAction, pending] = useActionState<SettingsActionState, FormData>(
    saveSetting,
    {}
  );

  return (
    <div className="settings-list">
      <p className="config-warning" role="status">
        I valori vengono salvati <strong>crittografati</strong> (AES-256-GCM) e
        <strong> non vengono mai mostrati di nuovo</strong>: vedrai solo lo stato
        &quot;configurata / non configurata&quot;. Le chiavi verranno realmente
        utilizzate dall&apos;app quando la piattaforma sarà online.
      </p>

      {keys.map((key) => (
        <article key={key.name} className="content-panel settings-item">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">{key.name}</p>
              <h2>{key.label}</h2>
              <p className="settings-help">{key.help}</p>
            </div>
            <span
              className={`status-pill${key.configured ? " status-pill-on" : ""}`}
            >
              {key.configured ? "Configurata" : "Non configurata"}
            </span>
          </div>

          <div className="settings-row">
            <form action={formAction} className="settings-form-inline">
              <input type="hidden" name="name" value={key.name} />
              <input
                className="form-input"
                type="password"
                name="value"
                autoComplete="off"
                placeholder={
                  key.configured
                    ? "•••••••••••• (inserisci il nuovo valore per aggiornare)"
                    : "Inserisci il valore…"
                }
              />
              <button className="primary-button table-button" type="submit" disabled={pending}>
                {pending ? "Salvataggio…" : key.configured ? "Aggiorna" : "Salva"}
              </button>
            </form>

            {key.configured && (
              <form action={clearSetting}>
                <input type="hidden" name="name" value={key.name} />
                <button className="danger-button table-button" type="submit">
                  Rimuovi
                </button>
              </form>
            )}
          </div>

          {state.name === key.name && state.error && (
            <p className="form-error" role="alert">
              {state.error}
            </p>
          )}
          {state.name === key.name && state.success && (
            <p className="form-note" role="status">
              Valore salvato e crittografato.
            </p>
          )}
        </article>
      ))}
    </div>
  );
}
