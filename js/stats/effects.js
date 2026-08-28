/**
 * STATLAB — tamaños del efecto
 * ---------------------------------------------------------------------------
 * Principio pedagógico: la significación responde "¿es distinguible del azar?".
 * El tamaño del efecto responde "¿cuánto?" — y esa es la pregunta clínica.
 *
 * Los umbrales de Cohen se ofrecen SOLO como orientación. Cohen mismo advirtió
 * que son arbitrarios y que la referencia debe ser el campo de aplicación:
 * en cribado poblacional un d = 0,2 puede ser enorme, y en un ensayo de dolor
 * un d = 0,5 puede ser irrelevante si no supera la diferencia mínima
 * clínicamente importante (MCID).
 */

import { mean, sd, variance } from './descriptive.js';

/* --------------------------------------------------------- diferencias -- */

/**
 * d de Cohen para dos grupos independientes, con desviación típica agrupada
 * (pooled). Signo: positivo si el primer grupo tiene media mayor.
 */
export function cohenD(xs, ys) {
  const a = xs.filter(Number.isFinite), b = ys.filter(Number.isFinite);
  const n1 = a.length, n2 = b.length;
  const sp = Math.sqrt((((n1 - 1) * variance(a)) + ((n2 - 1) * variance(b))) / (n1 + n2 - 2));
  return sp ? (mean(a) - mean(b)) / sp : NaN;
}

/** g de Hedges: d corregida para muestras pequeñas (n < 20 por grupo). */
export function hedgesG(xs, ys) {
  const n1 = xs.filter(Number.isFinite).length, n2 = ys.filter(Number.isFinite).length;
  const J = 1 - 3 / (4 * (n1 + n2) - 9);
  return cohenD(xs, ys) * J;
}

/** d de Cohen para una muestra frente a un valor de referencia. */
export function cohenDOneSample(xs, mu0) {
  const s = sd(xs);
  return s ? (mean(xs) - mu0) / s : NaN;
}

/** d de Cohen para datos pareados: media de las diferencias / SD de las diferencias. */
export function cohenDPaired(pre, post) {
  const d = pre.map((x, i) => post[i] - x).filter(Number.isFinite);
  const s = sd(d);
  return s ? mean(d) / s : NaN;
}

/** Δ de Glass: usa la SD del grupo control (útil si el tratamiento altera la varianza). */
export function glassDelta(treatment, control) {
  const s = sd(control);
  return s ? (mean(treatment) - mean(control)) / s : NaN;
}

/* ------------------------------------------------------ proporción var -- */

/** η² = SS_entre / SS_total (ANOVA). Sesgado al alza con k grande y n pequeño. */
export const etaSquared = (ssBetween, ssTotal) => (ssTotal ? ssBetween / ssTotal : NaN);

/** η² parcial (útil en diseños factoriales). */
export const partialEtaSquared = (ssEffect, ssError) => (ssEffect + ssError ? ssEffect / (ssEffect + ssError) : NaN);

/** ω² (omega cuadrado): menos sesgado que η². */
export const omegaSquared = (ssBetween, dfBetween, msWithin, ssTotal) =>
  (ssBetween - dfBetween * msWithin) / (ssTotal + msWithin);

/** ε² para Kruskal–Wallis: ε² = H / (n − 1). */
export const epsilonSquared = (H, n) => (n > 1 ? H / (n - 1) : NaN);

/** η² a partir de H (equivalente basado en rangos). */
export const etaSquaredH = (H, k, n) => (n - k ? (H - k + 1) / (n - k) : NaN);

/** R² a partir de r. */
export const rSquaredFromR = (r) => r * r;

/* ---------------------------------------------------------- asociación -- */

/** V de Cramér a partir de chi². Para 2×2 coincide con φ. */
export function cramersV(chi2, n, rows, cols) {
  const k = Math.min(rows, cols) - 1;
  return k > 0 && n > 0 ? Math.sqrt(chi2 / (n * k)) : NaN;
}

/** φ (phi) para tablas 2×2. */
export const phiCoefficient = (chi2, n) => Math.sqrt(chi2 / n);

/** W de Kendall: concordancia entre m evaluadores sobre n objetos.
 *  `rankMatrix` = m filas (evaluadores) × n columnas (objetos) de rangos. */
export function kendallW(rankMatrix) {
  const m = rankMatrix.length;
  const nObj = rankMatrix[0].length;
  const colSums = Array.from({ length: nObj }, (_, j) => rankMatrix.reduce((s, r) => s + r[j], 0));
  const meanR = colSums.reduce((s, x) => s + x, 0) / nObj;
  const S = colSums.reduce((s, x) => s + (x - meanR) ** 2, 0);
  return (12 * S) / (m * m * (nObj ** 3 - nObj));
}

