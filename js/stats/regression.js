/**
 * STATLAB — correlación y regresión lineal simple
 * ---------------------------------------------------------------------------
 * Mundo 11 (correlación) y Mundo 12 (regresión) son deliberadamente distintos.
 * Este módulo mantiene la separación conceptual:
 *
 *   correlación → intensidad y dirección de la asociación; simétrica (r_xy = r_yx);
 *                 sin unidades; no distingue predictora de resultado.
 *   regresión   → modelo predictivo y = b0 + b1·x; NO simétrica; b1 tiene
 *                 unidades (unidades de y por unidad de x); permite predecir.
 *
 * Y en ambos casos: asociación ≠ causalidad.
 */

import { mean, ranks, sd, variance } from './descriptive.js';
import { fP, tCrit, tTestP } from './distributions.js';

/* --------------------------------------------------------- correlación -- */

/** Pares completos (elimina filas con datos faltantes). */
export function completePairs(xs, ys) {
  const out = { xs: [], ys: [], dropped: 0 };
  for (let i = 0; i < Math.min(xs.length, ys.length); i++) {
    if (Number.isFinite(xs[i]) && Number.isFinite(ys[i])) { out.xs.push(xs[i]); out.ys.push(ys[i]); }
    else out.dropped++;
  }
  return out;
}

export function covariance(xs, ys) {
  const { xs: a, ys: b } = completePairs(xs, ys);
  const n = a.length;
  if (n < 2) return NaN;
  const mx = mean(a), my = mean(b);
  let s = 0;
  for (let i = 0; i < n; i++) s += (a[i] - mx) * (b[i] - my);
  return s / (n - 1);
}

/** r de Pearson. */
export function pearsonR(xs, ys) {
  const { xs: a, ys: b } = completePairs(xs, ys);
  const sx = sd(a), sy = sd(b);
  if (!sx || !sy) return NaN;
  return covariance(a, b) / (sx * sy);
}

/**
 * Contraste de r = 0 e intervalo de confianza por la z de Fisher.
 * H0: ρ = 0. Estadístico t = r·√(n−2)/√(1−r²), con n−2 gl.
 */
export function pearsonTest(xs, ys, { tail = 'two-sided', conf = 0.95 } = {}) {
  const { xs: a, ys: b, dropped } = completePairs(xs, ys);
  const n = a.length;
  const r = pearsonR(a, b);
  const df = n - 2;
  const t = r * Math.sqrt(df / (1 - r * r));
  const ci = fisherZCi(r, n, conf);
  return {
    test: 'pearson',
    name: 'Correlación de Pearson',
    statistic: t, df, p: tTestP(t, df, tail), tail,
    effect: { name: 'r', value: r, kind: 'r', extra: { r2: r * r } },
    ci,
    detail: { n, r, r2: r * r, dropped, covariance: covariance(a, b), sdX: sd(a), sdY: sd(b) },
    assumptions: [
      'Ambas variables cuantitativas',
      'Relación LINEAL (un r pequeño no descarta una relación curva)',
      'Normalidad bivariante para el contraste',
      'Sensible a valores atípicos: un solo punto puede crear o destruir la correlación',
      'La correlación NO implica causalidad',
    ],
  };
}

/** IC de r por transformación z de Fisher. */
export function fisherZCi(r, n, conf = 0.95) {
  if (n < 4 || Math.abs(r) >= 1) return [NaN, NaN];
  const z = 0.5 * Math.log((1 + r) / (1 - r));
  const seZ = 1 / Math.sqrt(n - 3);
  const zc = conf === 0.95 ? 1.959963984540054 : critNormal(conf);
  const lo = z - zc * seZ, hi = z + zc * seZ;
  return [Math.tanh(lo), Math.tanh(hi)];
}

