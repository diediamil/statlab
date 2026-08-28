/**
 * STATLAB — estadística descriptiva
 * ---------------------------------------------------------------------------
 * Decisiones explícitas (y visibles para el alumno en la app):
 *
 * · Varianza: por defecto CUASIVARIANZA MUESTRAL (denominador n−1), porque es
 *   el estimador insesgado de σ² y es lo que devuelven R, SPSS, Excel (VAR.S)
 *   y Python (pandas). Se ofrece también la poblacional (n) para los ejercicios
 *   que trabajan con toda la población.
 *
 * · Cuartiles: método 7 de Hyndman–Fan (interpolación lineal), el mismo que
 *   usan R por defecto, numpy.percentile y Excel PERCENTIL.INC. Se documenta
 *   porque distintos métodos dan resultados distintos y eso confunde al alumno.
 *
 * · Outliers: criterio de Tukey (fuera de [Q1 − 1,5·IQR, Q3 + 1,5·IQR]).
 *   "Outlier" NO significa "error" ni "dato a eliminar": significa "dato que
 *   merece ser mirado".
 */

/** Copia numérica limpia y ordenada. */
export function cleanSort(xs) {
  return xs.filter((x) => typeof x === 'number' && Number.isFinite(x)).slice().sort((a, b) => a - b);
}

export const n = (xs) => cleanSort(xs).length;

export function sum(xs) {
  let s = 0;
  for (const x of xs) if (Number.isFinite(x)) s += x;
  return s;
}

export function mean(xs) {
  const a = xs.filter(Number.isFinite);
  return a.length ? sum(a) / a.length : NaN;
}

export function median(xs) {
  const a = cleanSort(xs);
  if (!a.length) return NaN;
  const m = a.length >> 1;
  return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2;
}

/** Moda(s). Devuelve array porque puede haber empates (o ninguna). */
export function mode(xs) {
  const counts = new Map();
  for (const x of xs) counts.set(x, (counts.get(x) || 0) + 1);
  let best = 0;
  for (const c of counts.values()) best = Math.max(best, c);
  if (best <= 1) return [];              // sin repeticiones → no hay moda
  return Array.from(counts.entries()).filter(([, c]) => c === best).map(([v]) => v).sort((a, b) => a - b);
}

/** Cuasivarianza muestral (n−1). */
export function variance(xs) {
  const a = xs.filter(Number.isFinite);
  if (a.length < 2) return NaN;
  const m = mean(a);
  return a.reduce((s, x) => s + (x - m) ** 2, 0) / (a.length - 1);
}

/** Varianza poblacional (n). */
export function variancePop(xs) {
  const a = xs.filter(Number.isFinite);
  if (!a.length) return NaN;
  const m = mean(a);
  return a.reduce((s, x) => s + (x - m) ** 2, 0) / a.length;
}

export const sd = (xs) => Math.sqrt(variance(xs));
export const sdPop = (xs) => Math.sqrt(variancePop(xs));

/** Error estándar de la media: SE = s / √n. NO es la desviación típica. */
export function se(xs) {
  const a = xs.filter(Number.isFinite);
  return a.length ? sd(a) / Math.sqrt(a.length) : NaN;
}

export const min = (xs) => (cleanSort(xs)[0] ?? NaN);
export const max = (xs) => { const a = cleanSort(xs); return a.length ? a[a.length - 1] : NaN; };
export function rangeOf(xs) {
  const a = cleanSort(xs);
  return a.length ? a[a.length - 1] - a[0] : NaN;
}

/**
 * Percentil por interpolación lineal (tipo 7 de Hyndman–Fan).
 * @param {number[]} xs
 * @param {number} p percentil en [0, 100]
 */
export function percentile(xs, p) {
  const a = cleanSort(xs);
  if (!a.length) return NaN;
  if (a.length === 1) return a[0];
  const h = ((a.length - 1) * p) / 100;
  const lo = Math.floor(h), hi = Math.ceil(h);
  return a[lo] + (h - lo) * (a[hi] - a[lo]);
}

export const q1 = (xs) => percentile(xs, 25);
export const q2 = (xs) => percentile(xs, 50);
export const q3 = (xs) => percentile(xs, 75);
export const iqr = (xs) => percentile(xs, 75) - percentile(xs, 25);

/** Coeficiente de variación (solo tiene sentido con media > 0 y escala de razón). */
export function cv(xs) {
  const m = mean(xs);
  return m === 0 ? NaN : sd(xs) / Math.abs(m);
}

/** Asimetría muestral (g1 ajustada, como SPSS/Excel). */
export function skewness(xs) {
  const a = xs.filter(Number.isFinite);
  const N = a.length;
  if (N < 3) return NaN;
  const m = mean(a), s = sd(a);
  if (!s) return NaN;
  const g1 = a.reduce((acc, x) => acc + ((x - m) / s) ** 3, 0);
  return (N / ((N - 1) * (N - 2))) * g1;
}

