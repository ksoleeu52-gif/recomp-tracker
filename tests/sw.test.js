import { test, assert } from './harness.js';

/**
 * Guards against the classic PWA bug: adding a file but forgetting to list it in
 * sw.js, so the app breaks offline. Uses the directory listings that
 * `py -m http.server` provides; skipped on servers without listings.
 */
test('every JS/CSS/WASM file is precached by the service worker', async () => {
  const swSource = await (await fetch('../sw.js')).text();
  const shell = new Set([...swSource.matchAll(/'([^']+\.(?:js|css|wasm))'/g)].map((m) => m[1]));

  const dirs = ['css/', 'js/', 'js/db/', 'js/lib/', 'js/components/', 'js/screens/', 'vendor/zxing-wasm/', 'vendor/zxing-wasm/reader/'];
  const missing = [];
  for (const dir of dirs) {
    const response = await fetch(`../${dir}`);
    const listing = await response.text();
    if (!listing.includes('Directory listing')) return; // server doesn't list directories: skip
    for (const [, file] of listing.matchAll(/href="([^"/]+\.(?:js|css|wasm))"/g)) {
      if (!shell.has(dir + file)) missing.push(dir + file);
    }
  }
  assert(missing.length === 0, `not in sw.js APP_SHELL: ${missing.join(', ')}`);
});
