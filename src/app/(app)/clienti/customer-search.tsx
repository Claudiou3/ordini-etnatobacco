"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { FormEvent } from "react";
import type { Customer } from "@/lib/types";
import { searchClientiAction } from "./actions";
import { CustomerCard } from "./customer-card";

/**
 * Ricerca clienti "dal vivo" (come in Nuovo ordine): mentre l'agente digita
 * ragione sociale, P.IVA, codice fiscale o citta', i risultati compaiono
 * subito sotto, senza bisogno di premere "Cerca" o ricaricare la pagina.
 */
export function CustomerSearch() {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Customer[]>([]);
  const [searching, setSearching] = useState(false);
  const [searched, setSearched] = useState(false);
  const seq = useRef(0);

  const runSearch = useCallback(async (raw: string) => {
    const q = raw.trim();
    const id = ++seq.current;
    if (q.length < 2) {
      setResults([]);
      setSearched(false);
      setSearching(false);
      return;
    }
    setSearching(true);
    const res = await searchClientiAction(q, 30);
    if (id !== seq.current) return; // risposta vecchia: ignora
    setSearching(false);
    setResults(res);
    setSearched(true);
  }, []);

  useEffect(() => {
    const q = query.trim();
    const id = ++seq.current;
    if (q.length < 2) {
      const timer = setTimeout(() => {
        if (id !== seq.current) return;
        setResults([]);
        setSearched(false);
        setSearching(false);
      }, 0);
      return () => clearTimeout(timer);
    }
    const timer = setTimeout(() => void runSearch(q), 350);
    return () => clearTimeout(timer);
  }, [query, runSearch]);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void runSearch(query);
  }

  function reset() {
    setQuery("");
    setResults([]);
    setSearched(false);
    setSearching(false);
  }

  const q = query.trim();

  return (
    <div>
      <form onSubmit={handleSubmit} className="search-row" role="search">
        <label className="search-field">
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Ragione sociale, P.IVA, codice fiscale o città…"
            autoComplete="off"
          />
        </label>
        <button type="submit" className="primary-button" disabled={searching}>
          {searching ? "Ricerca…" : "Cerca"}
        </button>
        {q && (
          <button type="button" className="outline-button" onClick={reset}>
            Azzera
          </button>
        )}
      </form>

      {searching && (
        <p className="empty-state">
          <span className="search-spinner" aria-hidden="true" /> Ricerca in
          corso…
        </p>
      )}

      {!searching && q.length < 2 && (
        <p className="empty-state">
          Digita almeno 2 caratteri per cercare un cliente nell&apos;anagrafica
          (ragione sociale, P.IVA, codice fiscale o città).
        </p>
      )}

      {!searching && searched && results.length === 0 && (
        <p className="empty-state">
          Nessun cliente trovato per &quot;{q}&quot;. Puoi inserirlo nella
          sezione &quot;Nuovo inserimento&quot; qui sotto.
        </p>
      )}

      {!searching && searched && results.length > 0 && (
        <>
          <p className="list-meta">
            {results.length} clienti trovati per &quot;{q}&quot;
          </p>
          <div className="customer-list">
            {results.map((customer) => (
              <CustomerCard key={customer.id} customer={customer} />
            ))}
          </div>
        </>
      )}
    </div>
  );
}
