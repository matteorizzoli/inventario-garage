// Service worker: tiene in cache tutti i file dell'app per l'uso offline.
//
// AD OGNI PUBBLICAZIONE DI MODIFICHE: incrementare VERSIONE, altrimenti i
// dispositivi continuano a usare i file in cache. Se si aggiunge un file,
// inserirlo in FILE_APP (verifica: `node strumenti/verifica-sw.mjs`).

const VERSIONE = '0.1.0';
const PREFISSO = 'inventario-garage-';
const CACHE = `${PREFISSO}${VERSIONE}`;

// Percorsi relativi alla posizione di sw.js: funzionano anche in una sottocartella.
const FILE_APP = [
  './',
  'index.html',
  'manifest.webmanifest',
  'css/app.css',
  'js/app.js',
  'js/backup.js',
  'js/dati.js',
  'js/db.js',
  'js/foto.js',
  'js/modello.js',
  'js/pwa.js',
  'js/sync.js',
  'js/util.js',
  'js/viste/aggiungi.js',
  'js/viste/articolo.js',
  'js/viste/campi-articolo.js',
  'js/viste/cerca.js',
  'js/viste/componenti.js',
  'js/viste/impostazioni.js',
  'js/viste/selettore.js',
  'js/viste/ubicazione-form.js',
  'js/viste/ubicazione.js',
  'js/viste/ubicazioni.js',
  'icone/apple-touch-icon.png',
  'icone/icona-192.png',
  'icone/icona-512.png',
  'icone/icona-maskable-512.png',
];

self.addEventListener('install', (ev) => {
  // cache: 'reload' scavalca la cache HTTP (GitHub Pages: max-age 10 minuti),
  // così una nuova versione non mescola file vecchi e nuovi.
  ev.waitUntil(
    caches.open(CACHE).then((c) => c.addAll(FILE_APP.map((f) => new Request(f, { cache: 'reload' }))))
  );
});

self.addEventListener('activate', (ev) => {
  ev.waitUntil(
    (async () => {
      for (const k of await caches.keys()) {
        if (k.startsWith(PREFISSO) && k !== CACHE) await caches.delete(k);
      }
      await self.clients.claim();
    })()
  );
});

self.addEventListener('message', (ev) => {
  if (ev.data?.tipo === 'salta-attesa') self.skipWaiting();
  if (ev.data?.tipo === 'versione') ev.ports[0]?.postMessage({ versione: VERSIONE });
});

// Prima la cache, poi la rete: in garage la rete è scarsa e non deve rallentare l'avvio.
self.addEventListener('fetch', (ev) => {
  const req = ev.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  ev.respondWith(
    (async () => {
      const cache = await caches.open(CACHE);
      if (req.mode === 'navigate') {
        const pagina = await cache.match(new URL('index.html', self.registration.scope).href);
        if (pagina) return pagina;
      }
      return (await cache.match(req, { ignoreSearch: true })) || fetch(req);
    })()
  );
});
