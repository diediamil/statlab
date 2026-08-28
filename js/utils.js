/**
 * STATLAB — utilidades generales (puras, sin dependencias del DOM salvo aviso)
 */

/* ------------------------------------------------------------- números --- */

export const clamp = (x, lo, hi) => Math.min(hi, Math.max(lo, x));

/** Redondeo a `d` decimales devolviendo número (evita el sesgo de toFixed). */
export function round(x, d = 2) {
  if (!Number.isFinite(x)) return NaN;
  const f = 10 ** d;
  return Math.round((x + Number.EPSILON) * f) / f;
}

/** Formato numérico español: coma decimal, punto de millares. */
export function fmt(x, d = 2) {
  if (x === null || x === undefined || Number.isNaN(x)) return '—';
  if (!Number.isFinite(x)) return x > 0 ? '+∞' : '−∞';
  return new Intl.NumberFormat('es-ES', {
    minimumFractionDigits: d, maximumFractionDigits: d,
  }).format(x);
}

export const fmtInt = (x) => (Number.isFinite(x) ? new Intl.NumberFormat('es-ES').format(Math.round(x)) : '—');

export function fmtPct(p, d = 0) {
  if (!Number.isFinite(p)) return '—';
  return `${fmt(p * 100, d)} %`;
}

/** p-valores: por debajo de 0,001 se informa como "< 0,001" (nunca "0"). */
export function fmtP(p) {
  if (!Number.isFinite(p)) return '—';
  if (p < 0.001) return '< 0,001';
  return fmt(p, 3);
}

/* --------------------------------------------------------------- tiempo -- */

/** Segundos → "m:ss" o "h:mm:ss". */
export function fmtDuration(seconds) {
  const s = Math.max(0, Math.round(seconds || 0));
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
  const pad = (n) => String(n).padStart(2, '0');
  return h > 0 ? `${h}:${pad(m)}:${pad(sec)}` : `${m}:${pad(sec)}`;
}

/** Segundos → "8 min 12 s" (para lectura humana). */
export function fmtDurationLong(seconds) {
  const s = Math.max(0, Math.round(seconds || 0));
  const m = Math.floor(s / 60);
  return m > 0 ? `${m} min ${s % 60} s` : `${s} s`;
}

const DT_FMT = new Intl.DateTimeFormat('es-ES', {
  weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit',
});
const D_FMT = new Intl.DateTimeFormat('es-ES', { day: 'numeric', month: 'short', year: 'numeric' });

export function fmtDateTime(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  return Number.isNaN(+d) ? '—' : DT_FMT.format(d);
}
export function fmtDate(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  return Number.isNaN(+d) ? '—' : D_FMT.format(d);
}

/** "hace 3 días" / "en 2 horas". */
export function fmtRelative(iso, now = Date.now()) {
  if (!iso) return '—';
  const diff = new Date(iso).getTime() - now;
  const rtf = new Intl.RelativeTimeFormat('es-ES', { numeric: 'auto' });
  const abs = Math.abs(diff);
  const units = [
    ['day', 86400000], ['hour', 3600000], ['minute', 60000], ['second', 1000],
  ];
  for (const [unit, ms] of units) {
    if (abs >= ms || unit === 'second') return rtf.format(Math.round(diff / ms), unit);
  }
  return '';
}

export const nowIso = () => new Date().toISOString();

export function daysBetween(aIso, bIso) {
  const a = new Date(aIso), b = new Date(bIso);
  return Math.floor((startOfDay(b) - startOfDay(a)) / 86400000);
}
export function startOfDay(d) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x.getTime();
}
export const todayKey = (d = new Date()) => {
  const x = new Date(d);
  return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`;
};

/* --------------------------------------------------------------- arrays -- */

export const sum = (a) => a.reduce((s, x) => s + x, 0);
export const mean = (a) => (a.length ? sum(a) / a.length : NaN);
export const unique = (a) => Array.from(new Set(a));
export const range = (n, from = 0) => Array.from({ length: n }, (_, i) => i + from);
export const last = (a) => a[a.length - 1];

export function groupBy(arr, keyFn) {
  const m = new Map();
  for (const x of arr) {
    const k = keyFn(x);
    if (!m.has(k)) m.set(k, []);
    m.get(k).push(x);
  }
  return m;
}

export function sortBy(arr, ...keyFns) {
  return arr.slice().sort((a, b) => {
    for (const f of keyFns) {
      const desc = typeof f === 'object';
      const fn = desc ? f.key : f;
      const av = fn(a), bv = fn(b);
      if (av < bv) return desc ? 1 : -1;
      if (av > bv) return desc ? -1 : 1;
    }
    return 0;
  });
}
export const desc = (key) => ({ key });

/** Baraja una copia usando un RNG inyectable (por defecto Math.random). */
export function shuffle(arr, rnd = Math.random) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/* --------------------------------------------------------------- cadenas -- */

export const slug = (s) => String(s).toLowerCase().normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');

export function initials(first = '', lastName = '') {
  return ((first[0] || '') + (lastName[0] || '')).toUpperCase() || '?';
}

export function truncate(s, n = 80) {
  const t = String(s ?? '');
  return t.length > n ? t.slice(0, n - 1) + '…' : t;
}

/** Comparación laxa de texto libre: sin acentos, sin mayúsculas, sin espacios extra. */
export function normText(s) {
  return String(s ?? '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ').trim();
}

/** Acepta coma o punto como separador decimal. */
export function parseNum(s) {
  if (typeof s === 'number') return s;
  const t = String(s ?? '').trim().replace(/\s/g, '').replace(',', '.');
  if (t === '') return NaN;
  const v = Number(t);
  return Number.isFinite(v) ? v : NaN;
}

/* ------------------------------------------------------------------ ids --- */

export function uuid() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  // Fallback determinista-suficiente para modo demo en navegadores antiguos.
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
}

/** Código de clase legible: sin caracteres ambiguos (0/O, 1/I/L). */
const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
export function classCode(len = 6, rnd = Math.random) {
  let out = '';
  for (let i = 0; i < len; i++) out += CODE_ALPHABET[Math.floor(rnd() * CODE_ALPHABET.length)];
  return out;
}

/* --------------------------------------------------------------- varios -- */

export function debounce(fn, ms = 200) {
  let t;
  return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); };
}

export function throttle(fn, ms = 100) {
  let last = 0, timer = null, pending = null;
  return (...args) => {
    pending = args;
    const now = Date.now();
    if (now - last >= ms) { last = now; fn(...pending); }
    else if (!timer) {
      timer = setTimeout(() => { timer = null; last = Date.now(); fn(...pending); }, ms - (now - last));
    }
  };
}

export const deepClone = (o) => (typeof structuredClone === 'function' ? structuredClone(o) : JSON.parse(JSON.stringify(o)));

/** Validación de correo suficientemente estricta para un formulario. */
export const isEmail = (s) => /^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i.test(String(s || '').trim());

/** Fuerza mínima de contraseña: 8+ caracteres, con letra y número. */
export function passwordIssues(pw) {
  const issues = [];
  const s = String(pw || '');
  if (s.length < 8) issues.push('minLength');
  if (!/[a-zA-Z]/.test(s)) issues.push('needLetter');
  if (!/[0-9]/.test(s)) issues.push('needNumber');
  return issues;
}

/** Alias: 3–16 caracteres, letras/números/_/-, sin espacios. */
export const isValidAlias = (s) => /^[\p{L}\p{N}_-]{3,16}$/u.test(String(s || '').trim());
