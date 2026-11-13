/**
 * Minimal hash router.
 *
 * URLs look like  #/today  or  #/foods/edit/abc123?meal=lunch
 *   name   = first path segment, which picks the screen module
 *   params = remaining path segments
 *   query  = parsed query string
 *
 * Hash routing works on any static host (GitHub Pages included) with no server config.
 *
 * Screen contract — each screen module default-exports:
 *   {
 *     title: string,
 *     tab?: string,                       // which bottom-nav tab to highlight (defaults to name)
 *     render(root, ctx) => void | cleanup // may be async; may return a cleanup function
 *   }
 * The screen renders into `root` (a fresh, detached element), which is swapped into the page
 * only when rendering is complete, so there is no flash of half-built UI.
 */
const routes = {
  today: () => import('./screens/today.js'),
  foods: () => import('./screens/foods.js'),
  meals: () => import('./screens/meals.js'),
  settings: () => import('./screens/settings.js'),
};

const DEFAULT_ROUTE = 'today';

let outlet = null;
let cleanup = null;
let renderToken = 0; // guards against an older, slower render finishing after a newer one

/** Parses a location hash into { name, params, query }. */
export function parseHash(hash) {
  const [path, queryString = ''] = hash.replace(/^#\/?/, '').split('?');
  const [name, ...params] = path.split('/').filter(Boolean).map(decodeURIComponent);
  return {
    name: name || DEFAULT_ROUTE,
    params,
    query: Object.fromEntries(new URLSearchParams(queryString)),
  };
}

/** Navigates to a path such as "foods" or "today?date=2026-11-12". */
export function navigate(path, { replace = false } = {}) {
  const hash = `#/${path.replace(/^#?\/?/, '')}`;
  if (replace) location.replace(hash);
  else location.hash = hash;
}

/** Goes back if there is in-app history, otherwise to a fallback route. */
export function goBack(fallback = DEFAULT_ROUTE) {
  if (history.length > 1) history.back();
  else navigate(fallback, { replace: true });
}

export function startRouter(element) {
  outlet = element;
  window.addEventListener('hashchange', () => showRoute({ scrollToTop: true }));
  showRoute({ scrollToTop: true });
}

/** Re-renders the current screen in place (e.g. after data changes). */
export function refresh() {
  return showRoute({ scrollToTop: false });
}

async function showRoute({ scrollToTop }) {
  const route = parseHash(location.hash);
  const load = routes[route.name];
  if (!load) {
    navigate(DEFAULT_ROUTE, { replace: true });
    return;
  }

  const token = ++renderToken;
  const screen = (await load()).default;
  if (token !== renderToken) return;

  const view = document.createElement('div');
  view.className = 'view';
  const result = await screen.render(view, { ...route, navigate, refresh });

  // A newer navigation started while we were rendering: throw this one away.
  if (token !== renderToken) {
    if (typeof result === 'function') result();
    return;
  }

  cleanup?.();
  cleanup = typeof result === 'function' ? result : null;
  outlet.replaceChildren(view);

  document.title = `${screen.title} · Recomp`;
  highlightTab(screen.tab ?? route.name);
  if (scrollToTop) window.scrollTo(0, 0);
}

function highlightTab(tab) {
  for (const link of document.querySelectorAll('.tabbar a')) {
    if (link.dataset.tab === tab) link.setAttribute('aria-current', 'page');
    else link.removeAttribute('aria-current');
  }
}
