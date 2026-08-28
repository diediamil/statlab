/**
 * Pruebas del núcleo estadístico.
 * Los valores de referencia se han obtenido con R y se citan en cada prueba,
 * para que cualquiera pueda reproducirlos.
 */

import { describe, it, assert } from './runner.js';
import * as d from '../js/stats/descriptive.js';
import * as dist from '../js/stats/distributions.js';
import * as tests from '../js/stats/tests.js';
import * as eff from '../js/stats/effects.js';
import * as reg from '../js/stats/regression.js';
import * as diag from '../js/stats/diagnostics.js';
import * as samp from '../js/stats/sampling.js';
import { RNG } from '../js/rng.js';

const GLU = [92, 98, 105, 88, 110, 95];               // ejemplo del Mundo 3
const OSW = [18, 22, 24, 28, 30, 32, 35, 38, 40, 44, 48, 82];

describe('Descriptiva', () => {
  it('media', () => assert.close(d.mean(GLU), 98, 1e-9));
  it('mediana con n par', () => assert.close(d.median(GLU), 96.5, 1e-9));
  it('mediana con n impar', () => assert.close(d.median([3, 1, 2]), 2, 1e-9));
  it('mediana ordena antes de calcular', () => assert.close(d.median([10, 1, 5, 2]), 3.5, 1e-9));

  it('desviación típica muestral (n−1) — R: sd(x) = 8.222', () => {
    assert.close(d.sd(GLU), 8.221922, 1e-5);
  });
  it('varianza muestral — R: var(x) = 67.6', () => assert.close(d.variance(GLU), 67.6, 1e-9));
  it('desviación típica poblacional (n) es menor que la muestral', () => {
    assert.ok(d.sdPop(GLU) < d.sd(GLU));
  });

  it('error estándar = s/√n y es menor que s', () => {
    assert.close(d.se(GLU), 8.221922 / Math.sqrt(6), 1e-5);
    assert.ok(d.se(GLU) < d.sd(GLU));
  });

  it('cuartiles tipo 7 (R quantile por defecto)', () => {
    // R: quantile(c(18,22,24,28,30,32,35,38,40,44,48,82)) → 25%=27, 75%=41
    assert.close(d.q1(OSW), 27, 1e-9);
    assert.close(d.q3(OSW), 41, 1e-9);
  });

  it('percentil 50 coincide con la mediana', () => {
    assert.close(d.percentile(OSW, 50), d.median(OSW), 1e-9);
  });

  it('criterio de Tukey detecta el 82 como atípico', () => {
    const five = d.fiveNumber(OSW);
    assert.deepEqual(five.outliers, [82]);
    assert.close(five.hiFence, five.q3 + 1.5 * five.iqr, 1e-9);
  });

  it('moda: puede ser múltiple', () => {
    assert.deepEqual(d.mode([4, 6, 6, 7, 8, 8, 9, 10, 11, 12]), [6, 8]);
  });
  it('moda: sin repeticiones no hay moda', () => {
    assert.deepEqual(d.mode([1, 2, 3]), []);
  });

  it('rangos con empates promediados', () => {
    assert.deepEqual(d.ranks([10, 20, 20, 30]), [1, 2.5, 2.5, 4]);
  });

  it('histograma: todos los valores caen en alguna clase', () => {
    const bins = d.histogramBins(OSW, 4);
    assert.equal(bins.reduce((s, b) => s + b.count, 0), OSW.length);
  });

  it('tabla de frecuencias acumula correctamente', () => {
    const ft = d.frequencyTable(['I', 'I', 'II', 'III'], ['I', 'II', 'III']);
    assert.equal(ft[1].cum, 3);
    assert.close(ft[1].cumRel, 0.75, 1e-9);
  });
});

