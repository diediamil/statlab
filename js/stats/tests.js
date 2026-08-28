/**
 * STATLAB — contrastes de hipótesis
 * ---------------------------------------------------------------------------
 * Cada función devuelve un objeto homogéneo:
 *   {
 *     test:      identificador de la prueba,
 *     name:      nombre en español,
 *     statistic: valor del estadístico,
 *     df:        grados de libertad (número, par o null),
 *     p:         p-valor,
 *     tail:      'two-sided' | 'greater' | 'less',
 *     effect:    tamaño del efecto pertinente (ver stats/effects.js),
 *     ci:        intervalo de confianza cuando procede,
 *     detail:    piezas intermedias útiles para explicar el resultado,
 *     assumptions: supuestos que el alumno debería comprobar,
 *   }
 *
 * IMPORTANTE (rigor): el p-valor es P(datos tan o más extremos | H0 cierta).
 * NO es P(H0 | datos) ni la probabilidad de que H0 sea cierta. Los textos de
 * la app deben decirlo así, y `interpretP()` devuelve una redacción correcta.
 */

import { chi2P, fP, normalCdf, tCrit, tTestP } from './distributions.js';
import { mean, ranks, sd, tieGroups, variance } from './descriptive.js';
import * as effects from './effects.js';

/* ---------------------------------------------------------- t 1 muestra -- */

export function tTestOneSample(xs, mu0 = 0, { tail = 'two-sided', conf = 0.95 } = {}) {
  const a = xs.filter(Number.isFinite);
  const N = a.length, m = mean(a), s = sd(a);
  const seM = s / Math.sqrt(N);
  const t = (m - mu0) / seM;
  const df = N - 1;
  const tc = tCrit(conf, df);
  return {
    test: 't-one-sample',
    name: 't de Student para una muestra',
    statistic: t, df, p: tTestP(t, df, tail), tail,
    effect: { name: "d de Cohen", value: (m - mu0) / s, kind: 'd' },
    ci: [m - tc * seM, m + tc * seM],
    detail: { n: N, mean: m, sd: s, se: seM, mu0, conf },
    assumptions: ['Observaciones independientes', 'Variable cuantitativa', 'Normalidad aproximada (o n grande)'],
  };
}

/* ------------------------------------------------- t muestras indep. ----- */

/**
 * t para dos muestras independientes.
 * @param {boolean} equalVar  true → t de Student agrupada; false → Welch (por
 *   defecto, porque no exige igualdad de varianzas y es la recomendación
 *   actual incluso cuando el test de Levene no es significativo).
 */
export function tTestIndependent(xs, ys, { tail = 'two-sided', conf = 0.95, equalVar = false } = {}) {
  const a = xs.filter(Number.isFinite), b = ys.filter(Number.isFinite);
  const n1 = a.length, n2 = b.length;
  const m1 = mean(a), m2 = mean(b);
  const v1 = variance(a), v2 = variance(b);
  let df, seDiff;
  if (equalVar) {
    const sp2 = ((n1 - 1) * v1 + (n2 - 1) * v2) / (n1 + n2 - 2);
    seDiff = Math.sqrt(sp2 * (1 / n1 + 1 / n2));
    df = n1 + n2 - 2;
  } else {
    seDiff = Math.sqrt(v1 / n1 + v2 / n2);
    df = (v1 / n1 + v2 / n2) ** 2 / ((v1 / n1) ** 2 / (n1 - 1) + (v2 / n2) ** 2 / (n2 - 1));
  }
  const t = (m1 - m2) / seDiff;
  const tc = tCrit(conf, df);
  return {
    test: equalVar ? 't-independent-pooled' : 't-independent-welch',
    name: equalVar ? 't de Student para muestras independientes' : 't de Welch para muestras independientes',
    statistic: t, df, p: tTestP(t, df, tail), tail,
    effect: { name: 'd de Cohen', value: effects.cohenD(a, b), kind: 'd' },
    ci: [(m1 - m2) - tc * seDiff, (m1 - m2) + tc * seDiff],
    detail: { n1, n2, mean1: m1, mean2: m2, sd1: Math.sqrt(v1), sd2: Math.sqrt(v2), diff: m1 - m2, se: seDiff, conf },
    assumptions: ['Grupos independientes', 'Variable cuantitativa', 'Normalidad aproximada en cada grupo (o n grande)',
      equalVar ? 'Varianzas homogéneas' : 'No exige varianzas homogéneas (Welch)'],
  };
}

