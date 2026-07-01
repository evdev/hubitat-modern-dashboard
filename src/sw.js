/* Pass-through service worker — satisfies Chrome install criteria; no offline caching. */
self.addEventListener("fetch", (event) => {
  event.respondWith(fetch(event.request));
});
