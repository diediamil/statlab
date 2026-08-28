/**
 * STATLAB — distribuciones de probabilidad
 * ---------------------------------------------------------------------------
 * Todas las funciones son puras. Convención de nombres:
 *   pdf / pmf  densidad o probabilidad puntual
 *   cdf        F(x) = P(X ≤ x)
 *   inv        cuantil (inversa de la cdf)
 */

import { betaInc, betaIncInv, erf, gammaIncP, logChoose, logGamma, normInv } from './special.js';

/* ------------------------------------------------------------- normal ---- */

export const normalPdf = (x, mu = 0, sd = 1) =>
  Math.exp(-0.5 * ((x - mu) / sd) ** 2) / (sd * Math.sqrt(2 * Math.PI));

export const normalCdf = (x, mu = 0, sd = 1) =>
  0.5 * (1 + erf((x - mu) / (sd * Math.SQRT2)));

export const normalInv = (p, mu = 0, sd = 1) => mu + sd * normInv(p);

/** Puntuación z. */
export const zScore = (x, mu, sd) => (x - mu) / sd;

/** Probabilidad en un intervalo. */
export const normalBetween = (a, b, mu = 0, sd = 1) => normalCdf(b, mu, sd) - normalCdf(a, mu, sd);

/** Valor crítico bilateral z_{1−α/2} (p. ej. 1,96 para 95 %). */
export const zCrit = (conf = 0.95) => normInv(1 - (1 - conf) / 2);

/** La famosa regla 68–95–99,7 calculada, no memorizada. */
export function empiricalRule(mu = 0, sd = 1) {
  return [1, 2, 3].map((k) => ({
    k,
    from: mu - k * sd,
    to: mu + k * sd,
    p: normalBetween(mu - k * sd, mu + k * sd, mu, sd),
  }));
}

/* ------------------------------------------------------------------ t ---- */

export function tPdf(x, df) {
  // ln c = ln Γ((v+1)/2) − ln Γ(v/2) − ½·ln(vπ)
  const lnC = logGamma((df + 1) / 2) - logGamma(df / 2) - 0.5 * Math.log(df * Math.PI);
  return Math.exp(lnC) * (1 + (x * x) / df) ** (-(df + 1) / 2);
}

export function tCdf(t, df) {
  const x = df / (df + t * t);
  const p = 0.5 * betaInc(df / 2, 0.5, x);
  return t > 0 ? 1 - p : p;
}

/** Cuantil de la t de Student. */
export function tInv(p, df) {
  if (p <= 0) return -Infinity;
  if (p >= 1) return Infinity;
  if (p === 0.5) return 0;
  const pp = p < 0.5 ? 2 * p : 2 * (1 - p);
  const x = betaIncInv(df / 2, 0.5, pp);
  const t = Math.sqrt((df * (1 - x)) / x);
  return p < 0.5 ? -t : t;
}

/** Valor crítico bilateral t_{1−α/2, df}. */
export const tCrit = (conf = 0.95, df = 30) => tInv(1 - (1 - conf) / 2, df);

/** p-valor de una t: 'two-sided' | 'greater' | 'less'. */
export function tTestP(t, df, tail = 'two-sided') {
  if (!Number.isFinite(t)) return NaN;
  if (tail === 'greater') return 1 - tCdf(t, df);
  if (tail === 'less') return tCdf(t, df);
  return 2 * (1 - tCdf(Math.abs(t), df));
}

/* --------------------------------------------------------------- chi² ---- */

export const chi2Cdf = (x, df) => (x <= 0 ? 0 : gammaIncP(df / 2, x / 2));

/** p-valor de chi²: siempre cola derecha. */
export const chi2P = (x, df) => (x <= 0 ? 1 : 1 - chi2Cdf(x, df));

export function chi2Inv(p, df) {
  if (p <= 0) return 0;
  if (p >= 1) return Infinity;
  let lo = 0, hi = Math.max(50, df * 10);
  while (chi2Cdf(hi, df) < p) hi *= 2;
  for (let i = 0; i < 200; i++) {
    const mid = (lo + hi) / 2;
    if (chi2Cdf(mid, df) < p) lo = mid; else hi = mid;
  }
  return (lo + hi) / 2;
}

/* ------------------------------------------------------------------ F ---- */

export function fCdf(x, df1, df2) {
  if (x <= 0) return 0;
  return betaInc(df1 / 2, df2 / 2, (df1 * x) / (df1 * x + df2));
}

/** p-valor de F (cola derecha; es el uso habitual en ANOVA). */
export const fP = (x, df1, df2) => (x <= 0 ? 1 : 1 - fCdf(x, df1, df2));

export function fInv(p, df1, df2) {
  if (p <= 0) return 0;
  if (p >= 1) return Infinity;
  let lo = 0, hi = 10;
  while (fCdf(hi, df1, df2) < p) hi *= 2;
  for (let i = 0; i < 200; i++) {
    const mid = (lo + hi) / 2;
    if (fCdf(mid, df1, df2) < p) lo = mid; else hi = mid;
  }
  return (lo + hi) / 2;
}

/* ----------------------------------------------------------- binomial ---- */

export const binomPmf = (k, n, p) => {
  if (k < 0 || k > n) return 0;
  if (p === 0) return k === 0 ? 1 : 0;
  if (p === 1) return k === n ? 1 : 0;
  return Math.exp(logChoose(n, k) + k * Math.log(p) + (n - k) * Math.log(1 - p));
};

export function binomCdf(k, n, p) {
  let s = 0;
  for (let i = 0; i <= Math.min(n, Math.floor(k)); i++) s += binomPmf(i, n, p);
  return Math.min(1, s);
}

export const binomMean = (n, p) => n * p;
export const binomVar = (n, p) => n * p * (1 - p);
export const binomSd = (n, p) => Math.sqrt(binomVar(n, p));

/**
 * ¿Es razonable aproximar la binomial por la normal?
 * Criterio habitual: np ≥ 5 y n(1−p) ≥ 5 (algunos textos usan 10).
 */
export const binomNormalOk = (n, p, k = 5) => n * p >= k && n * (1 - p) >= k;

/* ------------------------------------------------------------ Poisson ---- */

export const poissonPmf = (k, lambda) =>
  Math.exp(-lambda + k * Math.log(lambda) - logFactorial(k));

function logFactorial(k) {
  let s = 0;
  for (let i = 2; i <= k; i++) s += Math.log(i);
  return s;
}