/* ------------------------------------------------------- t pareada ------- */

export function tTestPaired(pre, post, { tail = 'two-sided', conf = 0.95 } = {}) {
  const pairs = pre.map((x, i) => [x, post[i]]).filter(([x, y]) => Number.isFinite(x) && Number.isFinite(y));
  const d = pairs.map(([x, y]) => y - x);          // post − pre
  const N = d.length, md = mean(d), sdd = sd(d);
  const seD = sdd / Math.sqrt(N);
  const t = md / seD;
  const df = N - 1;
  const tc = tCrit(conf, df);
  return {
    test: 't-paired',
    name: 't de Student para muestras relacionadas',
    statistic: t, df, p: tTestP(t, df, tail), tail,
    effect: { name: 'd de Cohen (pareada)', value: md / sdd, kind: 'd' },
    ci: [md - tc * seD, md + tc * seD],
    detail: { n: N, meanDiff: md, sdDiff: sdd, se: seD, meanPre: mean(pairs.map((p) => p[0])), meanPost: mean(pairs.map((p) => p[1])), conf },
    assumptions: ['Mediciones emparejadas (mismo sujeto o pares equivalentes)', 'Diferencias con distribución aproximadamente normal'],
  };
}

/* ------------------------------------------------------------ ANOVA ----- */

/** ANOVA de un factor. `groups` = array de arrays. */
export function anovaOneWay(groups) {
  const gs = groups.map((g) => g.filter(Number.isFinite)).filter((g) => g.length > 0);
  const k = gs.length;
  const N = gs.reduce((s, g) => s + g.length, 0);
  const grand = gs.flat();
  const gm = mean(grand);
  const ssBetween = gs.reduce((s, g) => s + g.length * (mean(g) - gm) ** 2, 0);
  const ssWithin = gs.reduce((s, g) => { const m = mean(g); return s + g.reduce((t, x) => t + (x - m) ** 2, 0); }, 0);
  const ssTotal = ssBetween + ssWithin;
  const dfB = k - 1, dfW = N - k;
  const msB = ssBetween / dfB, msW = ssWithin / dfW;
  const F = msB / msW;
  return {
    test: 'anova-one-way',
    name: 'ANOVA de un factor',
    statistic: F, df: [dfB, dfW], p: fP(F, dfB, dfW), tail: 'greater',
    effect: { name: 'η² (eta cuadrado)', value: ssBetween / ssTotal, kind: 'eta2' },
    ci: null,
    detail: {
      k, n: N, groupMeans: gs.map(mean), groupSds: gs.map(sd), groupNs: gs.map((g) => g.length),
      ssBetween, ssWithin, ssTotal, dfB, dfW, msB, msW,
      omega2: (ssBetween - dfB * msW) / (ssTotal + msW),
    },
    assumptions: ['Grupos independientes', 'Normalidad aproximada en cada grupo', 'Homogeneidad de varianzas',
      'Un ANOVA significativo indica que ALGUNA media difiere: hacen falta comparaciones post hoc para saber cuáles'],
  };
}

/** Levene centrado en la mediana (= Brown–Forsythe, más robusto que la media). */
export function leveneTest(groups) {
  const gs = groups.map((g) => g.filter(Number.isFinite)).filter((g) => g.length > 1);
  const z = gs.map((g) => {
    const med = medianOf(g);
    return g.map((x) => Math.abs(x - med));
  });
  const res = anovaOneWay(z);
  return {
    test: 'levene',
    name: 'Prueba de Levene (Brown–Forsythe) de homogeneidad de varianzas',
    statistic: res.statistic, df: res.df, p: res.p, tail: 'greater',
    effect: null, ci: null,
    detail: { note: 'H0: las varianzas son iguales. Un p pequeño sugiere varianzas distintas.' },
    assumptions: ['Grupos independientes'],
  };
}

/* --------------------------------------------------------- chi-cuadrado -- */

