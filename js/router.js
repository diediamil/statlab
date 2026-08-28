/**
 * STATLAB — router por hash
 * ---------------------------------------------------------------------------
 * Se usa hash (#/student) y no History API porque así la app funciona sin
 * ninguna regla de reescritura en el servidor: GitHub Pages, Netlify, Vercel,
 * Cloudflare Pages y hasta `file://` sirven la SPA tal cual.
 *
 * Rutas con parámetros: '#/world/:id', '#/challenge/:id'.
 * Guardas: cada ruta puede declarar `requires: 'auth' | 'teacher'`.
 */

const routes = [];
let notFoundHandler = null;
let beforeEach = null;
let currentPath = null;
let currentCleanup = null;

/** Registra una ruta. */
export function route(pattern, handler, opts = {}) {
  const keys = [];
  const rx = new RegExp('^' + pattern
    .replace(/\/:([\w]+)/g, (_, k) => { keys.push(k); return '/([^/]+)'; })
    .replace(/\*$/, '.*') + '$');
  routes.push({ pattern, rx, keys, handler, ...opts });
}

export function setNotFound(handler) { notFoundHandler = handler; }
export function setBeforeEach(fn) { beforeEach = fn; }

/** Ruta actual normalizada, sin '#'. */
export function currentRoute() {
  const raw = location.hash.replace(/^#/, '');
  return raw || '/';
}

export function navigate(path, { replace = false } = {}) {
  const target = path.startsWith('#') ? path : '#' + path;
  if (replace) history.replaceState(null, '', target);
  else location.hash = target;
  if (replace) resolve();
}

/** Parsea la query de la parte hash: '#/quick?concept=media' */
function splitPath(full) {
  const qi = full.indexOf('?');
  if (qi === -1) return { path: full, query: new URLSearchParams() };
  return { path: full.slice(0, qi), query: new URLSearchParams(full.slice(qi + 1)) };
}

export async function resolve() {
  const full = currentRoute();
  const { path, query } = splitPath(full);
  if (path === currentPath && !forceNext) { /* misma ruta: se vuelve a pintar igualmente */ }
  forceNext = false;

  // Limpieza de la vista anterior (timers, listeners globales…)
  if (typeof currentCleanup === 'function') {
    try { currentCleanup(); } catch (e) { console.error('cleanup', e); }
    currentCleanup = null;
  }

  for (const r of routes) {
    const m = path.match(r.rx);
    if (!m) continue;
    const params = {};
    r.keys.forEach((k, i) => { params[k] = decodeURIComponent(m[i + 1]); });
    const ctx = { path, params, query, route: r };
    if (beforeEach) {
      const verdict = await beforeEach(ctx);
      if (verdict === false) return;
      if (typeof verdict === 'string') { navigate(verdict, { replace: true }); return; }
    }
    currentPath = path;
    try {
      currentCleanup = await r.handler(ctx);
    } catch (err) {
      console.error('[router] error en la vista', path, err);
      if (notFoundHandler) currentCleanup = await notFoundHandler({ path, error: err });
    }
    return;
  }
  currentPath = path;
  if (notFoundHandler) currentCleanup = await notFoundHandler({ path });
}

let forceNext = false;
/** Fuerza el repintado de la ruta actual (tras cambiar de idioma o de datos). */
export function refresh() { forceNext = true; return resolve(); }

export function startRouter() {
  window.addEventListener('hashchange', resolve);
  return resolve();
}
