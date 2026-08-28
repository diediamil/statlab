/**
 * STATLAB — muestreo, distribución muestral y estimación (Mundos 7 y 8)
 * ---------------------------------------------------------------------------
 * El objetivo didáctico es que el alumno DISTINGA tres cosas que se confunden
 * constantemente:
 *
 *   σ  (o s)  variabilidad de los INDIVIDUOS de la población/muestra
 *   SE        variabilidad de las MEDIAS de muestras del mismo tamaño
 *   IC        rango de valores plausibles para el PARÁMETRO
 *
 * SE = s/√n: al multiplicar n por 4, el SE se divide por 2 (no por 4). Esa
 * raíz cuadrada es la razón de que aumentar la muestra tenga rendimientos
 * decrecientes, y el simulador lo hace visible.
 */

import { mean, sd, variance } from './descriptive.js';
import { normalCdf, tCrit, zCrit } from './distributions.js';
import { RNG } from '../rng.js';

/* ------------------------------------------------------- error estándar -- */

export const seMean = (s, n) => s / Math.sqrt(n);
export const seProportion = (p, n) => Math.sqrt((p * (1 - p)) / n);

/** Corrección para poblaciones finitas (cuando n/N > 0,05). */
export const fpcFactor = (n, N) => Math.sqrt((N - n) / (N - 1));

/* ------------------------------------------------- distribución muestral -- */

/**
 * Simula `reps` muestras de tamaño `n` de una población y devuelve la
 * distribución de las medias. Es el motor del Simulador de muestreo (TCL).
 *
 * @param {number[]} population
 * @param {number} n tamaño de cada muestra
 * @param {number} reps número de muestras
 * @param {RNG} rng generador semillado
 */
export function samplingDistribution(population, n, reps, rng = new RNG(1)) {
  const means = new Array(reps);
  const N = population.length;
  for (let r = 0; r < reps; r++) {
    let s = 0;
    for (let i = 0; i < n; i++) s += population[rng.int(0, N - 1)];   // con reemplazo
    means[r] = s / n;
  }
  return {
    means,
    mean: mean(means),
    sd: sd(means),
    theoreticalSe: seMean(sd(population), n),
    populationMean: mean(population),
    populationSd: sd(population),
    n, reps,
  };
}

/**
 * Poblaciones sintéticas con formas muy distintas. El TCL se aprecia mejor
 * partiendo de una población claramente NO normal.
 */
export function makePopulation(kind, size = 5000, rng = new RNG(7)) {
  const out = new Array(size);
  for (let i = 0; i < size; i++) {
    switch (kind) {
      case 'normal':        out[i] = rng.normal(70, 12); break;
      case 'skewed':        out[i] = 2 + rng.exponential(1 / 6); break;         // asimétrica derecha
      case 'bimodal':       out[i] = rng.bool(0.5) ? rng.normal(58, 6) : rng.normal(86, 7); break;
      case 'uniform':       out[i] = rng.uniform(40, 100); break;
      case 'heavy-tailed':  out[i] = rng.normal(70, 8) + (rng.bool(0.04) ? rng.normal(0, 45) : 0); break;
      case 'counts':        out[i] = rng.poisson(2.4); break;
      default:              out[i] = rng.normal(0, 1);
    }
  }
  return out;
}

export const POPULATION_KINDS = [
  { id: 'normal', label: 'Normal (simétrica)', hint: 'Tiempo de reacción en una tarea estandarizada.' },
  { id: 'skewed', label: 'Asimétrica a la derecha', hint: 'Días de estancia hospitalaria: muchos cortos, unos pocos muy largos.' },
  { id: 'bimodal', label: 'Bimodal', hint: 'Dos subpoblaciones mezcladas (p. ej. tratados y no tratados).' },
  { id: 'uniform', label: 'Uniforme', hint: 'Todos los valores igual de probables.' },
  { id: 'heavy-tailed', label: 'Con valores extremos', hint: 'Colas largas: algún paciente con valores muy raros.' },
  { id: 'counts', label: 'Recuentos (Poisson)', hint: 'Número de caídas por paciente en un mes.' },
];

/* ------------------------------------------------------------ intervalos -- */

/**
 * IC para la media. Usa la t de Student salvo que se indique σ conocida.
 * En docencia sanitaria σ prácticamente nunca se conoce, así que la t es
 * el caso normal y la z es la excepción.
 */