function critNormal(conf) {
  const target = 1 - (1 - conf) / 2;
  const phi = (x) => {
    const t = 1 / (1 + 0.2316419 * Math.abs(x));
    const poly = t * (0.319381530 + t * (-0.356563782 + t * (1.781477937 + t * (-1.821255978 + t * 1.330274429))));
    const p = 1 - (Math.exp(-x * x / 2) / Math.sqrt(2 * Math.PI)) * poly;
    return x >= 0 ? p : 1 - p;
  };
  let lo = 0, hi = 8;
  for (let i = 0; i < 80; i++) { const m = (lo + hi) / 2; if (phi(m) < target) lo = m; else hi = m; }
  return (lo + hi) / 2;
}

/** rho de Spearman: Pearson sobre los rangos (robusta y para variables ordinales). */
export function spearmanRho(xs, ys) {
  const { xs: a, ys: b } = completePairs(xs, ys);
  return pearsonR(ranks(a), ranks(b));
}

export function spearmanTest(xs, ys, { tail = 'two-sided' } = {}) {
  const { xs: a, ys: b } = completePairs(xs, ys);
  const n = a.length;
  const rho = spearmanRho(a, b);
  const df = n - 2;
  const t = rho * Math.sqrt(df / (1 - rho * rho));
  return {
    test: 'spearman',
    name: 'Correlación de Spearman',
    statistic: t, df, p: tTestP(t, df, tail), tail,
    effect: { name: 'rho', value: rho, kind: 'r' },
    ci: null,
    detail: { n, rho, pearson: pearsonR(a, b) },
    assumptions: ['Variables al menos ordinales', 'Relación MONÓTONA (no necesariamente lineal)',
      'No exige normalidad', 'Más robusta a valores atípicos que Pearson'],
  };
}

/* ------------------------------------------------------------ regresión -- */

/**
 * Regresión lineal simple por mínimos cuadrados ordinarios.
 * Devuelve el modelo completo con inferencia, residuos y diagnóstico.
 */
