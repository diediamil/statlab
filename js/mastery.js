/**
 * STATLAB — Concept Mastery (0–100)
 * ===========================================================================
 * Requisito explícito del diseño: NADA DE ALGORITMOS OPACOS. Esta es la
 * fórmula completa, y la app la muestra al alumno cuando pulsa «¿cómo se
 * calcula?».
 *
 * 1. CALIDAD DE CADA RESPUESTA (q)
 *    Cada intento sobre un concepto recibe una calidad entre 0 y 1:
 *
 *      1,00  correcto a la primera, sin pistas
 *      0,85  correcto a la primera, con pista
 *      0,70  correcto en el segundo intento
 *      0,40  correcto tras tres o más intentos
 *      0,50  parcialmente correcto a la primera (crédito parcial ≥ 0,5)
 *      0,00  incorrecto
 *
 *    En pasos con crédito parcial, q parte del propio crédito (0–1) y se
 *    aplican los mismos descuentos por pistas e intentos.
 *
 * 2. PESO POR DIFICULTAD (w_d)
 *      fácil (1) → 1,0     media (2) → 1,3     difícil (3) → 1,6
 *
 *    Acertar ejercicios difíciles demuestra más dominio que acertar fáciles.
 *
 * 3. PESO POR RECENCIA (w_r)
 *    Las respuestas se ordenan de la más reciente a la más antigua. La
 *    k-ésima más reciente (k = 0 para la última) pesa:
 *
 *      w_r(k) = λ^k,  con λ = 0,85
 *
 *    Así, un concepto que se dominaba hace tres meses y ahora se falla baja;
 *    y un concepto que se falló al principio y ahora se acierta sube. Se
 *    consideran como máximo las 12 respuestas más recientes.
 *
 * 4. VALOR BRUTO
 *      bruto = Σ(w_d · w_r · q) / Σ(w_d · w_r)      ∈ [0, 1]
 *
 * 5. CONTRACCIÓN POR FALTA DE EVIDENCIA
 *    Con dos aciertos sueltos NO se debe mostrar un 100. Se contrae hacia 0:
 *
 *      mastery = 100 · bruto · n / (n + k),   con k = 2 y n = nº de respuestas
 *
 *    n = 1 → factor 0,33 · n = 2 → 0,50 · n = 5 → 0,71 · n = 10 → 0,83
 *    n = 20 → 0,91. El techo real solo se alcanza con evidencia sostenida.
 *
 * 6. NIVELES
 *      0–39  iniciando · 40–59 en desarrollo · 60–79 consolidando · 80–100 dominado
 *
 * DIFICULTAD ADAPTATIVA (sin IA): el mastery del concepto decide qué se
 * ofrece a continuación. Ver `nextDifficulty()` y `adaptivePlan()`.
 */

import { clamp, round } from './utils.js';

export const MASTERY_CONFIG = {
  lambda: 0.85,          // decaimiento por recencia
  window: 12,            // respuestas más recientes consideradas
  shrinkK: 2,            // contracción por poca evidencia
  difficultyWeight: { 1: 1.0, 2: 1.3, 3: 1.6 },
  quality: {
    firstTryClean: 1.0,
    firstTryHint: 0.85,
    secondTry: 0.7,
    laterTry: 0.4,
    wrong: 0,
  },
};

/**
 * Calidad de una respuesta individual.
 * @param {object} r  { correct, partial (0–1), attempts, hintsUsed }
 */
export function responseQuality(r, cfg = MASTERY_CONFIG) {
  const Q = cfg.quality;
  const attempts = Math.max(1, r.attempts || 1);
  const base = r.correct ? 1 : clamp(r.partial ?? 0, 0, 1);
  if (base <= 0) return 0;

  let q;
  if (attempts === 1) q = r.hintsUsed > 0 ? Q.firstTryHint : Q.firstTryClean;
  else if (attempts === 2) q = Q.secondTry;
  else q = Q.laterTry;

  // Con crédito parcial, q no puede superar el propio crédito.
  return round(Math.min(q, base <= 0.999 ? base * q : q), 4);
}

