// No-op service worker file to avoid 404 noise from browsers/extensions
self.addEventListener("install", () => {
  self.skipWaiting();
});