describe('Distribuciones', () => {
  it('normal estándar: P(Z < 1,96) ≈ 0,975', () => {
    assert.close(dist.normalCdf(1.959963985), 0.975, 1e-6);
  });
  it('normal: la regla 68–95–99,7 se cumple', () => {
    const r = dist.empiricalRule(0, 1);
    assert.close(r[0].p, 0.6826895, 1e-5);
    assert.close(r[1].p, 0.9544997, 1e-5);
    assert.close(r[2].p, 0.9973002, 1e-5);
  });
  it('z crítico bilateral al 95 % = 1,96', () => assert.close(dist.zCrit(0.95), 1.959963985, 1e-6));
  it('puntuación z con signo correcto', () => assert.close(dist.zScore(405, 480, 60), -1.25, 1e-9));

  it('t de Student: t crítico con 63 gl ≈ 1,998 — R: qt(0.975, 63)', () => {
    assert.close(dist.tCrit(0.95, 63), 1.998341, 1e-4);
  });
  it('t: p bilateral de t = 2,5 con 20 gl — scipy: 2*t.sf(2.5,20) = 0.0212335', () => {
    assert.close(dist.tTestP(2.5, 20), 0.021233545439132, 1e-9);
  });
  it('t con muchos gl converge a la normal', () => {
    assert.close(dist.tCrit(0.95, 100000), 1.959963985, 1e-3);
  });

  it('chi²: p de 3,84 con 1 gl ≈ 0,05 — R: pchisq(3.841, 1, lower=FALSE)', () => {
    assert.close(dist.chi2P(3.8414588, 1), 0.05, 1e-5);
  });
  it('F: p de F = 4,26 con (2, 27) gl — R: pf(4.26, 2, 27, lower=FALSE) = 0.0245', () => {
    assert.close(dist.fP(4.26, 2, 27), 0.024568, 1e-4);
  });

  it('binomial: P(X = 3) con n = 10, p = 0,3 — R: dbinom(3,10,0.3) = 0.2668', () => {
    assert.close(dist.binomPmf(3, 10, 0.3), 0.2668279, 1e-6);
  });
  it('binomial: la pmf suma 1', () => {
    let s = 0;
    for (let k = 0; k <= 10; k++) s += dist.binomPmf(k, 10, 0.37);
    assert.close(s, 1, 1e-10);
  });
  it('criterio de aproximación normal a la binomial', () => {
    assert.ok(dist.binomNormalOk(100, 0.3));
    assert.ok(!dist.binomNormalOk(20, 0.02));
  });
});