/**
 * Mastery de un concepto a partir de su historial.
 * @param {Array} responses  ordenadas de más antigua a más reciente:
 *                           { correct, partial, attempts, hintsUsed, difficulty }
 */
export function conceptMastery(responses, cfg = MASTERY_CONFIG) {
  const list = (responses || []).slice(-cfg.window).reverse();     // más reciente primero
  if (!list.length) {
    return { value: 0, n: 0, raw: 0, shrink: 0, level: masteryLevel(0), evidence: 0 };
  }
  let num = 0, den = 0;
  list.forEach((r, k) => {
    const wd = cfg.difficultyWeight[r.difficulty ?? 1] ?? 1;
    const wr = cfg.lambda ** k;
    const q = responseQuality(r, cfg);
    num += wd * wr * q;
    den += wd * wr;
  });
  const raw = den ? num / den : 0;
  const n = (responses || []).length;
  const shrink = n / (n + cfg.shrinkK);
  const value = round(100 * raw * shrink, 1);
  return {
    value: clamp(value, 0, 100),
    raw: round(raw, 4),
    shrink: round(shrink, 3),
    n,
    evidence: list.length,
    level: masteryLevel(value),
  };
}

export function masteryLevel(v) {
  if (v >= 80) return { key: 'mastered', label: 'dominado', color: 'var(--ok)' };
  if (v >= 60) return { key: 'consolidating', label: 'consolidando', color: 'var(--brand-2)' };
  if (v >= 40) return { key: 'developing', label: 'en desarrollo', color: 'var(--warn)' };
  return { key: 'starting', label: 'iniciando', color: 'var(--bad)' };
}

/** Mastery de todos los conceptos a partir de un historial de intentos. */
export function computeAllMastery(attempts, cfg = MASTERY_CONFIG) {
  const byConcept = new Map();
  const sorted = attempts.slice().sort((a, b) => new Date(a.created_at || 0) - new Date(b.created_at || 0));
  for (const a of sorted) {
    const concepts = a.concepts || (a.concept ? [a.concept] : []);
    for (const c of concepts) {
      if (!byConcept.has(c)) byConcept.set(c, []);
      byConcept.get(c).push({
        correct: !!a.correct,
        partial: a.score ?? (a.correct ? 1 : 0),
        attempts: a.attempt_number || a.attempts || 1,
        hintsUsed: a.hints_used || 0,
        difficulty: a.difficulty || 1,
      });
    }
  }
  const out = new Map();
  for (const [c, rs] of byConcept) out.set(c, conceptMastery(rs, cfg));
  return out;
}

/** Media de mastery ponderada por evidencia (para el panel del alumno). */
export function averageMastery(masteryMap) {
  const vals = Array.from(masteryMap.values()).filter((m) => m.n > 0);
  if (!vals.length) return 0;
  return round(vals.reduce((s, m) => s + m.value, 0) / vals.length, 1);
}

/* ================================================= dificultad adaptativa == */

/**
 * Dificultad recomendada para el siguiente ejercicio de un concepto.
 * Reglas simples, deterministas y auditables (nada de IA):
 *   mastery < 40  → dificultad 1 (fácil, muy guiado)
 *   40 ≤ m < 70   → dificultad 2 (media)
 *   m ≥ 70        → dificultad 3 (difícil, menos explícito)
 * Si los dos últimos intentos han sido fallos, se baja un escalón.
 */
export function nextDifficulty(mastery, recentResponses = []) {
  const m = mastery?.value ?? 0;
  let d = m >= 70 ? 3 : m >= 40 ? 2 : 1;
  const last2 = recentResponses.slice(-2);
  if (last2.length === 2 && last2.every((r) => !r.correct)) d = Math.max(1, d - 1);
  const lastRecent = recentResponses.slice(-3);
  if (lastRecent.length === 3 && lastRecent.every((r) => r.correct && (r.attempts || 1) === 1)) {
    d = Math.min(3, d + 1);
  }
  return d;
}

/**
 * Plan adaptativo tras una respuesta. Determina qué hacer a continuación.
 * Sin castigos: nunca se resta XP ya ganada.
 */