/**
 * Chi-cuadrado de independencia en una tabla de contingencia.
 * @param {number[][]} table filas × columnas de frecuencias observadas
 * @param {boolean} yates corrección de continuidad (solo tablas 2×2)
 */
export function chiSquareIndependence(table, { yates = false } = {}) {
  const rows = table.length, cols = table[0].length;
  const rowSums = table.map((r) => r.reduce((s, x) => s + x, 0));
  const colSums = Array.from({ length: cols }, (_, j) => table.reduce((s, r) => s + r[j], 0));
  const N = rowSums.reduce((s, x) => s + x, 0);
  const expected = table.map((r, i) => r.map((_, j) => (rowSums[i] * colSums[j]) / N));
  const use2x2Yates = yates && rows === 2 && cols === 2;
  let chi2 = 0;
  for (let i = 0; i < rows; i++) {
    for (let j = 0; j < cols; j++) {
      const o = table[i][j], e = expected[i][j];
      const num = use2x2Yates ? Math.max(0, Math.abs(o - e) - 0.5) ** 2 : (o - e) ** 2;
      chi2 += num / e;
    }
  }
  const df = (rows - 1) * (cols - 1);
  const minExpected = Math.min(...expected.flat());
  const smallCells = expected.flat().filter((e) => e < 5).length;
  return {
    test: 'chi2-independence',
    name: use2x2Yates ? 'Chi-cuadrado de independencia (corrección de Yates)' : 'Chi-cuadrado de independencia',
    statistic: chi2, df, p: chi2P(chi2, df), tail: 'greater',
    effect: {
      name: rows === 2 && cols === 2 ? 'φ (phi)' : 'V de Cramér',
      value: effects.cramersV(chi2, N, rows, cols), kind: 'cramersV',
    },
    ci: null,
    detail: { observed: table, expected, rowSums, colSums, n: N, minExpected, smallCells },
    assumptions: [
      'Observaciones independientes (cada individuo cuenta una sola vez)',
      'Frecuencias ESPERADAS ≥ 5 en al menos el 80 % de las casillas',
      minExpected < 5 ? `Hay casillas con esperada < 5 (mínimo ${minExpected.toFixed(2)}): considera la prueba exacta de Fisher` : 'Frecuencias esperadas suficientes',
    ],
  };
}

/** Chi-cuadrado de bondad de ajuste. */
export function chiSquareGoodness(observed, expectedProbs = null) {
  const N = observed.reduce((s, x) => s + x, 0);
  const k = observed.length;
  const probs = expectedProbs || Array(k).fill(1 / k);
  const expected = probs.map((p) => p * N);
  let chi2 = 0;
  for (let i = 0; i < k; i++) chi2 += (observed[i] - expected[i]) ** 2 / expected[i];
  const df = k - 1;
  return {
    test: 'chi2-goodness',
    name: 'Chi-cuadrado de bondad de ajuste',
    statistic: chi2, df, p: chi2P(chi2, df), tail: 'greater',
    effect: { name: 'w de Cohen', value: Math.sqrt(chi2 / N), kind: 'w' },
    ci: null,
    detail: { observed, expected, n: N },
    assumptions: ['Observaciones independientes', 'Frecuencias esperadas ≥ 5'],
  };
}

/* ---------------------------------------------------- Fisher exacto 2×2 -- */

