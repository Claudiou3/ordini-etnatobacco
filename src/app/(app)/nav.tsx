"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export function AppNav({ isAdmin = false }: { isAdmin?: boolean }) {
  const pathname = usePathname();

  const links = [
    // "Dashboard" visibile sia per gli agenti sia per l'amministratore
    // (schermata iniziale con riepiloghi e ultimi ordini).
    { href: "/dashboard", label: "Dashboard" },
    { href: "/clienti", label: "Clienti" },
    {
      href: "/ordini",
      label: isAdmin ? "Ordini ricevuti" : "I miei ordini",
    },
    ...(isAdmin
      ? [
          { href: "/console", label: "Consolle" },
          { href: "/agenti", label: "Agenti" },
        ]
      : []),
  ];

  return (
    <nav className="main-nav" aria-label="Navigazione principale">
      {links.map((link) => {
        const active = pathname === link.href || pathname.startsWith(link.href + "/");
        return (
          <Link
            key={link.href}
            href={link.href}
            className={`nav-link${active ? " active" : ""}`}
          >
            {link.label}
          </Link>
        );
      })}
    </nav>
  );
}