describe('Contrastes', () => {
  const A = [7, 6, 5, 6, 7, 8, 5, 6, 7, 6, 5, 7, 8, 6, 7, 5, 6, 7, 6, 8];
  const B = [4, 3, 5, 4, 2, 4, 3, 5, 4, 3, 4, 5, 3, 4, 2, 4, 3, 5, 4, 6];

  it('t independiente (Welch) detecta la diferencia', () => {
    const r = tests.tTestIndependent(A, B);
    assert.ok(r.p < 0.001, 'debería ser muy significativo');
    assert.ok(r.statistic > 0, 'A tiene media mayor');
    assert.ok(r.ci[0] > 0, 'el IC no incluye el cero');
  });

  it('t independiente: Welch y agrupada difieren en los grados de libertad', () => {
    const w = tests.tTestIndependent(A, B, { equalVar: false });
    const p = tests.tTestIndependent(A, B, { equalVar: true });
    assert.equal(p.df, A.length + B.length - 2);
    assert.ok(w.df !== p.df || Math.abs(w.df - p.df) < 1e-9);
  });

  it('t pareada usa las diferencias', () => {
    const pre = [10, 12, 14, 11, 13];
    const post = [8, 11, 12, 10, 10];
    const r = tests.tTestPaired(pre, post);
    assert.close(r.detail.meanDiff, -1.8, 1e-9);   // media de (post − pre) = (−2−1−2−1−3)/5
    assert.equal(r.df, 4);
  });

  it('t de una muestra frente a un valor de referencia', () => {
    const r = tests.tTestOneSample(GLU, 100);
    assert.close(r.statistic, (98 - 100) / (d.sd(GLU) / Math.sqrt(6)), 1e-9);
    assert.ok(r.p > 0.05);
  });

  it('ANOVA: SS entre + SS dentro = SS total', () => {
    const r = tests.anovaOneWay([[5, 6, 7], [8, 9, 10], [11, 12, 13]]);
    assert.close(r.detail.ssBetween + r.detail.ssWithin, r.detail.ssTotal, 1e-9);
    assert.deepEqual(r.df, [2, 6]);
    assert.ok(r.p < 0.01);
  });

  it('ANOVA de dos grupos equivale a la t agrupada', () => {
    const a = tests.anovaOneWay([A, B]);
    const tt = tests.tTestIndependent(A, B, { equalVar: true });
    assert.close(a.statistic, tt.statistic ** 2, 1e-6, 'F = t² con dos grupos');
  });

  it('chi-cuadrado de independencia — R: chisq.test(matrix(c(20,30,30,20),2)) X²=4', () => {
    const r = tests.chiSquareIndependence([[20, 30], [30, 20]]);
    assert.close(r.statistic, 4, 1e-9);
    assert.equal(r.df, 1);
    assert.close(r.p, 0.0455003, 1e-5);
  });

  it('chi-cuadrado avisa si hay esperadas < 5', () => {
    const r = tests.chiSquareIndependence([[1, 9], [8, 2]]);
    assert.ok(r.detail.minExpected < 5);
    assert.ok(r.assumptions.some((s) => /Fisher/.test(s)));
  });

  it('Fisher exacto en una tabla pequeña — R: fisher.test(matrix(c(2,7,8,3),2)) p=0.070', () => {
    const r = tests.fisherExact2x2([[2, 8], [7, 3]]);
    assert.between(r.p, 0.05, 0.09);
  });

  it('Mann–Whitney detecta el desplazamiento', () => {
    const r = tests.mannWhitneyU(A, B);
    assert.ok(r.p < 0.001);
    assert.ok(r.detail.medians[0] > r.detail.medians[1]);
  });

  it('Wilcoxon con signo descarta los empates exactos', () => {
    const r = tests.wilcoxonSignedRank([5, 5, 6, 7], [5, 4, 5, 5]);
    assert.equal(r.detail.nZeroDropped, 1);
  });

  it('Kruskal–Wallis con tres grupos', () => {
    const r = tests.kruskalWallis([[1, 2, 3], [4, 5, 6], [7, 8, 9]]);
    assert.equal(r.df, 2);
    assert.ok(r.p < 0.05);
  });

  it('interpretación del p-valor nunca dice «probabilidad de H0»', () => {
    const txt = tests.interpretP(0.03).text + tests.interpretP(0.3).text;
    assert.ok(!/probabilidad de que H0 sea cierta/i.test(txt));
    assert.ok(/no demuestra/i.test(tests.interpretP(0.3).text));
  });

  it('IC de Wilson está dentro de [0,1] con proporciones extremas', () => {
    const ci = tests.wilsonCi(0, 20);
    assert.ok(ci[0] >= 0 && ci[1] <= 1);
    assert.ok(ci[1] > 0, 'con 0 éxitos el límite superior no puede ser 0');
  });

  it('normalidad K²: no rechaza datos normales', () => {
    const rng = new RNG(42);
    const xs = Array.from({ length: 300 }, () => rng.normal(0, 1));
    const r = tests.normalityK2(xs);
    assert.ok(r.p > 0.01, `p = ${r.p}`);
  });

  it('normalidad K²: rechaza datos muy asimétricos', () => {
    const rng = new RNG(7);
    const xs = Array.from({ length: 300 }, () => rng.exponential(1));
    const r = tests.normalityK2(xs);
    assert.ok(r.p < 0.001, `p = ${r.p}`);
  });
});

