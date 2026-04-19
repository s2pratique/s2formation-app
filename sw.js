/* ═══════════════════════════════════════════════════
   S2 Formation — Service Worker PWA
   Version : 1.0.0
   Stratégie : Cache-first pour les assets statiques,
               Network-first pour les requêtes API Drive/Gmail
═══════════════════════════════════════════════════ */

const CACHE_NAME = 's2-formation-v1';

/* Fichiers à mettre en cache immédiatement à l'installation */
const PRECACHE_ASSETS = [
  './index.html',
  './manifest.json',
  './Pratique-TH.xlsx',
  './Pratique-ECHAF.xlsx',
  /* Bibliothèques JS externes — mises en cache au premier chargement */
  'https://cdn.jsdelivr.net/npm/pdf-lib@1.17.1/dist/pdf-lib.min.js',
  'https://cdn.jsdelivr.net/npm/exceljs@4.3.0/dist/exceljs.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js',
];

/* Domaines qui doivent TOUJOURS passer par le réseau (Drive, Gmail, OAuth) */
const NETWORK_ONLY_PATTERNS = [
  'googleapis.com',
  'accounts.google.com',
  'oauth2',
];

/* ─── INSTALLATION ─── */
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        /* On tente de mettre en cache chaque asset,
           sans bloquer si un CDN est inaccessible hors ligne */
        return Promise.allSettled(
          PRECACHE_ASSETS.map(url =>
            cache.add(url).catch(err =>
              console.warn('[SW] Impossible de mettre en cache:', url, err)
            )
          )
        );
      })
      .then(() => self.skipWaiting())
  );
});

/* ─── ACTIVATION : nettoyage des anciens caches ─── */
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys
          .filter(key => key !== CACHE_NAME)
          .map(key => {
            console.log('[SW] Suppression ancien cache:', key);
            return caches.delete(key);
          })
      )
    ).then(() => self.clients.claim())
  );
});

/* ─── INTERCEPTION DES REQUÊTES ─── */
self.addEventListener('fetch', event => {
  const url = event.request.url;

  /* 1. Requêtes réseau uniquement (Drive, OAuth, Gmail) */
  if (NETWORK_ONLY_PATTERNS.some(pattern => url.includes(pattern))) {
    event.respondWith(fetch(event.request));
    return;
  }

  /* 2. Requêtes non-GET → réseau direct */
  if (event.request.method !== 'GET') {
    event.respondWith(fetch(event.request));
    return;
  }

  /* 3. Stratégie Cache-first pour tous les assets de l'app */
  event.respondWith(
    caches.match(event.request).then(cached => {
      if (cached) {
        /* Revalidation en arrière-plan (Stale-While-Revalidate) */
        const fetchPromise = fetch(event.request)
          .then(networkResponse => {
            if (networkResponse && networkResponse.status === 200) {
              const cloned = networkResponse.clone();
              caches.open(CACHE_NAME).then(cache => cache.put(event.request, cloned));
            }
            return networkResponse;
          })
          .catch(() => { /* Hors ligne, on garde le cache */ });
        return cached; /* Réponse immédiate depuis le cache */
      }

      /* Pas en cache → réseau, puis mise en cache */
      return fetch(event.request)
        .then(networkResponse => {
          if (!networkResponse || networkResponse.status !== 200 || networkResponse.type === 'opaque') {
            return networkResponse;
          }
          const cloned = networkResponse.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(event.request, cloned));
          return networkResponse;
        })
        .catch(() => {
          /* Fallback offline : retourner la page principale */
          if (event.request.destination === 'document') {
            return caches.match('./index.html');
          }
        });
    })
  );
});

/* ─── MESSAGE : forcer la mise à jour ─── */
self.addEventListener('message', event => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});
