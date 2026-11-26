const CACHE = 'ng-v58';
/* Images et logo gardés en mémoire sur le téléphone : si le réseau flanche,
   l'appli les affiche quand même (avant : rien n'était mis en cache). */
const ESSENTIELS = ['assets/solo.png', 'assets/essentiel.png', 'assets/serenite.png', 'assets/robot_flotte.jpg', 'icons/icon-192x192.png'];
self.addEventListener('install', e => {
  self.skipWaiting();
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ESSENTIELS)).catch(() => {}));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(k => Promise.all(k.filter(n => n !== CACHE).map(n => caches.delete(n)))));
  self.clients.claim();
});
self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  if (/\.mp4$/i.test(req.url.split('?')[0])) return;   /* vidéos : lecture directe, pas de copie de 5 Mo sur le téléphone */
  const url = new URL(req.url);
  const image = url.origin === location.origin && /\.(png|jpe?g|webp|svg|gif)$/i.test(url.pathname);
  if (image) {
    /* Image : copie locale tout de suite, mise à jour en arrière-plan. */
    e.respondWith(caches.open(CACHE).then(c => c.match(req, { ignoreSearch: true }).then(local => {
      const reseau = fetch(req).then(r => { if (r.status === 200) c.put(req, r.clone()); return r; });
      return local || reseau.catch(() => fetch(req));
    })));
    return;
  }
  e.respondWith(fetch(req).then(r => {
    if (r.status === 200 && url.origin === location.origin) { const copie = r.clone(); caches.open(CACHE).then(c => c.put(req, copie)); }
    return r;
  }).catch(() => caches.match(req)));
});
