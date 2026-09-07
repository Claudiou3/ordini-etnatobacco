"use client";

import { useEffect, useActionState } from "react";
import { useRouter } from "next/navigation";
import { deleteAgentAction, type DeleteAgentResult } from "./actions";

/** Wrapper per useActionState: aggiunge il parametro "stato precedente". */
async function runDeleteAgent(
  _prev: DeleteAgentResult,
  formData: FormData
): Promise<DeleteAgentResult> {
  return deleteAgentAction(formData);
}

/**
 * Pulsante "Elimina agente" (solo amministratore principale).
 * Mostra una conferma con il numero di ordini che verranno eliminati in
 * cascata: l'operazione è DEFINITIVA (account, agente e suoi ordini).
 */
export function DeleteAgentButton({
  agentId,
  nome,
  ordersCount,
}: {
  agentId: string;
  nome: string;
  ordersCount: number;
}) {
  const router = useRouter();
  const [state, formAction, pending] = useActionState<
    DeleteAgentResult,
    FormData
  >(runDeleteAgent, {});

  useEffect(() => {
    if (!state.success) return;
    const t = setTimeout(() => router.refresh(), 700);
    return () => clearTimeout(t);
  }, [state.success, router]);

  const warning =
    ordersCount > 0
      ? `Eliminare DEFINITIVAMENTE l'agente "${nome}" con i suoi ${ordersCount} ${
          ordersCount === 1 ? "ordine" : "ordini"
        } (inclusi i file Excel)?\n\nL'operazione non si può annullare.`
      : `Eliminare DEFINITIVAMENTE l'agente "${nome}"?\n\nL'operazione non si può annullare.`;

  return (
    <div className="agent-delete-wrap">
      <form
        action={formAction}
        onSubmit={(event) => {
          if (!window.confirm(warning)) {
            event.preventDefault();
          }
        }}
      >
        <input type="hidden" name="agentId" value={agentId} />
        <button
          type="submit"
          className="danger-button table-button"
          disabled={pending}
        >
          {pending ? "Eliminazione…" : "Elimina agente"}
        </button>
      </form>
      {state.error && (
        <p className="form-error agent-delete-msg" role="alert">
          {state.error}
        </p>
      )}
      {state.success && (
        <p className="form-note agent-delete-msg" role="status">
          Agente eliminato
          {state.deletedOrders
            ? ` (${state.deletedOrders} ${
                state.deletedOrders === 1 ? "ordine" : "ordini"
              } rimossi)`
            : ""}
          . Aggiorno…
        </p>
      )}
    </div>
  );
}
