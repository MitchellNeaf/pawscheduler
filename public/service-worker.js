// Minimal service worker — intentionally does NOT cache or intercept
// requests. Its only job is to exist and be active, since Chrome/Edge
// require an active service worker before offering to install a site
// as an app. Given how often tonight's issues turned out to be "the
// deployed version is stale," a caching service worker here would risk
// making that exact problem worse — so this stays a no-op on purpose.

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

// No fetch handler — requests pass through untouched, straight to the
// network, exactly as if no service worker existed at all.