/** Curtosis muestral (exceso, como SPSS/Excel: 0 = normal). */
export function kurtosis(xs) {
  const a = xs.filter(Number.isFinite);
  const N = a.length;
  if (N < 4) return NaN;
  const m = mean(a), s = sd(a);
  if (!s) return NaN;
  const g2 = a.reduce((acc, x) => acc + ((x - m) / s) ** 4, 0);
  return ((N * (N + 1)) / ((N - 1) * (N - 2) * (N - 3))) * g2
       - (3 * (N - 1) ** 2) / ((N - 2) * (N - 3));
}

/** Resumen de cinco números + bigotes de Tukey + outliers. */
export function fiveNumber(xs) {
  const a = cleanSort(xs);
  const Q1 = percentile(a, 25), Q2 = percentile(a, 50), Q3 = percentile(a, 75);
  const IQR = Q3 - Q1;
  const loFence = Q1 - 1.5 * IQR, hiFence = Q3 + 1.5 * IQR;
  const inner = a.filter((x) => x >= loFence && x <= hiFence);
  return {
    min: a[0], q1: Q1, median: Q2, q3: Q3, max: a[a.length - 1],
    iqr: IQR,
    loFence, hiFence,
    whiskerLo: inner.length ? inner[0] : a[0],
    whiskerHi: inner.length ? inner[inner.length - 1] : a[a.length - 1],
    outliers: a.filter((x) => x < loFence || x > hiFence),
  };
}

export const outliersTukey = (xs) => fiveNumber(xs).outliers;

/** Tabla de frecuencias para una variable categórica u ordinal. */
export function frequencyTable(values, order = null) {
  const counts = new Map();
  for (const v of values) counts.set(v, (counts.get(v) || 0) + 1);
  const keys = order ? order.filter((k) => counts.has(k)) : Array.from(counts.keys()).sort();
  const total = values.length;
  let cum = 0;
  return keys.map((k) => {
    const f = counts.get(k) || 0;
    cum += f;
    return { value: k, f, rel: total ? f / total : 0, cum, cumRel: total ? cum / total : 0 };
  });
}

/**
 * Agrupación en clases para un histograma.
 * Regla por defecto: Sturges (k = 1 + log2 n), la más habitual en docencia.
 * Se puede forzar el número de clases.
 */
export function histogramBins(xs, bins = null) {
  const a = cleanSort(xs);
  if (a.length < 2) return [];
  const k = bins || Math.max(1, Math.ceil(1 + Math.log2(a.length)));
  const lo = a[0], hi = a[a.length - 1];
  const width = (hi - lo) / k || 1;
  const out = Array.from({ length: k }, (_, i) => ({
    from: lo + i * width, to: lo + (i + 1) * width, count: 0,
  }));
  for (const x of a) {
    let idx = Math.floor((x - lo) / width);
    if (idx >= k) idx = k - 1;          // el máximo cae en la última clase
    if (idx < 0) idx = 0;
    out[idx].count++;
  }
  return out.map((b) => ({ ...b, rel: b.count / a.length, mid: (b.from + b.to) / 2 }));
}

/** Descripción completa: lo que devuelve `summary()` en R, pero en español. */
export function describe(xs) {
  const a = xs.filter(Number.isFinite);
  const five = a.length ? fiveNumber(a) : {};
  return {
    n: a.length,
    missing: xs.length - a.length,
    mean: mean(a), median: median(a), mode: mode(a),
    sd: sd(a), variance: variance(a), se: se(a), cv: cv(a),
    min: five.min, max: five.max, range: rangeOf(a),
    q1: five.q1, q3: five.q3, iqr: five.iqr,
    skewness: skewness(a), kurtosis: kurtosis(a),
    outliers: five.outliers || [],
  };
}

/** Estandarización: z de cada valor respecto a su propia muestra. */
export function zScores(xs) {
  const m = mean(xs), s = sd(xs);
  return xs.map((x) => (Number.isFinite(x) && s ? (x - m) / s : NaN));
}

/** Rangos con promedio de empates (base de Spearman, Mann–Whitney, Wilcoxon). */
export function ranks(xs) {
  const idx = xs.map((v, i) => [v, i]).sort((a, b) => a[0] - b[0]);
  const out = new Array(xs.length);
  let i = 0;
  while (i < idx.length) {
    let j = i;
    while (j + 1 < idx.length && idx[j + 1][0] === idx[i][0]) j++;
    const avg = (i + j) / 2 + 1;           // rangos base 1
    for (let k = i; k <= j; k++) out[idx[k][1]] = avg;
    i = j + 1;
  }
  return out;
}

/** Número de grupos de empates y su tamaño (corrección de varianza). */
export function tieGroups(xs) {
  const counts = new Map();
  for (const x of xs) counts.set(x, (counts.get(x) || 0) + 1);
  return Array.from(counts.values()).filter((c) => c > 1);
}
