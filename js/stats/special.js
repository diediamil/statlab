/**
 * STATLAB — funciones especiales
 * ---------------------------------------------------------------------------
 * Base numérica para las distribuciones (normal, t, chi², F, binomial).
 * Implementaciones clásicas (Lanczos, fracciones continuas de Lentz) con
 * precisión sobradamente suficiente para docencia (≈1e-12 relativo).
 *
 * Referencias: Numerical Recipes 3ª ed., cap. 6; Abramowitz & Stegun.
 */

const LANCZOS = [
  676.5203681218851, -1259.1392167224028, 771.32342877765313,
  -176.61502916214059, 12.507343278686905, -0.13857109526572012,
  9.9843695780195716e-6, 1.5056327351493116e-7,
];

/** ln Γ(x) para x > 0 (aproximación de Lanczos, g = 7). */
export function logGamma(x) {
  if (x < 0.5) {
    // Reflexión: Γ(x)Γ(1−x) = π / sin(πx)
    return Math.log(Math.PI / Math.sin(Math.PI * x)) - logGamma(1 - x);
  }
  const z = x - 1;
  let a = 0.99999999999980993;
  for (let i = 0; i < LANCZOS.length; i++) a += LANCZOS[i] / (z + i + 1);
  const t = z + LANCZOS.length - 0.5;
  return 0.5 * Math.log(2 * Math.PI) + (z + 0.5) * Math.log(t) - t + Math.log(a);
}

export const gammaFn = (x) => (x > 0 ? Math.exp(logGamma(x)) : Math.PI / (Math.sin(Math.PI * x) * Math.exp(logGamma(1 - x))));

/** ln B(a, b). */
export const logBeta = (a, b) => logGamma(a) + logGamma(b) - logGamma(a + b);

/** ln (n sobre k). */
export function logChoose(n, k) {
  if (k < 0 || k > n) return -Infinity;
  return logGamma(n + 1) - logGamma(k + 1) - logGamma(n - k + 1);
}

export const choose = (n, k) => Math.round(Math.exp(logChoose(n, k)));

const EPS = 3e-16;
const FPMIN = 1e-300;

/** Fracción continua de la beta incompleta (Lentz modificado). */
function betacf(a, b, x) {
  const qab = a + b, qap = a + 1, qam = a - 1;
  let c = 1;
  let d = 1 - (qab * x) / qap;
  if (Math.abs(d) < FPMIN) d = FPMIN;
  d = 1 / d;
  let h = d;
  for (let m = 1; m <= 300; m++) {
    const m2 = 2 * m;
    let aa = (m * (b - m) * x) / ((qam + m2) * (a + m2));
    d = 1 + aa * d; if (Math.abs(d) < FPMIN) d = FPMIN;
    c = 1 + aa / c; if (Math.abs(c) < FPMIN) c = FPMIN;
    d = 1 / d;
    h *= d * c;
    aa = (-(a + m) * (qab + m) * x) / ((a + m2) * (qap + m2));
    d = 1 + aa * d; if (Math.abs(d) < FPMIN) d = FPMIN;
    c = 1 + aa / c; if (Math.abs(c) < FPMIN) c = FPMIN;
    d = 1 / d;
    const del = d * c;
    h *= del;
    if (Math.abs(del - 1) < EPS) break;
  }
  return h;
}

/** Beta incompleta regularizada I_x(a, b). */
export function betaInc(a, b, x) {
  if (x <= 0) return 0;
  if (x >= 1) return 1;
  const front = Math.exp(logGamma(a + b) - logGamma(a) - logGamma(b) + a * Math.log(x) + b * Math.log(1 - x));
  return x < (a + 1) / (a + b + 2)
    ? (front * betacf(a, b, x)) / a
    : 1 - (Math.exp(logGamma(a + b) - logGamma(a) - logGamma(b) + b * Math.log(1 - x) + a * Math.log(x)) * betacf(b, a, 1 - x)) / b;
}