export function ciMean(xs, conf = 0.95, { sigmaKnown = null } = {}) {
  const a = xs.filter(Number.isFinite);
  const n = a.length;
  const m = mean(a);
  if (sigmaKnown !== null) {
    const se = seMean(sigmaKnown, n);
    const z = zCrit(conf);
    return { mean: m, n, se, crit: z, dist: 'z', margin: z * se, lo: m - z * se, hi: m + z * se, conf };
  }
  const s = sd(a);
  const se = seMean(s, n);
  const t = tCrit(conf, n - 1);
  return { mean: m, n, sd: s, se, crit: t, dist: 't', df: n - 1, margin: t * se, lo: m - t * se, hi: m + t * se, conf };
}

/** IC para una proporción (Wilson por defecto: mejor cobertura). */
export function ciProportion(x, n, conf = 0.95, { method = 'wilson' } = {}) {
  const p = x / n;
  const z = zCrit(conf);
  if (method === 'wald') {
    const se = seProportion(p, n);
    return { p, n, se, crit: z, margin: z * se, lo: Math.max(0, p - z * se), hi: Math.min(1, p + z * se), method, conf };
  }
  const denom = 1 + (z * z) / n;
  const centre = p + (z * z) / (2 * n);
  const half = z * Math.sqrt((p * (1 - p)) / n + (z * z) / (4 * n * n));
  return {
    p, n, crit: z, method, conf,
    lo: Math.max(0, (centre - half) / denom),
    hi: Math.min(1, (centre + half) / denom),
    margin: half / denom,
  };
}

/** IC para la diferencia de medias independientes (Welch). */
export function ciDiffMeans(xs, ys, conf = 0.95) {
  const a = xs.filter(Number.isFinite), b = ys.filter(Number.isFinite);
  const n1 = a.length, n2 = b.length;
  const v1 = variance(a), v2 = variance(b);
  const se = Math.sqrt(v1 / n1 + v2 / n2);
  const df = (v1 / n1 + v2 / n2) ** 2 / ((v1 / n1) ** 2 / (n1 - 1) + (v2 / n2) ** 2 / (n2 - 1));
  const t = tCrit(conf, df);
  const diff = mean(a) - mean(b);
  return { diff, se, df, crit: t, margin: t * se, lo: diff - t * se, hi: diff + t * se, conf };
}

/* -------------------------------------------------- tamaño de la muestra -- */

/** n para estimar una media con margen de error E. */
export const nForMean = (sigma, marginOfError, conf = 0.95) =>
  Math.ceil((zCrit(conf) * sigma / marginOfError) ** 2);

/** n para estimar una proporción con margen E (p = 0,5 es el caso más exigente). */
export const nForProportion = (marginOfError, conf = 0.95, pExpected = 0.5) =>
  Math.ceil((zCrit(conf) ** 2 * pExpected * (1 - pExpected)) / marginOfError ** 2);

/**
 * Simula la cobertura real de los intervalos: de `reps` muestras, ¿en qué
 * proporción el IC contiene la media verdadera? Debe aproximarse al nivel de
 * confianza. Esta simulación es la mejor forma de explicar qué significa
 * "95 % de confianza" sin caer en la interpretación bayesiana incorrecta.
 */
export function coverageSimulation(population, n, reps, conf = 0.95, rng = new RNG(3)) {
  const mu = mean(population);
  const N = population.length;
  const intervals = [];
  let covered = 0;
  for (let r = 0; r < reps; r++) {
    const sample = Array.from({ length: n }, () => population[rng.int(0, N - 1)]);
    const ci = ciMean(sample, conf);
    const ok = ci.lo <= mu && mu <= ci.hi;
    if (ok) covered++;
    intervals.push({ lo: ci.lo, hi: ci.hi, mean: ci.mean, ok });
  }
  return { mu, intervals, covered, reps, coverage: covered / reps, conf };
}

/**
 * Probabilidad de que la media muestral caiga en un intervalo, usando el TCL.
 * Se usa en los ejercicios del Mundo 7.
 */
export function pMeanBetween(a, b, mu, sigma, n) {
  const se = seMean(sigma, n);
  return normalCdf(b, mu, se) - normalCdf(a, mu, se);
}

/** ¿Es razonable aplicar el TCL? Regla práctica según la forma de la población. */
export function cltGuidance(shape, n) {
  const need = { normal: 1, uniform: 15, bimodal: 30, skewed: 40, 'heavy-tailed': 60, counts: 30 }[shape] ?? 30;
  return {
    need,
    ok: n >= need,
    text: n >= need
      ? `Con n = ${n} la distribución de la media ya es aproximadamente normal para esta forma de población.`
      : `Con n = ${n} la distribución de la media aún arrastra la forma de la población. `
        + `Para este caso se necesita alrededor de n ≥ ${need}.`,
    caveat: 'La regla "n ≥ 30" es una orientación, no un teorema: cuanto más asimétrica sea la población, '
      + 'mayor debe ser n.',
  };
}