describe('Tamaños del efecto', () => {
  it('d de Cohen con SD agrupada', () => {
    const a = [10, 12, 14], b = [7, 9, 11];
    assert.close(eff.cohenD(a, b), 3 / 2, 1e-9);
  });
  it('g de Hedges corrige a la baja con n pequeño', () => {
    const a = [10, 12, 14], b = [7, 9, 11];
    assert.ok(Math.abs(eff.hedgesG(a, b)) < Math.abs(eff.cohenD(a, b)));
  });
  it('eta cuadrado = SS entre / SS total', () => {
    assert.close(eff.etaSquared(420, 2100), 0.2, 1e-9);
  });
  it('epsilon cuadrado = H/(n−1)', () => {
    assert.close(eff.epsilonSquared(12, 25), 0.5, 1e-9);
  });
  it('V de Cramér en 2×2 coincide con phi', () => {
    assert.close(eff.cramersV(4, 100, 2, 2), eff.phiCoefficient(4, 100), 1e-9);
  });
  it('las magnitudes llevan siempre su advertencia', () => {
    const m = eff.magnitude(0.9, 'd');
    assert.equal(m.label, 'grande');
    assert.ok(/convenciones orientativas/i.test(m.caveat));
  });
  it('umbrales distintos según la escala', () => {
    assert.equal(eff.magnitude(0.2, 'd').label, 'pequeño');
    assert.equal(eff.magnitude(0.2, 'r').label, 'pequeño');
    assert.equal(eff.magnitude(0.2, 'eta2').label, 'grande');
  });
  it('n necesario crece al reducir el efecto', () => {
    assert.ok(eff.nForPowerTwoSampleT(0.2) > eff.nForPowerTwoSampleT(0.8));
  });
  it('potencia crece con n', () => {
    assert.ok(eff.powerTwoSampleT(0.5, 100) > eff.powerTwoSampleT(0.5, 20));
  });
  it('riesgos: NNT es el inverso de la diferencia de riesgos', () => {
    const r = eff.riskMeasures([[20, 80], [40, 60]]);
    assert.close(r.riskDifference, 0.2 - 0.4, 1e-9);
    assert.close(r.nnt, 5, 1e-9);
  });
});

describe('Correlación y regresión', () => {
  const x = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
  const y = [2.1, 3.9, 6.2, 7.8, 10.1, 12.2, 13.8, 16.1, 18.0, 20.2];

  it('Pearson próximo a 1 en una relación casi perfecta', () => {
    assert.between(reg.pearsonR(x, y), 0.999, 1);
  });
  it('Pearson es simétrico', () => {
    assert.close(reg.pearsonR(x, y), reg.pearsonR(y, x), 1e-12);
  });
  it('Pearson no detecta una relación en U', () => {
    const xs = [-3, -2, -1, 0, 1, 2, 3];
    const ys = xs.map((v) => v * v);
    assert.close(reg.pearsonR(xs, ys), 0, 1e-9);
  });
  it('Spearman = 1 en una relación monótona no lineal', () => {
    const xs = [1, 2, 3, 4, 5];
    const ys = [1, 4, 9, 16, 25];
    assert.close(reg.spearmanRho(xs, ys), 1, 1e-9);
  });
  it('IC de r por z de Fisher contiene la estimación', () => {
    const r = reg.pearsonTest(x, y);
    assert.ok(r.ci[0] < r.effect.value && r.effect.value < r.ci[1]);
  });

  it('regresión: pendiente e intercepto de una recta exacta', () => {
    const m = reg.linearRegression([1, 2, 3, 4], [3, 5, 7, 9]);   // y = 1 + 2x
    assert.close(m.slope, 2, 1e-9);
    assert.close(m.intercept, 1, 1e-9);
    assert.close(m.r2, 1, 1e-9);
    assert.close(m.ssRes, 0, 1e-9);
  });
  it('regresión: R² = r² en el modelo simple', () => {
    const m = reg.linearRegression(x, y);
    assert.close(m.r2, m.r ** 2, 1e-9);
  });
  it('regresión: SS total = SS regresión + SS residual', () => {
    const m = reg.linearRegression(x, y);
    assert.close(m.ssReg + m.ssRes, m.ssTotal, 1e-8);
  });
  it('regresión: la recta de MCO minimiza la SSE', () => {
    const m = reg.linearRegression(x, y);
    const best = reg.sseFor(x, y, m.intercept, m.slope);
    assert.ok(best <= reg.sseFor(x, y, m.intercept + 0.5, m.slope));
    assert.ok(best <= reg.sseFor(x, y, m.intercept, m.slope + 0.1));
    assert.ok(best <= reg.sseFor(x, y, m.intercept - 0.5, m.slope - 0.1));
  });
  it('regresión: NO es simétrica (y~x ≠ x~y)', () => {
    const a = reg.linearRegression(x, y);
    const b = reg.linearRegression(y, x);
    assert.ok(Math.abs(a.slope - b.slope) > 0.1);
    assert.close(a.r2, b.r2, 1e-9, 'pero R² sí coincide');
  });
  it('regresión: detecta la extrapolación', () => {
    const m = reg.linearRegression(x, y);
    assert.ok(m.isExtrapolation(50));
    assert.ok(!m.isExtrapolation(5));
  });
  it('regresión: el intervalo de predicción es más ancho que el IC de la media', () => {
    const m = reg.linearRegression(x, y);
    const ci = m.ciMean(5), pi = m.piNew(5);
    assert.ok((pi[1] - pi[0]) > (ci[1] - ci[0]));
  });
  it('regresión: un punto influyente cambia mucho la pendiente', () => {
    const base = reg.linearRegression(x, y);
    const withOutlier = reg.linearRegression([...x, 11], [...y, 0]);
    assert.ok(Math.abs(withOutlier.slope - base.slope) > 0.3);
    assert.ok(reg.influentialPoints(withOutlier).length > 0);
  });
});