/** Prueba exacta de Fisher para tablas 2×2 (bilateral por suma de tablas). */
export function fisherExact2x2(table, { tail = 'two-sided' } = {}) {
  const [[a, b], [c, d]] = table;
  const N = a + b + c + d;
  const r1 = a + b, r2 = c + d, c1 = a + c, c2 = b + d;

  const logFact = (k) => { let s = 0; for (let i = 2; i <= k; i++) s += Math.log(i); return s; };
  const pTable = (x) => Math.exp(
    logFact(r1) + logFact(r2) + logFact(c1) + logFact(c2) - logFact(N)
    - logFact(x) - logFact(r1 - x) - logFact(c1 - x) - logFact(N - r1 - c1 + x),
  );

  const lo = Math.max(0, c1 - r2), hi = Math.min(r1, c1);
  const pObs = pTable(a);
  let pTwo = 0, pLess = 0, pGreater = 0;
  for (let x = lo; x <= hi; x++) {
    const p = pTable(x);
    if (p <= pObs * (1 + 1e-9)) pTwo += p;
    if (x <= a) pLess += p;
    if (x >= a) pGreater += p;
  }
  const p = tail === 'less' ? pLess : tail === 'greater' ? pGreater : Math.min(1, pTwo);
  return {
    test: 'fisher-exact',
    name: 'Prueba exacta de Fisher (2×2)',
    statistic: null, df: null, p, tail,
    effect: { name: 'Odds ratio', value: (a * d) / (b * c), kind: 'or' },
    ci: null,
    detail: { table, n: N, oddsRatio: (a * d) / (b * c), riskRatio: (a / r1) / (c / r2) },
    assumptions: ['Observaciones independientes', 'Tabla 2×2', 'Válida con frecuencias esperadas pequeñas (por eso se usa en lugar de chi²)'],
  };
}

/* ------------------------------------------------------- Mann–Whitney --- */

/** U de Mann–Whitney (aproximación normal con corrección por empates). */
export function mannWhitneyU(xs, ys, { tail = 'two-sided' } = {}) {
  const a = xs.filter(Number.isFinite), b = ys.filter(Number.isFinite);
  const n1 = a.length, n2 = b.length;
  const all = a.concat(b);
  const r = ranks(all);
  const R1 = r.slice(0, n1).reduce((s, x) => s + x, 0);
  const U1 = R1 - (n1 * (n1 + 1)) / 2;
  const U2 = n1 * n2 - U1;
  const U = Math.min(U1, U2);
  const muU = (n1 * n2) / 2;
  const N = n1 + n2;
  const ties = tieGroups(all);
  const tieCorr = ties.reduce((s, t) => s + (t ** 3 - t), 0);
  const sigmaU = Math.sqrt((n1 * n2 / (N * (N - 1))) * ((N ** 3 - N) / 12 - tieCorr / 12));
  const zRaw = (U1 - muU) / sigmaU;
  const z = (Math.abs(U1 - muU) - 0.5) / sigmaU * Math.sign(zRaw || 1);  // corrección de continuidad
  const p = tail === 'two-sided' ? 2 * (1 - normalCdf(Math.abs(z)))
    : tail === 'greater' ? 1 - normalCdf(z) : normalCdf(z);
  return {
    test: 'mann-whitney',
    name: 'U de Mann–Whitney (Wilcoxon de dos muestras)',
    statistic: U, df: null, p: Math.min(1, p), tail,
    effect: {
      name: 'r (a partir de z)', value: Math.abs(z) / Math.sqrt(N), kind: 'r',
      extra: { commonLanguage: U1 / (n1 * n2) },
    },
    ci: null,
    detail: { n1, n2, U1, U2, R1, z, medians: [medianOf(a), medianOf(b)], ties: ties.length },
    assumptions: ['Grupos independientes', 'Variable al menos ordinal',
      'No exige normalidad', 'Contrasta si un grupo tiende a dar valores mayores (desplazamiento de la distribución)'],
  };
}

const medianOf = (xs) => {
  const a = xs.slice().sort((x, y) => x - y);
  if (!a.length) return NaN;
  const m = a.length >> 1;
  return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2;
};

/* ---------------------------------------------------- Wilcoxon pareado -- */

