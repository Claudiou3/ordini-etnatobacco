"use client";

import { logoutAction } from "@/app/(auth)/actions";

export function LogoutButton() {
  return (
    <form action={logoutAction}>
      <button type="submit" className="outline-button">
        Esci
      </button>
    </form>
  );
}
