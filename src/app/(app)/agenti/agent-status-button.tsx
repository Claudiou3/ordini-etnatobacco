"use client";

import { useEffect, useActionState } from "react";
import { useRouter } from "next/navigation";
import {
  setAgentStatusAction,
  type SetAgentStatusResult,
} from "./actions";

/** Wrapper per useActionState: aggiunge il parametro "stato precedente". */
async function runSetAgentStatus(
  _prev: SetAgentStatusResult,
  formData: FormData
): Promise<SetAgentStatusResult> {
  return setAgentStatusAction(formData);
}

/**
 * Pulsante "Disattiva" / "Riattiva" agente (solo amministratore principale).
 * Disattivare blocca l'accesso ma CONSERVA ordini e storico provvigioni.
 */
export function AgentStatusButton({
  agentId,
  nome,
  stato,
}: {
  agentId: string;
  nome: string;
  stato: string;
}) {
  const router = useRouter();
  const active = stato === "attivo";
  const [state, formAction, pending] = useActionState<
    SetAgentStatusResult,
    FormData
  >(runSetAgentStatus, {});

  useEffect(() => {
    if (!state.success) return;
    const t = setTimeout(() => router.refresh(), 700);
    return () => clearTimeout(t);
  }, [state.success, router]);

  function confirmText(): string {
    if (active) {
      return `Disattivare l'agente "${nome}"?\n\nNon potrà più accedere all'app, ma i suoi ordini e le provvigioni resteranno salvati. Potrai riattivarlo quando vuoi.`;
    }
    return `Riattivare l'agente "${nome}"?\n\nPotrà di nuovo accedere con le sue credenziali.`;
  }

  return (
    <div className="agent-delete-wrap">
      <form
        action={formAction}
        onSubmit={(event) => {
          if (!window.confirm(confirmText())) {
            event.preventDefault();
          }
        }}
      >
        <input type="hidden" name="agentId" value={agentId} />
        <input
          type="hidden"
          name="stato"
          value={active ? "disattivato" : "attivo"}
        />
        <button
          type="submit"
          className="secondary-button table-button"
          disabled={pending}
        >
          {pending
            ? "Salvataggio…"
            : active
              ? "Disattiva"
              : "Riattiva"}
        </button>
      </form>
      {state.error && (
        <p className="form-error agent-delete-msg" role="alert">
          {state.error}
        </p>
      )}
      {state.success && (
        <p className="form-note agent-delete-msg" role="status">
          {state.stato === "attivo" ? "Agente riattivato." : "Agente disattivato."}{" "}
          Aggiorno…
        </p>
      )}
    </div>
  );
}
