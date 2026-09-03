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
  event.respondWith(fetch(request));
});