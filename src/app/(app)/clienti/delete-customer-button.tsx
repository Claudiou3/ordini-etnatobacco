"use client";

import { deleteCustomer } from "./actions";

export function DeleteCustomerButton({ id, nome }: { id: string; nome: string }) {
  return (
    <form
      action={deleteCustomer}
      onSubmit={(event) => {
        if (!window.confirm(`Eliminare il cliente "${nome}"?`)) {
          event.preventDefault();
        }
      }}
    >
      <input type="hidden" name="id" value={id} />
      <button type="submit" className="danger-button table-button">
        Elimina
      </button>
    </form>
  );
}
