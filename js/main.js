/**
 * Entry point: starts the router, registers the service worker
 * and asks the browser to keep our data permanently.
 */
import { startRouter } from './router.js';
import { requestPersistentStorage } from './db/storage.js';
import { ensureFirstRun } from './db/settings.js';
import { toast } from './components/toast.js';

startRouter(document.getElementById('screen'));
registerServiceWorker();

// Best effort: without this, browsers may evict IndexedDB under storage pressure.
requestPersistentStorage().catch(() => {});

// Starts the clock for the weekly backup reminder.
ensureFirstRun().catch(() => {});

/**
 * Registers sw.js and wires up the "new version available" flow:
 * new worker installed -> toast with Update button -> SKIP_WAITING -> controllerchange -> reload.
 */
function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) return;

  // If no worker controlled this page at load, this is a first install:
  // the first controllerchange is just the worker claiming us, not an update.
  const hadController = Boolean(navigator.serviceWorker.controller);
  let reloading = false;

  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!hadController || reloading) return;
    reloading = true;
    location.reload();
  });

  window.addEventListener('load', async () => {
    try {
      const registration = await navigator.serviceWorker.register('./sw.js');

      const offerUpdate = (worker) =>
        toast('A new version of Recomp is ready.', {
          actionLabel: 'Update',
          duration: 0,
          onAction: () => worker.postMessage({ type: 'SKIP_WAITING' }),
        });

      if (registration.waiting && hadController) offerUpdate(registration.waiting);

      registration.addEventListener('updatefound', () => {
        const worker = registration.installing;
        worker?.addEventListener('statechange', () => {
          if (worker.state === 'installed' && navigator.serviceWorker.controller) offerUpdate(worker);
        });
      });

      // Installed PWAs can stay open for days; check for updates whenever the app is reopened.
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') registration.update().catch(() => {});
      });
    } catch (error) {
      console.warn('Service worker registration failed:', error);
    }
  });
}