describe('Pruebas diagnósticas', () => {
  const table = { tp: 88, fp: 28, fn: 12, tn: 372 };

  it('sensibilidad y especificidad se calculan por columnas', () => {
    const m = diag.diagnosticMetrics(table);
    assert.close(m.sensitivity, 88 / 100, 1e-9);
    assert.close(m.specificity, 372 / 400, 1e-9);
  });
  it('VPP y VPN se calculan por filas', () => {
    const m = diag.diagnosticMetrics(table);
    assert.close(m.ppv, 88 / 116, 1e-9);
    assert.close(m.npv, 372 / 384, 1e-9);
  });
  it('índice de Youden = S + E − 1', () => {
    const m = diag.diagnosticMetrics(table);
    assert.close(m.youden, m.sensitivity + m.specificity - 1, 1e-9);
  });
  it('el VPP se hunde con prevalencia baja aunque la prueba sea buena', () => {
    const low = diag.predictiveValues({ sensitivity: 0.9, specificity: 0.95, prevalence: 0.01 });
    const high = diag.predictiveValues({ sensitivity: 0.9, specificity: 0.95, prevalence: 0.35 });
    assert.between(low.ppv, 0.14, 0.17);
    assert.ok(high.ppv > 0.85);
  });
  it('sensibilidad y especificidad NO dependen de la prevalencia', () => {
    const a = diag.diagnosticMetrics(diag.tableFromRates({ sensitivity: 0.9, specificity: 0.95, prevalence: 0.01, population: 100000 }));
    const b = diag.diagnosticMetrics(diag.tableFromRates({ sensitivity: 0.9, specificity: 0.95, prevalence: 0.4, population: 100000 }));
    assert.close(a.sensitivity, b.sensitivity, 1e-6);
    assert.close(a.specificity, b.specificity, 1e-6);
    assert.ok(a.ppv < b.ppv, 'el VPP sí cambia');
  });
  it('probabilidad post-prueba con razón de verosimilitud', () => {
    const post = diag.postTestProbability(0.2, 5);
    assert.close(post, (0.25 * 5) / (1 + 0.25 * 5), 1e-9);
  });
  it('ROC: AUC ≈ 1 con separación perfecta', () => {
    const scores = [1, 2, 3, 10, 11, 12];
    const labels = [false, false, false, true, true, true];
    const roc = diag.rocCurve(scores, labels);
    assert.close(roc.auc, 1, 1e-9);
  });
  it('ROC: AUC ≈ 0,5 si la prueba no discrimina', () => {
    const scores = [1, 2, 3, 4, 5, 6];
    const labels = [true, false, true, false, true, false];
    const roc = diag.rocCurve(scores, labels);
    assert.between(roc.auc, 0.3, 0.7);
  });
  it('ROC: el punto de Youden maximiza S + E − 1', () => {
    const rng = new RNG(3);
    const scores = [], labels = [];
    for (let i = 0; i < 100; i++) { scores.push(rng.normal(50, 10)); labels.push(false); }
    for (let i = 0; i < 60; i++) { scores.push(rng.normal(65, 10)); labels.push(true); }
    const roc = diag.rocCurve(scores, labels);
    assert.ok(roc.bestCutoff.youden > 0.2);
    assert.between(roc.auc, 0.7, 0.95);
  });
});

