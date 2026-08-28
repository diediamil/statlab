/**
 * STATLAB — internacionalización
 * ---------------------------------------------------------------------------
 * Diseño deliberadamente simple para no cerrar puertas:
 *   · las cadenas viven en `js/locales/<código>.js` como objetos anidados;
 *   · `t('worlds.title')` resuelve la clave; si falta, cae al idioma base y,
 *     en último término, devuelve la propia clave (así los huecos se ven);
 *   · `t('xp.gain', { xp: 40 })` interpola `{xp}`;
 *   · `tp('activity.count', n)` elige singular/plural;
 *   · los atributos `data-i18n` del HTML se traducen al arrancar.
 *
 * Para añadir un idioma: crear el archivo del locale, registrarlo en
 * `LOCALES` y ya está. No hay que tocar ninguna vista.
 */

const LOCALES = {
  'es-ES': () => import('./locales/es-ES.js'),
  en: () => import('./locales/en.js'),
};

export const AVAILABLE_LOCALES = [
  { code: 'es-ES', label: 'Español (España)' },
  { code: 'en', label: 'English' },
];

const BASE = 'es-ES';
const STORAGE_KEY = 'statlab.locale';

let current = BASE;
let dict = {};
let baseDict = {};
const listeners = new Set();

/** Resuelve 'a.b.c' dentro de un objeto anidado. */
function lookup(obj, path) {
  return path.split('.').reduce((acc, k) => (acc && typeof acc === 'object' ? acc[k] : undefined), obj);
}

/** Interpola {clave} usando `vars`. */
function interpolate(str, vars) {
  if (!vars) return str;
  return str.replace(/\{(\w+)\}/g, (m, k) => (k in vars ? String(vars[k]) : m));
}

/** Traduce una clave. */
export function t(key, vars) {
  let v = lookup(dict, key);
  if (v === undefined) v = lookup(baseDict, key);
  if (v === undefined) {
    if (typeof console !== 'undefined' && current === BASE) console.warn('[i18n] clave sin traducir:', key);
    return key;
  }
  return typeof v === 'string' ? interpolate(v, vars) : v;
}

/** Plural: la entrada puede ser `{one, other}` o una cadena única. */
export function tp(key, count, vars = {}) {
  const entry = lookup(dict, key) ?? lookup(baseDict, key);
  if (entry && typeof entry === 'object') {
    const form = count === 1 ? (entry.one ?? entry.other) : (entry.other ?? entry.one);
    return interpolate(form, { count, ...vars });
  }
  return t(key, { count, ...vars });
}

/** Cadena de un objeto multilingüe del contenido: {es: "...", en: "..."} */
export function pick(obj, fallback = '') {
  if (obj === null || obj === undefined) return fallback;
  if (typeof obj === 'string') return obj;
  const short = current.split('-')[0];
  return obj[current] ?? obj[short] ?? obj.es ?? obj.en ?? fallback;
}

export const locale = () => current;

/** Carga un idioma y notifica a las vistas suscritas. */
export async function setLocale(code) {
  const loader = LOCALES[code] || LOCALES[BASE];
  const mod = await loader();
  dict = mod.default || mod.strings || mod;
  current = LOCALES[code] ? code : BASE;
  if (current === BASE) baseDict = dict;
  else if (!Object.keys(baseDict).length) {
    const b = await LOCALES[BASE]();
    baseDict = b.default || b.strings || b;
  }
  try { localStorage.setItem(STORAGE_KEY, current); } catch { /* modo privado */ }
  document.documentElement.lang = current;
  applyStaticTranslations();
  listeners.forEach((fn) => fn(current));
  return current;
}

/** Idioma inicial: preferencia guardada → configuración → navegador → base. */
export function detectLocale(configDefault) {
  let saved = null;
  try { saved = localStorage.getItem(STORAGE_KEY); } catch { /* ignorado */ }
  if (saved && LOCALES[saved]) return saved;
  if (configDefault && LOCALES[configDefault]) return configDefault;
  const nav = (navigator.languages || [navigator.language || 'es'])[0] || 'es';
  if (LOCALES[nav]) return nav;
  const short = nav.split('-')[0];
  const match = Object.keys(LOCALES).find((k) => k.split('-')[0] === short);
  return match || BASE;
}

/** Traduce los nodos con `data-i18n` (y `data-i18n-attr` para atributos). */
export function applyStaticTranslations(root = document) {
  root.querySelectorAll('[data-i18n]').forEach((node) => {
    node.textContent = t(node.dataset.i18n);
  });
  root.querySelectorAll('[data-i18n-attr]').forEach((node) => {
    // formato: data-i18n-attr="aria-label:a11y.close;title:a11y.close"
    node.dataset.i18nAttr.split(';').forEach((pair) => {
      const [attr, key] = pair.split(':');
      if (attr && key) node.setAttribute(attr.trim(), t(key.trim()));
    });
  });
}

export function onLocaleChange(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
