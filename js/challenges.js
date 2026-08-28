/**
 * STATLAB — utilidades del Reto de la semana
 * ---------------------------------------------------------------------------
 * Contiene tres piezas independientes del interfaz:
 *
 *  1. `splitChallenge()`: separa una plantilla de reto en dos mitades:
 *       · `configuration` → lo que el alumno PUEDE ver (enunciados, opciones,
 *          pistas, datos del caso);
 *       · `solution`      → respuestas, explicaciones y marcas de corrección.
 *     La mitad `solution` no se envía nunca al navegador mientras el reto está
 *     abierto: en Supabase vive en una columna revocada y la corrección se hace
 *     en el servidor.
 *
 *  2. `ActiveTimer`: cronómetro de TIEMPO ACTIVO. No cuenta el tiempo con la
 *     pestaña abierta: se detiene si no hay interacción durante `idleAfter`
 *     segundos, y también al cambiar de pestaña. Es la implementación sencilla
 *     y honesta que pide el diseño.
 *
 *  3. Estado y ventanas temporales del reto (abierto, cerrado, próximo).
 */

import { deepClone } from './utils.js';

/* ============================================== separación de soluciones == */

/** Claves que revelan la respuesta y por tanto NO viajan al cliente. */
const SECRET_STEP_KEYS = ['answer', 'acceptable', 'acceptableNote', 'explanation', 'tolerance'];
const SECRET_OPTION_KEYS = ['correct', 'why'];

/**
 * Separa una plantilla de reto en la parte pública y la privada.
 * @param {object} template  objeto de data/challenges/*.json
 */
export function splitChallenge(template) {
  const solution = {
    steps: (template.steps || []).map((s) => deepClone(s)),
    wrapUp: template.wrapUp || null,
  };

  const configuration = {
    id: template.id,
    code: template.code,
    type: template.type,
    title: template.title,
    description: template.description,
    briefing: template.briefing || null,
    context: template.context || null,
    dataset: template.dataset || null,
    world: template.world,
    concepts: template.concepts || [],
    difficulty: template.difficulty ?? 2,
    steps: (template.steps || []).map((s) => sanitizeStep(s)),
  };

  return { configuration, solution };
}

/** Elimina de un paso todo lo que revele la respuesta correcta. */
export function sanitizeStep(step) {
  const out = {};
  for (const [k, v] of Object.entries(step)) {
    if (SECRET_STEP_KEYS.includes(k)) continue;
    if (k === 'options') { out.options = (v || []).map(stripOption); continue; }
    if (k === 'items') { out.items = (v || []).map(({ bin, pos, ...rest }) => rest); continue; }
    if (k === 'claims') { out.claims = (v || []).map(({ correct, why, ...rest }) => rest); continue; }
    if (k === 'justify') {
      out.justify = { ...v, options: (v.options || []).map(stripOption) };
      continue;
    }
    if (k === 'misconceptionFeedback') continue;
    out[k] = deepClone(v);
  }
  // Los pasos de tabla 2×2 necesitan saber qué métricas se piden, no las respuestas.
  if (step.type === 'table2x2') out.ask = step.ask || [];
  return out;
}

function stripOption(o) {
  const copy = { ...o };
  for (const k of SECRET_OPTION_KEYS) delete copy[k];
  return copy;
}

/**
 * Vuelve a unir un paso público con su solución (para la revisión posterior,
 * cuando la solución ya está disponible).
 */
export function mergeStep(publicStep, solutionStep) {
  if (!solutionStep) return publicStep;
  const merged = { ...publicStep, ...solutionStep };
  if (publicStep.options && solutionStep.options) {
    merged.options = publicStep.options.map((o) => ({
      ...o, ...(solutionStep.options.find((s) => s.id === o.id) || {}),
    }));
  }
  if (publicStep.items && solutionStep.items) {
    merged.items = publicStep.items.map((it) => ({
      ...it, ...(solutionStep.items.find((s) => s.id === it.id) || {}),
    }));
  }
  if (publicStep.claims && solutionStep.claims) {
    merged.claims = publicStep.claims.map((c) => ({
      ...c, ...(solutionStep.claims.find((s) => s.id === c.id) || {}),
    }));
  }
  if (publicStep.justify && solutionStep.justify) {
    merged.justify = {
      ...publicStep.justify,
      options: (publicStep.justify.options || []).map((o) => ({
        ...o, ...((solutionStep.justify.options || []).find((s) => s.id === o.id) || {}),
      })),
    };
  }
  return merged;
}

/* ==================================================== tiempo activo ====== */

/**
 * Cronómetro de tiempo activo.
 *
 * Por qué no basta con `Date.now() - inicio`: un alumno puede abrir el reto,
 * irse a comer y volver. Contar eso como tiempo de resolución sería injusto
 * para quien lo hace de una sentada, y además contaminaría la métrica docente.
 *
 * Implementación (deliberadamente simple y auditable):
 *   · cada interacción (teclado, puntero, scroll) marca «actividad»;
 *   · un tick de 1 s suma tiempo SOLO si hubo actividad en los últimos
 *     `idleAfter` segundos y la pestaña está visible;
 *   · al recuperar la actividad, el cronómetro se reanuda sin penalización.
 */
