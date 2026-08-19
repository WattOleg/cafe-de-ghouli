/* Offline shell: cache HTML so Safari can open the app without network after first visit */
var CACHE = 'cafe-de-ghouli-shell-v5';

self.addEventListener('install', function (e) {
  e.waitUntil(
    caches.open(CACHE).then(function (cache) {
      var urls = ['./', './index.html', './manifest.json', './apple-touch-icon.png'];
      return Promise.all(
        urls.map(function (url) {
          return cache.add(url).catch(function (err) {
            console.warn('Failed to cache:', url, err);
          });
        })
      );
    })
  );
  self.skipWaiting();
});

self.addEventListener('activate', function (e) {
  e.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(keys.filter(function (k) { return k !== CACHE; }).map(function (k) {
        return caches.delete(k);
      }));
    }).then(function () {
      return self.clients.claim();
    })
  );
});

self.addEventListener('fetch', function (e) {
  var req = e.request;
  if (req.method !== 'GET') return;
  var url = req.url;
  if (url.indexOf('script.google') !== -1) return;
  if (url.indexOf('supabase.co') !== -1) return;
  if (url.indexOf('jsdelivr.net') !== -1) return;
  if (url.indexOf('fonts.googleapis') !== -1 || url.indexOf('fonts.gstatic') !== -1) return;

  e.respondWith(
    fetch(req)
      .then(function (res) {
        if (res && res.status === 200 && res.type === 'basic') {
          var copy = res.clone();
          caches.open(CACHE).then(function (c) {
            c.put(req, copy);
          });
        }
        return res;
      })
      .catch(function () {
        return caches.match(req).then(function (hit) {
          if (hit) return hit;
          if (req.mode === 'navigate' || (req.headers && req.headers.get && req.headers.get('accept') && req.headers.get('accept').indexOf('text/html') !== -1)) {
            return caches.match('./index.html') || caches.match('index.html');
          }
        });
      })
  );
});