/** r a partir de z (pruebas no paramétricas): r = |z| / √N. */
export const rFromZ = (z, n) => Math.abs(z) / Math.sqrt(n);

/** Odds ratio y riesgo relativo de una tabla 2×2 [[a,b],[c,d]]. */
export function riskMeasures(table) {
  const [[a, b], [c, d]] = table;
  const r1 = a + b, r2 = c + d;
  const risk1 = a / r1, risk2 = c / r2;
  return {
    risk1, risk2,
    riskDifference: risk1 - risk2,
    riskRatio: risk2 ? risk1 / risk2 : NaN,
    oddsRatio: (b && c) ? (a * d) / (b * c) : NaN,
    nnt: risk1 !== risk2 ? 1 / Math.abs(risk1 - risk2) : Infinity,
  };
}

/* --------------------------------------------------- interpretación ----- */

const SCALES = {
  d:        [[0.2, 'trivial'], [0.5, 'pequeño'], [0.8, 'mediano'], [Infinity, 'grande']],
  r:        [[0.1, 'trivial'], [0.3, 'pequeño'], [0.5, 'mediano'], [Infinity, 'grande']],
  eta2:     [[0.01, 'trivial'], [0.06, 'pequeño'], [0.14, 'mediano'], [Infinity, 'grande']],
  eps2:     [[0.01, 'trivial'], [0.06, 'pequeño'], [0.14, 'mediano'], [Infinity, 'grande']],
  r2:       [[0.02, 'trivial'], [0.13, 'pequeño'], [0.26, 'mediano'], [Infinity, 'grande']],
  cramersV: [[0.1, 'trivial'], [0.3, 'pequeño'], [0.5, 'mediano'], [Infinity, 'grande']],
  w:        [[0.1, 'trivial'], [0.3, 'pequeño'], [0.5, 'mediano'], [Infinity, 'grande']],
  h:        [[0.2, 'trivial'], [0.5, 'pequeño'], [0.8, 'mediano'], [Infinity, 'grande']],
  kendallW: [[0.1, 'muy baja'], [0.3, 'baja'], [0.5, 'moderada'], [Infinity, 'alta']],
};

/**
 * Etiqueta orientativa de la magnitud. Devuelve también el aviso obligatorio
 * para que la app nunca presente el umbral como una verdad absoluta.
 */
export function magnitude(value, kind = 'd') {
  const scale = SCALES[kind] || SCALES.d;
  const v = Math.abs(value);
  let label = 'grande';
  for (const [thr, name] of scale) {
    if (v < thr) { label = name; break; }
  }
  return {
    value, kind, label,
    caveat: 'Los umbrales de Cohen son convenciones orientativas. La relevancia depende del contexto '
      + 'clínico y de la diferencia mínima clínicamente importante, no de la etiqueta.',
  };
}

/** Umbrales disponibles (para mostrarlos en la interfaz). */
export const effectScales = SCALES;

/* ---------------------------------------------------------- potencia ---- */

/**
 * Potencia aproximada de una t independiente bilateral (aproximación normal).
 * Suficiente para el mundo de contrastes: enseña la relación entre n, d, α y
 * potencia sin necesidad de la t no central.
 */
export function powerTwoSampleT(d, nPerGroup, alpha = 0.05) {
  const z = 1.959963984540054;                 // z_{1−α/2} para α = 0,05
  const zAlpha = alpha === 0.05 ? z : zFor(1 - alpha / 2);
  const ncp = Math.abs(d) * Math.sqrt(nPerGroup / 2);
  return 1 - phi(zAlpha - ncp) + phi(-zAlpha - ncp);
}

/** n por grupo necesario para una potencia dada en una t independiente. */
export function nForPowerTwoSampleT(d, power = 0.8, alpha = 0.05) {
  const zA = zFor(1 - alpha / 2);
  const zB = zFor(power);
  return Math.ceil((2 * (zA + zB) ** 2) / (d * d));
}

/* Normal estándar mínima local, para no crear dependencia circular. */
function phi(x) {
  // Aproximación de Zelen & Severo (|error| < 7,5e-8)
  const t = 1 / (1 + 0.2316419 * Math.abs(x));
  const poly = t * (0.319381530 + t * (-0.356563782 + t * (1.781477937 + t * (-1.821255978 + t * 1.330274429))));
  const p = 1 - (Math.exp(-x * x / 2) / Math.sqrt(2 * Math.PI)) * poly;
  return x >= 0 ? p : 1 - p;
}
function zFor(p) {
  let lo = -8, hi = 8;
  for (let i = 0; i < 100; i++) {
    const mid = (lo + hi) / 2;
    if (phi(mid) < p) lo = mid; else hi = mid;
  }
  return (lo + hi) / 2;
}
