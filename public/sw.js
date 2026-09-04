/* Service Worker "ordini etnatobacco".
 *
 * Perché esiste: Chrome (Android) propone la vera installazione PWA
 * ("Installa app") SOLO se la pagina è controllata da un Service Worker con
 * un gestore "fetch". Senza Service Worker Chrome offre soltanto la
 * "scorciatoia", che si apre dentro il browser e mostra il logo di Chrome
 * accanto all'icona. Con questo file l'app si installa come applicazione
 * vera e propria (schermo intero, senza barra del browser, con l'icona
 * caricata dall'amministratore).
 *
 * Scelta di rete: nessuna cache dei contenuti. Il gestore fetch lascia
 * passare tutto verso la rete (l'app deve restare sempre aggiornata);
 * la sua presenza è ciò che rende l'app installabile.
 */

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  // Interessa solo le richieste GET (le altre le lascia al browser).
  if (request.method !== "GET") return;
  // Navigazioni di pagina (incluso l'avvio dell'app dall'icona sulla Home):
  // NON intercettare. Se il Service Worker risponde alla navigazione di
  // avvio, su iPhone/iPad la schermata può restare BIANCA o l'app bloccarsi
  // (primo avvio dopo l'installazione, rete lenta, aggiornamento SW in
  // corso). Il browser carica comunque la pagina da solo; la presenza del
  // gestore "fetch" basta per rendere l'app installabile.
  if (request.mode === "navigate") return;

  event.respondWith(fetch(request));
});