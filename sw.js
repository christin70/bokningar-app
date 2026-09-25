importScripts("https://www.gstatic.com/firebasejs/12.16.0/firebase-app-compat.js");
importScripts("https://www.gstatic.com/firebasejs/12.16.0/firebase-messaging-compat.js");
firebase.initializeApp({
  apiKey: "AIzaSyBeucnfefb9awrRv8ziTmqZxBpMWF40hpY",
  authDomain: "bokningar-deb17.firebaseapp.com",
  projectId: "bokningar-deb17",
  storageBucket: "bokningar-deb17.firebasestorage.app",
  messagingSenderId: "964863988500",
  appId: "1:964863988500:web:fe26f729eb390dcf676801"
});


const messaging = firebase.messaging();
messaging.onBackgroundMessage((payload) => {
  console.log("Firebase bakgrundsmeddelande:", payload);
});
;const CACHE="bokningar-v2-3";
const ASSETS=["./","./index.html","./manifest.webmanifest","./icon.svg"];
self.addEventListener("install",e=>e.waitUntil(caches.open(CACHE).then(c=>c.addAll(ASSETS))));
self.addEventListener("activate",e=>e.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k!==CACHE).map(k=>caches.delete(k))))));
self.addEventListener("fetch", e => {
  if (e.request.method !== "GET") return;

  const url = new URL(e.request.url);

  // Cacha bara filer från vår egen webbplats.
  // Firestore/Firebase-anrop ska gå direkt till nätverket.
  if (url.origin !== self.location.origin) return;

  e.respondWith(
    fetch(e.request)
      .then(r => {
        const copy = r.clone();
        caches.open(CACHE).then(c => c.put(e.request, copy));
        return r;
      })
      .catch(() => caches.match(e.request))
  );
});
self.addEventListener("push", e => {
const data = e.data ? e.data.json() : {}; 
const title = data.notification?.title || "Familjebokningar";
const options = {
body: data.notification?.body || "En ny bokning har gjorts.",
icon: "./apple-touch-icon.png",
badge: "./apple-touch-icon.png"
};
e.waitUntil(self.registration.showNotification(title, options));
});