export function linearRegression(xs, ys, { conf = 0.95 } = {}) {
  const { xs: x, ys: y, dropped } = completePairs(xs, ys);
  const n = x.length;
  const mx = mean(x), my = mean(y);

  let sxy = 0, sxx = 0;
  for (let i = 0; i < n; i++) { sxy += (x[i] - mx) * (y[i] - my); sxx += (x[i] - mx) ** 2; }
  const b1 = sxy / sxx;                 // pendiente
  const b0 = my - b1 * mx;              // intercepto

  const fitted = x.map((xi) => b0 + b1 * xi);
  const residuals = y.map((yi, i) => yi - fitted[i]);

  const ssTotal = y.reduce((s, yi) => s + (yi - my) ** 2, 0);
  const ssRes = residuals.reduce((s, e) => s + e * e, 0);
  const ssReg = ssTotal - ssRes;
  const df = n - 2;
  const mse = ssRes / df;
  const rse = Math.sqrt(mse);           // error típico de la estimación
  const r2 = ssTotal ? ssReg / ssTotal : NaN;
  const r2adj = 1 - ((1 - r2) * (n - 1)) / df;

  const seB1 = Math.sqrt(mse / sxx);
  const seB0 = Math.sqrt(mse * (1 / n + (mx * mx) / sxx));
  const tB1 = b1 / seB1, tB0 = b0 / seB0;
  const tc = tCrit(conf, df);
  const F = ssReg / mse;

  // Diagnóstico de influencia
  const leverage = x.map((xi) => 1 / n + ((xi - mx) ** 2) / sxx);
  const stdResid = residuals.map((e, i) => e / (rse * Math.sqrt(1 - leverage[i])));
  const cooksD = residuals.map((e, i) => (stdResid[i] ** 2 / 2) * (leverage[i] / (1 - leverage[i])));

  return {
    test: 'linear-regression',
    name: 'Regresión lineal simple (mínimos cuadrados)',
    n, dropped,
    intercept: b0, slope: b1,
    seIntercept: seB0, seSlope: seB1,
    tIntercept: tB0, tSlope: tB1,
    pIntercept: tTestP(tB0, df),
    pSlope: tTestP(tB1, df),
    ciSlope: [b1 - tc * seB1, b1 + tc * seB1],
    ciIntercept: [b0 - tc * seB0, b0 + tc * seB0],
    r: pearsonR(x, y), r2, r2adj,
    df, F, pF: fP(F, 1, df),
    ssTotal, ssReg, ssRes, mse, rse,
    fitted, residuals, leverage, stdResid, cooksD,
    xRange: [Math.min(...x), Math.max(...x)],
    meanX: mx, meanY: my, sdX: sd(x), sdY: sd(y), varY: variance(y),
    /** Predicción puntual. */
    predict(xi) { return b0 + b1 * xi; },
    /** Intervalo de confianza de la media de y en x = xi. */
    ciMean(xi) {
      const seFit = Math.sqrt(mse * (1 / n + ((xi - mx) ** 2) / sxx));
      return [b0 + b1 * xi - tc * seFit, b0 + b1 * xi + tc * seFit];
    },
    /** Intervalo de predicción para una observación nueva en x = xi (más ancho). */
    piNew(xi) {
      const sePred = Math.sqrt(mse * (1 + 1 / n + ((xi - mx) ** 2) / sxx));
      return [b0 + b1 * xi - tc * sePred, b0 + b1 * xi + tc * sePred];
    },
    /** ¿Es extrapolación? Predecir fuera del rango observado no está justificado. */
    isExtrapolation(xi) { return xi < Math.min(...x) || xi > Math.max(...x); },
    assumptions: [
      'Linealidad: la relación media es una recta (revisa residuos frente a predichos)',
      'Independencia de las observaciones',
      'Homocedasticidad: varianza de los residuos constante',
      'Normalidad de los residuos (no de las variables)',
      'R² mide varianza explicada, NO causalidad ni bondad del ajuste fuera del rango observado',
    ],
    interpretation: {
      slope: `Por cada unidad que aumenta la variable independiente, la dependiente cambia en promedio ${b1.toFixed(4)} unidades.`,
      intercept: `Valor esperado de la dependiente cuando la independiente vale 0`
        + (Math.min(...x) > 0 ? ' (ojo: x = 0 está fuera del rango observado, así que el intercepto puede no tener sentido real).' : '.'),
      r2: `El modelo explica el ${(r2 * 100).toFixed(1)} % de la variabilidad de la variable dependiente.`,
    },
  };
}

/** Índices con influencia potencialmente alta (criterios habituales). */
export function influentialPoints(model) {
  const nThr = 4 / model.n;                  // Cook's D > 4/n
  const levThr = (2 * 2) / model.n;          // apalancamiento > 2p/n con p = 2
  const out = [];
  for (let i = 0; i < model.n; i++) {
    const flags = [];
    if (model.cooksD[i] > nThr) flags.push('cook');
    if (model.leverage[i] > levThr) flags.push('leverage');
    if (Math.abs(model.stdResid[i]) > 2) flags.push('residual');
    if (flags.length) out.push({ i, flags, cooksD: model.cooksD[i], leverage: model.leverage[i], stdResid: model.stdResid[i] });
  }
  return out;
}

/** Recta a partir de dos puntos (para el laboratorio de "ajusta la recta a ojo"). */
export function lineThrough(p1, p2) {
  const slope = (p2.y - p1.y) / (p2.x - p1.x);
  return { slope, intercept: p1.y - slope * p1.x };
}

/** Suma de cuadrados de los residuos de una recta arbitraria (juego de MCO). */
export function sseFor(xs, ys, b0, b1) {
  let s = 0;
  for (let i = 0; i < xs.length; i++) s += (ys[i] - (b0 + b1 * xs[i])) ** 2;
  return s;
}