/** Inversa de la beta incompleta: x tal que I_x(a,b) = p. Bisección + Newton. */
export function betaIncInv(a, b, p) {
  if (p <= 0) return 0;
  if (p >= 1) return 1;
  let lo = 0, hi = 1, x = 0.5;
  for (let i = 0; i < 200; i++) {
    x = 0.5 * (lo + hi);
    const v = betaInc(a, b, x);
    if (Math.abs(v - p) < 1e-14) break;
    if (v < p) lo = x; else hi = x;
  }
  return x;
}

/** Serie de la gamma incompleta inferior P(a, x). */
function gser(a, x) {
  const gln = logGamma(a);
  let ap = a, sum = 1 / a, del = sum;
  for (let n = 1; n <= 1000; n++) {
    ap++;
    del *= x / ap;
    sum += del;
    if (Math.abs(del) < Math.abs(sum) * EPS) break;
  }
  return sum * Math.exp(-x + a * Math.log(x) - gln);
}

/** Fracción continua de la gamma incompleta superior Q(a, x). */
function gcf(a, x) {
  const gln = logGamma(a);
  let b = x + 1 - a, c = 1 / FPMIN, d = 1 / b, h = d;
  for (let i = 1; i <= 1000; i++) {
    const an = -i * (i - a);
    b += 2;
    d = an * d + b; if (Math.abs(d) < FPMIN) d = FPMIN;
    c = b + an / c; if (Math.abs(c) < FPMIN) c = FPMIN;
    d = 1 / d;
    const del = d * c;
    h *= del;
    if (Math.abs(del - 1) <= EPS) break;
  }
  return Math.exp(-x + a * Math.log(x) - gln) * h;
}

/** Gamma incompleta regularizada inferior P(a, x). */
export function gammaIncP(a, x) {
  if (x <= 0) return 0;
  return x < a + 1 ? gser(a, x) : 1 - gcf(a, x);
}

/** Gamma incompleta regularizada superior Q(a, x) = 1 − P(a, x). */
export const gammaIncQ = (a, x) => 1 - gammaIncP(a, x);

/** Función error, vía gamma incompleta. */
export function erf(x) {
  return x >= 0 ? gammaIncP(0.5, x * x) : -gammaIncP(0.5, x * x);
}
export const erfc = (x) => 1 - erf(x);

/**
 * Inversa de la normal estándar (Acklam, refinada con un paso de Halley).
 * Error relativo < 1e-15.
 */
export function normInv(p) {
  if (p <= 0) return -Infinity;
  if (p >= 1) return Infinity;
  const a = [-3.969683028665376e+01, 2.209460984245205e+02, -2.759285104469687e+02,
    1.383577518672690e+02, -3.066479806614716e+01, 2.506628277459239e+00];
  const b = [-5.447609879822406e+01, 1.615858368580409e+02, -1.556989798598866e+02,
    6.680131188771972e+01, -1.328068155288572e+01];
  const c = [-7.784894002430293e-03, -3.223964580411365e-01, -2.400758277161838e+00,
    -2.549732539343734e+00, 4.374664141464968e+00, 2.938163982698783e+00];
  const d = [7.784695709041462e-03, 3.224671290700398e-01, 2.445134137142996e+00,
    3.754408661907416e+00];
  const pl = 0.02425;
  let x;
  if (p < pl) {
    const q = Math.sqrt(-2 * Math.log(p));
    x = (((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) /
        ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1);
  } else if (p <= 1 - pl) {
    const q = p - 0.5, r = q * q;
    x = (((((a[0] * r + a[1]) * r + a[2]) * r + a[3]) * r + a[4]) * r + a[5]) * q /
        (((((b[0] * r + b[1]) * r + b[2]) * r + b[3]) * r + b[4]) * r + 1);
  } else {
    const q = Math.sqrt(-2 * Math.log(1 - p));
    x = -(((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) /
         ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1);
  }
  // Refinamiento de Halley
  const e = 0.5 * erfc(-x / Math.SQRT2) - p;
  const u = e * Math.sqrt(2 * Math.PI) * Math.exp((x * x) / 2);
  return x - u / (1 + (x * u) / 2);
}
