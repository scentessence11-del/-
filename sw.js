const CACHE_NAME = "makhzouni-v6";
const ASSETS = [
  "./",
  "./styles.css",
  "./app.js",
  "./cloud.js",
  "./manifest.json",
  "https://fonts.googleapis.com/css2?family=Tajawal:wght@300;400;500;700;900&display=swap",
  "https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.0/css/all.min.css",
  "https://unpkg.com/html5-qrcode",
  "https://cdn.jsdelivr.net/npm/chart.js",
  "https://cdn.jsdelivr.net/npm/jsbarcode@3.11.6/dist/JsBarcode.all.min.js",
  "https://cdnjs.cloudflare.com/ajax/libs/html2pdf.js/0.10.1/html2pdf.bundle.min.js",
  "https://www.gstatic.com/firebasejs/10.12.2/firebase-app-compat.js",
  "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth-compat.js",
  "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore-compat.js"
];

self.addEventListener("install", function (e) {
  e.waitUntil(
    caches.open(CACHE_NAME).then(function (cache) {
      return Promise.all(
        ASSETS.map(function (url) {
          return cache.add(url).catch(function (err) {
            console.warn("Cache miss:", url, err);
          });
        })
      );
    }).then(function () { return self.skipWaiting(); })
  );
});

self.addEventListener("activate", function (e) {
  e.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(
        keys.filter(function (k) { return k !== CACHE_NAME; })
            .map(function (k) { return caches.delete(k); })
      );
    }).then(function () { return self.clients.claim(); })
  );
});

self.addEventListener("fetch", function (e) {
  if (e.request.method !== "GET") return;

  // لا تخزن Firebase API
  var url = e.request.url;
  if (url.indexOf("firestore.googleapis.com") > -1 ||
      url.indexOf("identitytoolkit.googleapis.com") > -1 ||
      url.indexOf("securetoken.googleapis.com") > -1) {
    return;
  }

  // استثناء مهم: لا تخزن index.html أبداً، اجلبها دائماً من السيرفر
  if (url.indexOf("index.html") > -1 || url.endsWith("/")) {
    e.respondWith(fetch(e.request));
    return;
  }

  e.respondWith(
    caches.match(e.request).then(function (cached) {
      if (cached) return cached;
      return fetch(e.request).then(function (res) {
        if (res && res.status === 200 && (res.type === "basic" || res.type === "cors")) {
          var clone = res.clone();
          caches.open(CACHE_NAME).then(function (cache) { cache.put(e.request, clone); });
        }
        return res;
      }).catch(function () {
        return caches.match("./index.html");
      });
    })
  );
});