describe('Muestreo y estimación', () => {
  it('SE = σ/√n y se divide por 2 al cuadruplicar n', () => {
    assert.close(samp.seMean(20, 25), 4, 1e-9);
    assert.close(samp.seMean(20, 100), 2, 1e-9);
  });

  it('TCL: la distribución de las medias se estrecha con n', () => {
    const rng = new RNG(11);
    const pop = samp.makePopulation('skewed', 4000, new RNG(5));
    const small = samp.samplingDistribution(pop, 5, 800, rng);
    const large = samp.samplingDistribution(pop, 50, 800, new RNG(11));
    assert.ok(large.sd < small.sd, 'con n mayor, menos dispersión de las medias');
  });

  it('TCL: la media de las medias se aproxima a la media poblacional', () => {
    const pop = samp.makePopulation('skewed', 4000, new RNG(5));
    const dsim = samp.samplingDistribution(pop, 30, 2000, new RNG(9));
    assert.close(dsim.mean, dsim.populationMean, Math.max(0.5, dsim.theoreticalSe * 3));
  });

  it('TCL: la SD observada de las medias se aproxima a σ/√n', () => {
    const pop = samp.makePopulation('normal', 5000, new RNG(2));
    const dsim = samp.samplingDistribution(pop, 25, 3000, new RNG(4));
    assert.between(dsim.sd / dsim.theoreticalSe, 0.9, 1.1);
  });

  it('IC de la media usa la t cuando σ es desconocida', () => {
    const ci = samp.ciMean(GLU, 0.95);
    assert.equal(ci.dist, 't');
    assert.equal(ci.df, 5);
    assert.ok(ci.lo < ci.mean && ci.mean < ci.hi);
  });

  it('IC con 99 % es más ancho que con 95 %', () => {
    const a = samp.ciMean(GLU, 0.95), b = samp.ciMean(GLU, 0.99);
    assert.ok((b.hi - b.lo) > (a.hi - a.lo));
  });

  it('cobertura simulada del IC 95 % ronda el 95 %', () => {
    const pop = samp.makePopulation('normal', 5000, new RNG(6));
    const sim = samp.coverageSimulation(pop, 30, 600, 0.95, new RNG(8));
    assert.between(sim.coverage, 0.91, 0.99, `cobertura = ${sim.coverage}`);
  });

  it('IC de Wilson es más estrecho y mejor comportado que Wald con p extrema', () => {
    const wilson = samp.ciProportion(1, 20, 0.95, { method: 'wilson' });
    const wald = samp.ciProportion(1, 20, 0.95, { method: 'wald' });
    assert.ok(wilson.lo >= 0 && wilson.hi <= 1);
    assert.ok(wald.lo >= 0);
    assert.ok(wilson.hi > wilson.p, 'el intervalo contiene la estimación');
  });

  it('n necesario crece al reducir el margen de error', () => {
    assert.ok(samp.nForProportion(0.02) > samp.nForProportion(0.05));
  });
});

describe('RNG semillado', () => {
  it('la misma semilla produce la misma secuencia', () => {
    const a = new RNG(123), b = new RNG(123);
    for (let i = 0; i < 20; i++) assert.close(a.next(), b.next(), 0);
  });
  it('semillas distintas producen secuencias distintas', () => {
    const a = new RNG(1), b = new RNG(2);
    assert.ok(a.next() !== b.next());
  });
  it('uniform respeta los límites', () => {
    const r = new RNG(9);
    for (let i = 0; i < 200; i++) assert.between(r.uniform(3, 7), 3, 7);
  });
  it('correlated genera la correlación pedida (aprox.)', () => {
    const r = new RNG(21);
    const { xs, ys } = r.correlated(4000, 0.7);
    assert.between(reg.pearsonR(xs, ys), 0.65, 0.75);
  });
});