export function adaptivePlan({ correct, attempts = 1, hintsUsed = 0, mastery }) {
  if (!correct && attempts >= 2) {
    return {
      action: 'guided',
      showFullExplanation: true,
      offerHints: true,
      nextDifficulty: 1,
      message: 'Vamos a verlo con más detalle y después practicas uno parecido.',
    };
  }
  if (!correct) {
    return {
      action: 'retry',
      showFullExplanation: false,
      offerHints: true,
      nextDifficulty: Math.max(1, nextDifficulty(mastery) - 1),
      message: 'Vuelve a intentarlo. Puedes pedir una pista.',
    };
  }
  if (correct && attempts === 1 && hintsUsed === 0 && (mastery?.value ?? 0) >= 70) {
    return {
      action: 'level-up',
      showFullExplanation: false,
      offerHints: false,
      nextDifficulty: 3,
      message: 'Dominado. Vamos con un caso menos explícito.',
    };
  }
  return {
    action: 'continue',
    showFullExplanation: false,
    offerHints: true,
    nextDifficulty: nextDifficulty(mastery),
    message: null,
  };
}

/* ============================================== conceptos para repasar === */

/**
 * Conceptos que necesitan repaso, ordenados por prioridad.
 * Prioridad = (100 − mastery) · log(1 + errores recientes), lo que combina
 * «lo tienes poco dominado» con «has fallado varias veces hace poco».
 */
export function conceptsToReview(masteryMap, attempts, { limit = 8, recentDays = 21 } = {}) {
  const since = Date.now() - recentDays * 86400000;
  const errors = new Map();
  const lastFail = new Map();
  for (const a of attempts) {
    if (a.correct) continue;
    const t = new Date(a.created_at || 0).getTime();
    if (t < since) continue;
    for (const c of a.concepts || (a.concept ? [a.concept] : [])) {
      errors.set(c, (errors.get(c) || 0) + 1);
      if (!lastFail.has(c) || t > lastFail.get(c)) lastFail.set(c, t);
    }
  }
  const rows = [];
  for (const [c, n] of errors) {
    const m = masteryMap.get(c) || { value: 0 };
    rows.push({
      concept: c,
      mastery: m.value,
      errors: n,
      lastFailAt: new Date(lastFail.get(c)).toISOString(),
      priority: round((100 - m.value) * Math.log(1 + n), 2),
    });
  }
  // Conceptos con mastery bajo pero sin errores recientes también merecen repaso
  for (const [c, m] of masteryMap) {
    if (errors.has(c)) continue;
    if (m.n > 0 && m.value < 45) {
      rows.push({ concept: c, mastery: m.value, errors: 0, lastFailAt: null, priority: round((100 - m.value) * 0.4, 2) });
    }
  }
  return rows.sort((a, b) => b.priority - a.priority).slice(0, limit);
}

/** Documentación legible de la fórmula (se muestra en la interfaz). */
export const MASTERY_DOC = {
  steps: [
    { title: 'Calidad de cada respuesta (q)', text: '1,00 acierto a la primera sin pistas · 0,85 con pista · 0,70 en el segundo intento · 0,40 tras varios intentos · 0 fallo. Con crédito parcial, q parte del propio crédito.' },
    { title: 'Peso por dificultad', text: 'Fácil 1,0 · Media 1,3 · Difícil 1,6. Acertar difícil demuestra más dominio.' },
    { title: 'Peso por recencia', text: 'La respuesta más reciente pesa 1; la anterior 0,85; la siguiente 0,85² … Se usan las 12 más recientes.' },
    { title: 'Valor bruto', text: 'Media ponderada de las calidades: Σ(w_dificultad · w_recencia · q) / Σ(w_dificultad · w_recencia).' },
    { title: 'Contracción por poca evidencia', text: 'mastery = 100 · bruto · n/(n+2). Con una sola respuesta el factor es 0,33: dos aciertos sueltos no producen un 100.' },
    { title: 'Niveles', text: '0–39 iniciando · 40–59 en desarrollo · 60–79 consolidando · 80–100 dominado.' },
  ],
  formula: 'mastery = 100 · [Σ(w_d · λ^k · q) / Σ(w_d · λ^k)] · n/(n+2),  λ = 0,85',
};