export class ActiveTimer {
  constructor({ idleAfter = 90, onTick = null, target = document } = {}) {
    this.idleAfter = idleAfter;
    this.onTick = onTick;
    this.target = target;
    this.activeSeconds = 0;
    this.wallSeconds = 0;
    this.lastActivity = Date.now();
    this.paused = false;
    this.running = false;
    this._interval = null;
    this._bump = () => { this.lastActivity = Date.now(); };
    this._events = ['pointerdown', 'pointermove', 'keydown', 'wheel', 'touchstart', 'input', 'change'];
  }

  start() {
    if (this.running) return this;
    this.running = true;
    this.lastActivity = Date.now();
    this._events.forEach((e) => this.target.addEventListener(e, this._bump, { passive: true }));
    document.addEventListener('visibilitychange', this._bump);
    this._interval = setInterval(() => this._tick(), 1000);
    return this;
  }

  _tick() {
    this.wallSeconds++;
    const idle = (Date.now() - this.lastActivity) / 1000;
    const visible = document.visibilityState === 'visible';
    const wasPaused = this.paused;
    this.paused = idle > this.idleAfter || !visible;
    if (!this.paused) this.activeSeconds++;
    if (this.onTick) this.onTick(this.activeSeconds, this.paused, wasPaused !== this.paused);
  }

  stop() {
    this.running = false;
    clearInterval(this._interval);
    this._events.forEach((e) => this.target.removeEventListener(e, this._bump));
    document.removeEventListener('visibilitychange', this._bump);
    return this.activeSeconds;
  }

  /** Porcentaje de tiempo real que se ha contado como activo (diagnóstico). */
  get efficiency() { return this.wallSeconds ? this.activeSeconds / this.wallSeconds : 1; }
}

/* ================================================= ventanas temporales === */

export const CHALLENGE_STATES = {
  UPCOMING: 'upcoming',
  OPEN: 'open',
  CLOSED: 'closed',
};

/** Estado temporal de un reto. */
export function challengeState(ch, now = Date.now()) {
  const opens = new Date(ch.opens_at || ch.opensAt).getTime();
  const closes = new Date(ch.closes_at || ch.closesAt).getTime();
  if (now < opens) return CHALLENGE_STATES.UPCOMING;
  if (now > closes) return CHALLENGE_STATES.CLOSED;
  return CHALLENGE_STATES.OPEN;
}

/** ¿Está disponible la solución? (misma lógica que statlab_solution_available) */
export function solutionAvailable(ch, now = Date.now()) {
  const policy = ch.solution_policy || ch.solutionPolicy || 'on_close';
  if (policy === 'immediate') return true;
  if (policy === 'on_close') return now > new Date(ch.closes_at || ch.closesAt).getTime();
  if (policy === 'manual') {
    const at = ch.solution_available_at || ch.solutionAvailableAt;
    return Boolean(at) && now >= new Date(at).getTime();
  }
  return false;
}

/**
 * ¿Cuenta este intento para el ranking? Misma política que el servidor.
 * (En Supabase la decide el servidor; aquí se usa en modo demo y para avisar
 * al alumno ANTES de empezar.)
 */
export function isRankEligible({ policy = 'first', previousAttempts = 0, practice = false }) {
  if (practice) return false;
  switch (policy) {
    case 'first':
    case 'single': return previousAttempts === 0;
    case 'best':
    case 'all': return true;
    default: return previousAttempts === 0;
  }
}

export const POLICY_LABELS = {
  first: 'primer intento',
  best: 'mejor intento',
  single: 'único intento',
  all: 'todos los intentos',
};

/** Total de pistas disponibles en un reto (para el componente de puntuación). */
export function totalHints(steps) {
  return (steps || []).reduce((s, x) => s + (x.hints?.length || 0), 0);
}

/** Plantillas de reto que puede elegir el profesor al crear uno. */
export const CHALLENGE_TEMPLATES = [
  { id: 'clinical_case', label: 'Caso clínico', desc: 'Resolver un estudio sanitario completo, de las variables a la conclusión.' },
  { id: 'detective', label: 'Detective estadístico', desc: 'Encontrar los errores de un análisis o de una base de datos.' },
  { id: 'mystery_chart', label: 'Gráfico misterioso', desc: 'Detectar manipulaciones y errores gráficos.' },
  { id: 'bayes', label: 'Bayes Challenge', desc: 'Problema de probabilidad condicionada y valores predictivos.' },
  { id: 'diagnostic', label: 'Diagnostic Challenge', desc: 'Interpretación de pruebas diagnósticas y curvas ROC.' },
  { id: 'data', label: 'Data Challenge', desc: 'Interpretar un conjunto de datos y describirlo correctamente.' },
  { id: 'research', label: 'Research Challenge', desc: 'Decisiones de diseño y plan de análisis.' },
  { id: 'regression', label: 'Regression Challenge', desc: 'Construir o interpretar una regresión.' },
  { id: 'reviewer2', label: 'Reviewer 2', desc: 'Revisar fragmentos de un artículo y encontrar los errores estadísticos.' },
];
