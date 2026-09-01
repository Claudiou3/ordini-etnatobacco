"use client";

import { useState } from "react";

type TestResult = {
  ok?: boolean;
  sent?: boolean;
  recipient?: string;
  error?: string | null;
  smtp?: { server?: string; port?: string; account?: string; passwordSet?: boolean };
};

/** Pulsante "Invia email di prova" nelle Impostazioni (solo amministratore). */
export function TestEmailButton({ recipient }: { recipient: string }) {
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<TestResult | null>(null);

  async function runTest() {
    setBusy(true);
    setResult(null);
    try {
      const res = await fetch("/api/test-email");
      setResult((await res.json()) as TestResult);
    } catch (err) {
      setResult({
        ok: false,
        sent: false,
        error: "Impossibile contattare il server: " + (err as Error).message,
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="settings-item">
      <div className="panel-heading">
        <div>
          <p className="eyebrow">Verifica configurazione email</p>
          <h2>Invia un&apos;email di prova</h2>
          <p className="settings-help">
            Invia un&apos;email di prova alla casella {recipient}. Se la
            ricevi, la trasmissione degli ordini è configurata correttamente.
          </p>
        </div>
      </div>

      <div className="settings-row">
        <button
          className="primary-button table-button"
          type="button"
          onClick={runTest}
          disabled={busy}
        >
          {busy ? "Invio in corso…" : "Invia email di prova"}
        </button>
      </div>

      {result && (
        <p
          className={
            result.sent ? "form-note" : "form-error"
          }
          role="status"
        >
          {result.sent ? (
            <>📧 Email di prova inviata a {result.recipient}.</>
          ) : (
            <>⚠️ {result.error ?? "Email di prova non inviata."}</>
          )}
        </p>
      )}
    </div>
  );
}