/** Wilcoxon de rangos con signo (aproximación normal). */
export function wilcoxonSignedRank(pre, post, { tail = 'two-sided' } = {}) {
  const diffs = pre.map((x, i) => post[i] - x)
    .filter((d) => Number.isFinite(d) && d !== 0);            // se descartan empates exactos
  const N = diffs.length;
  const absR = ranks(diffs.map(Math.abs));
  let Wplus = 0, Wminus = 0;
  diffs.forEach((d, i) => { if (d > 0) Wplus += absR[i]; else Wminus += absR[i]; });
  const W = Math.min(Wplus, Wminus);
  const muW = (N * (N + 1)) / 4;
  const ties = tieGroups(diffs.map(Math.abs));
  const tieCorr = ties.reduce((s, t) => s + (t ** 3 - t), 0) / 48;
  const sigmaW = Math.sqrt((N * (N + 1) * (2 * N + 1)) / 24 - tieCorr);
  const zRaw = (Wplus - muW) / sigmaW;
  const z = ((Math.abs(Wplus - muW) - 0.5) / sigmaW) * Math.sign(zRaw || 1);
  const p = tail === 'two-sided' ? 2 * (1 - normalCdf(Math.abs(z)))
    : tail === 'greater' ? 1 - normalCdf(z) : normalCdf(z);
  return {
    test: 'wilcoxon-signed-rank',
    name: 'Wilcoxon de rangos con signo (muestras relacionadas)',
    statistic: W, df: null, p: Math.min(1, p), tail,
    effect: { name: 'r (a partir de z)', value: Math.abs(z) / Math.sqrt(N), kind: 'r' },
    ci: null,
    detail: { n: N, Wplus, Wminus, z, nZeroDropped: pre.length - N, medianDiff: medianOf(diffs) },
    assumptions: ['Mediciones emparejadas', 'Variable al menos ordinal', 'No exige normalidad'],
  };
}

/* ------------------------------------------------------ Kruskal–Wallis -- */

export function kruskalWallis(groups) {
  const gs = groups.map((g) => g.filter(Number.isFinite)).filter((g) => g.length > 0);
  const all = gs.flat();
  const N = all.length;
  const r = ranks(all);
  let idx = 0, H = 0;
  const rankSums = [];
  for (const g of gs) {
    const rs = r.slice(idx, idx + g.length).reduce((s, x) => s + x, 0);
    rankSums.push(rs);
    H += (rs ** 2) / g.length;
    idx += g.length;
  }
  H = (12 / (N * (N + 1))) * H - 3 * (N + 1);
  const ties = tieGroups(all);
  const tieCorr = 1 - ties.reduce((s, t) => s + (t ** 3 - t), 0) / (N ** 3 - N);
  const Hc = tieCorr > 0 ? H / tieCorr : H;
  const df = gs.length - 1;
  return {
    test: 'kruskal-wallis',
    name: 'H de Kruskal–Wallis',
    statistic: Hc, df, p: chi2P(Hc, df), tail: 'greater',
    effect: { name: 'ε² (epsilon cuadrado)', value: effects.epsilonSquared(Hc, N), kind: 'eps2' },
    ci: null,
    detail: { k: gs.length, n: N, rankSums, medians: gs.map(medianOf), groupNs: gs.map((g) => g.length), tieCorrected: tieCorr !== 1 },
    assumptions: ['Grupos independientes', 'Variable al menos ordinal', 'No exige normalidad',
      'Si es significativa, se necesitan comparaciones post hoc (p. ej. Dunn) para saber qué grupos difieren'],
  };
}

/* ------------------------------------------- proporciones / 1 muestra --- */

/** z para una proporción (aproximación normal). */
export function zTestProportion(x, N, p0, { tail = 'two-sided', conf = 0.95 } = {}) {
  const p = x / N;
  const seNull = Math.sqrt((p0 * (1 - p0)) / N);
  const z = (p - p0) / seNull;
  const seEst = Math.sqrt((p * (1 - p)) / N);
  const pval = tail === 'two-sided' ? 2 * (1 - normalCdf(Math.abs(z)))
    : tail === 'greater' ? 1 - normalCdf(z) : normalCdf(z);
  return {
    test: 'z-proportion',
    name: 'z para una proporción',
    statistic: z, df: null, p: Math.min(1, pval), tail,
    effect: { name: 'h de Cohen', value: 2 * Math.asin(Math.sqrt(p)) - 2 * Math.asin(Math.sqrt(p0)), kind: 'h' },
    ci: wilsonCi(x, N, conf),
    detail: {
      x, n: N, phat: p, p0, se: seEst, seNull,
      ciWald: waldCi(p, N, conf),
      normalOk: N * p0 >= 5 && N * (1 - p0) >= 5,
    },
    assumptions: ['Observaciones independientes', 'np₀ ≥ 5 y n(1−p₀) ≥ 5 para la aproximación normal',
      'El IC que se informa es el de Wilson (mejor cobertura que el de Wald con n pequeño)'],
  };
}

