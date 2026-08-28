/**
 * STATLAB — resolución de la configuración de ejecución
 * ---------------------------------------------------------------------------
 * Orden de prioridad:
 *   1. `?demo=1` en la URL fuerza el modo demo.
 *   2. `window.STATLAB_CONFIG` (definido por `config.js` en la raíz).
 *   3. Sin configuración válida → modo demo automático.
 *
 * `config.js` se carga con un <script> dinámico (no como módulo) para que su
 * ausencia sea un caso normal y no un error de importación.
 */

const DEFAULTS = {
  SUPABASE_URL: null,
  SUPABASE_ANON_KEY: null,
  DEFAULT_LOCALE: 'es-ES',
  ALLOW_DEMO: true,
  ALLOWED_EMAIL_DOMAIN: null,
  REDIRECT_URL: null,
};

let resolved = null;

function looksConfigured(c) {
  return Boolean(
    c.SUPABASE_URL && c.SUPABASE_ANON_KEY
    && !/TU-PROYECTO|YOUR-PROJECT/i.test(c.SUPABASE_URL)
    && !/TU_ANON_KEY|YOUR_ANON_KEY/i.test(c.SUPABASE_ANON_KEY),
  );
}

function loadRootConfig() {
  return new Promise((resolve) => {
    if (window.STATLAB_CONFIG) return resolve();
    const s = document.createElement('script');
    // Ruta relativa al documento: funciona en subcarpetas de GitHub Pages.
    s.src = new URL('config.js', document.baseURI).href;
    s.onload = () => resolve();
    s.onerror = () => resolve();          // ausencia esperada → modo demo
    document.head.appendChild(s);
  });
}

/** Devuelve (y memoriza) la configuración efectiva. */
export async function getConfig() {
  if (resolved) return resolved;
  await loadRootConfig();
  const raw = { ...DEFAULTS, ...(window.STATLAB_CONFIG || {}) };
  const params = new URLSearchParams(location.search);
  const demoParam = params.get('demo');
  const forcedDemo = demoParam === '1' || demoParam === 'true';
  const configured = looksConfigured(raw);

  resolved = {
    ...raw,
    configured,
    demo: forcedDemo || !configured,
    demoForced: forcedDemo,
    /** Modo demo por falta de backend (se avisa distinto al usuario). */
    demoBecauseUnconfigured: !configured,
  };
  return resolved;
}

/** Configuración ya resuelta (llamar solo después de getConfig()). */
export const config = () => resolved || { ...DEFAULTS, demo: true, configured: false };

/** Construye una URL de la app preservando el modo demo. */
export function appUrl(hash) {
  const c = config();
  const base = location.pathname;
  const q = c.demoForced ? '?demo=1' : '';
  return `${base}${q}${hash.startsWith('#') ? hash : '#' + hash}`;
}