/** IC de Wald para una proporción (el clásico p̂ ± z·SE). */
export function waldCi(p, N, conf = 0.95) {
  const z = zFromConf(conf);
  const se = Math.sqrt((p * (1 - p)) / N);
  return [Math.max(0, p - z * se), Math.min(1, p + z * se)];
}

/** IC de Wilson: mejor comportamiento con n pequeño o p extrema. */
export function wilsonCi(x, N, conf = 0.95) {
  const z = zFromConf(conf);
  const p = x / N;
  const denom = 1 + (z * z) / N;
  const centre = p + (z * z) / (2 * N);
  const halfWidth = z * Math.sqrt((p * (1 - p)) / N + (z * z) / (4 * N * N));
  return [Math.max(0, (centre - halfWidth) / denom), Math.min(1, (centre + halfWidth) / denom)];
}

function zFromConf(conf) {
  // Tabla para los niveles habituales + cálculo exacto para el resto.
  const known = { 0.90: 1.6448536269514722, 0.95: 1.959963984540054, 0.99: 2.5758293035489004 };
  if (known[conf]) return known[conf];
  // Búsqueda binaria en la normal estándar (evita importar normInv circularmente).
  const target = 1 - (1 - conf) / 2;
  let lo = 0, hi = 8;
  for (let i = 0; i < 100; i++) {
    const mid = (lo + hi) / 2;
    if (normalCdf(mid) < target) lo = mid; else hi = mid;
  }
  return (lo + hi) / 2;
}

/** z para dos proporciones independientes. */
export function zTestTwoProportions(x1, n1, x2, n2, { tail = 'two-sided', conf = 0.95 } = {}) {
  const p1 = x1 / n1, p2 = x2 / n2;
  const pPool = (x1 + x2) / (n1 + n2);
  const seNull = Math.sqrt(pPool * (1 - pPool) * (1 / n1 + 1 / n2));
  const z = (p1 - p2) / seNull;
  const seDiff = Math.sqrt((p1 * (1 - p1)) / n1 + (p2 * (1 - p2)) / n2);
  const zc = zFromConf(conf);
  const pval = tail === 'two-sided' ? 2 * (1 - normalCdf(Math.abs(z)))
    : tail === 'greater' ? 1 - normalCdf(z) : normalCdf(z);
  return {
    test: 'z-two-proportions',
    name: 'z para dos proporciones',
    statistic: z, df: null, p: Math.min(1, pval), tail,
    effect: { name: 'Diferencia de riesgos', value: p1 - p2, kind: 'rd',
      extra: { riskRatio: p1 / p2, oddsRatio: (p1 / (1 - p1)) / (p2 / (1 - p2)), nnt: 1 / Math.abs(p1 - p2) } },
    ci: [(p1 - p2) - zc * seDiff, (p1 - p2) + zc * seDiff],
    detail: { x1, n1, x2, n2, p1, p2, pPool, se: seDiff },
    assumptions: ['Muestras independientes', 'Al menos 5 éxitos y 5 fracasos esperados en cada grupo'],
  };
}

/* ----------------------------------------------- normalidad (aprox.) ---- */

/**
 * Contraste de normalidad de D'Agostino–Pearson K² (asimetría + curtosis).
 * Elegido en lugar de Shapiro–Wilk porque su cálculo es cerrado y auditable
 * en el navegador. Recordatorio didáctico: con n grande, cualquier desviación
 * trivial de la normalidad sale significativa; con n pequeño, casi nada sale.
 * El gráfico (histograma / Q-Q) manda sobre el p-valor.
 */
export function normalityK2(xs) {
  const a = xs.filter(Number.isFinite);
  const N = a.length;
  if (N < 8) {
    return {
      test: 'dagostino-k2', name: "K² de D'Agostino–Pearson",
      statistic: NaN, df: 2, p: NaN, tail: 'greater', effect: null, ci: null,
      detail: { n: N, note: 'Se necesitan al menos 8 observaciones.' },
      assumptions: [],
    };
  }
  const m = mean(a);
  const mom = (k) => a.reduce((s, x) => s + (x - m) ** k, 0) / N;
  const m2 = mom(2), m3 = mom(3), m4 = mom(4);
  const b1 = m3 / m2 ** 1.5;
  const b2 = m4 / m2 ** 2;

  // Transformación de la asimetría (D'Agostino 1970)
  const Y = b1 * Math.sqrt(((N + 1) * (N + 3)) / (6 * (N - 2)));
  const beta2 = (3 * (N * N + 27 * N - 70) * (N + 1) * (N + 3)) / ((N - 2) * (N + 5) * (N + 7) * (N + 9));
  const W2 = -1 + Math.sqrt(2 * (beta2 - 1));
  const delta = 1 / Math.sqrt(Math.log(Math.sqrt(W2)));
  const alpha = Math.sqrt(2 / (W2 - 1));
  const Zb1 = delta * Math.log(Y / alpha + Math.sqrt((Y / alpha) ** 2 + 1));

  // Transformación de la curtosis (Anscombe–Glynn)
  const Eb2 = (3 * (N - 1)) / (N + 1);
  const Vb2 = (24 * N * (N - 2) * (N - 3)) / ((N + 1) ** 2 * (N + 3) * (N + 5));
  const X = (b2 - Eb2) / Math.sqrt(Vb2);
  const sqrtB1b2 = ((6 * (N * N - 5 * N + 2)) / ((N + 7) * (N + 9))) * Math.sqrt((6 * (N + 3) * (N + 5)) / (N * (N - 2) * (N - 3)));
  const A = 6 + (8 / sqrtB1b2) * (2 / sqrtB1b2 + Math.sqrt(1 + 4 / sqrtB1b2 ** 2));
  const Zb2 = (((1 - 2 / (9 * A)) - ((1 - 2 / A) / (1 + X * Math.sqrt(2 / (A - 4)))) ** (1 / 3))
    / Math.sqrt(2 / (9 * A)));

  const K2 = Zb1 ** 2 + Zb2 ** 2;
  return {
    test: 'dagostino-k2',
    name: "K² de D'Agostino–Pearson (normalidad)",
    statistic: K2, df: 2, p: chi2P(K2, 2), tail: 'greater',
    effect: null, ci: null,
    detail: { n: N, skewness: b1, kurtosisExcess: b2 - 3, zSkew: Zb1, zKurt: Zb2 },
    assumptions: ['H0: los datos provienen de una distribución normal',
      'Un p pequeño sugiere no normalidad; un p grande NO demuestra normalidad',
      'Con n grande detecta desviaciones irrelevantes: acompáñalo siempre de un gráfico'],
  };
}

/* ----------------------------------------------------- interpretación --- */

/**
 * Redacción correcta de un p-valor. Se usa en el feedback de la app para que
 * el alumno lea siempre una interpretación defendible.
 */
export function interpretP(p, alpha = 0.05, { h1 = 'existe una diferencia', h0 = 'no hay diferencia' } = {}) {
  if (!Number.isFinite(p)) return { decision: 'na', text: 'No se puede calcular el p-valor.' };
  const sig = p < alpha;
  return {
    decision: sig ? 'reject' : 'fail-to-reject',
    text: sig
      ? `Con α = ${alpha}, se rechaza H0. Los datos son poco compatibles con la hipótesis de que ${h0}: `
        + `si H0 fuera cierta, obtener un resultado tan o más extremo tendría probabilidad ${p < 0.001 ? '< 0,001' : p.toFixed(3).replace('.', ',')}. `
        + `Es compatible con que ${h1}. Esto no dice cuán grande es el efecto: mira el tamaño del efecto y el intervalo de confianza.`
      : `Con α = ${alpha}, no se rechaza H0. Los datos son compatibles con la hipótesis de que ${h0}, `
        + 'pero esto NO demuestra que sea cierta: la ausencia de significación puede deberse a falta de potencia. '
        + 'Informa del intervalo de confianza: si es ancho, el estudio simplemente no es concluyente.',
    warnings: [
      'El p-valor NO es la probabilidad de que H0 sea cierta.',
      'El p-valor NO mide el tamaño del efecto.',
      sig ? 'Significativo ≠ importante clínicamente.' : 'No significativo ≠ equivalencia demostrada.',
    ],
  };
}

export { effects };
