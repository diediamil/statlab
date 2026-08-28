/**
 * STATLAB — pruebas diagnósticas (Mundo 13)
 * ---------------------------------------------------------------------------
 * Tabla de referencia (fila = resultado de la prueba, columna = enfermedad real):
 *
 *                 Enfermo        Sano
 *   Positivo        VP            FP
 *   Negativo        FN            VN
 *
 * El error conceptual más frecuente y más peligroso en clínica es confundir
 *   sensibilidad = P(prueba + | enfermo)      ← propiedad de la PRUEBA
 * con
 *   VPP = P(enfermo | prueba +)               ← depende de la PREVALENCIA
 *
 * Con una prueba excelente (S = 99 %, E = 99 %) y prevalencia 0,1 %, el VPP
 * es ≈ 9 %: nueve de cada diez positivos son falsos. Toda la app insiste en esto.
 */

/** Métricas completas a partir de la tabla 2×2. */
export function diagnosticMetrics({ tp, fp, fn, tn }) {
  const diseased = tp + fn;
  const healthy = fp + tn;
  const positives = tp + fp;
  const negatives = fn + tn;
  const total = diseased + healthy;

  const sensitivity = diseased ? tp / diseased : NaN;
  const specificity = healthy ? tn / healthy : NaN;
  const ppv = positives ? tp / positives : NaN;
  const npv = negatives ? tn / negatives : NaN;
  const prevalence = total ? diseased / total : NaN;

  return {
    tp, fp, fn, tn, total, diseased, healthy, positives, negatives,
    prevalence,
    sensitivity,
    specificity,
    ppv,
    npv,
    /** Tasa de falsos negativos = 1 − S. */
    fnr: 1 - sensitivity,
    /** Tasa de falsos positivos = 1 − E. */
    fpr: 1 - specificity,
    accuracy: total ? (tp + tn) / total : NaN,
    /** Razones de verosimilitud: independientes de la prevalencia. */
    lrPositive: specificity < 1 ? sensitivity / (1 - specificity) : Infinity,
    lrNegative: specificity > 0 ? (1 - sensitivity) / specificity : Infinity,
    /** Índice de Youden J = S + E − 1 (0 = inútil, 1 = perfecta). */
    youden: sensitivity + specificity - 1,
    /** Odds ratio diagnóstico. */
    dor: (fp && fn) ? (tp * tn) / (fp * fn) : Infinity,
    /** Número de pruebas por diagnóstico adicional correcto. */
    f1: (2 * ppv * sensitivity) / (ppv + sensitivity),
  };
}

/**
 * Reconstruye la tabla desde sensibilidad, especificidad y prevalencia con una
 * población hipotética. Es el motor de la "Máquina de Bayes": ver la población
 * en unidades de personas hace evidente por qué el VPP cae con prevalencia baja.
 */
export function tableFromRates({ sensitivity, specificity, prevalence, population = 1000 }) {
  const diseased = population * prevalence;
  const healthy = population - diseased;
  const tp = diseased * sensitivity;
  const fn = diseased - tp;
  const tn = healthy * specificity;
  const fp = healthy - tn;
  return { tp, fp, fn, tn, population };
}

/** VPP y VPN por el teorema de Bayes (sin construir la tabla). */
export function predictiveValues({ sensitivity, specificity, prevalence }) {
  const pPos = sensitivity * prevalence + (1 - specificity) * (1 - prevalence);
  const pNeg = 1 - pPos;
  return {
    ppv: pPos ? (sensitivity * prevalence) / pPos : NaN,
    npv: pNeg ? (specificity * (1 - prevalence)) / pNeg : NaN,
    pPositive: pPos,
  };
}

/** Probabilidad post-prueba usando odds y razón de verosimilitud. */
export function postTestProbability(preTestProb, likelihoodRatio) {
  const preOdds = preTestProb / (1 - preTestProb);
  const postOdds = preOdds * likelihoodRatio;
  return postOdds / (1 + postOdds);
}

/* ---------------------------------------------------------------- ROC ---- */

/**
 * Curva ROC empírica a partir de valores continuos y el estado real.
 * @param {number[]} scores  valor de la prueba
 * @param {boolean[]} labels true = enfermo
 * @param {boolean} higherIsPositive true si valores altos indican enfermedad
 */
export function rocCurve(scores, labels, { higherIsPositive = true } = {}) {
  const pairs = scores.map((s, i) => ({ s: higherIsPositive ? s : -s, y: !!labels[i] }))
    .filter((p) => Number.isFinite(p.s))
    .sort((a, b) => b.s - a.s);
  const P = pairs.filter((p) => p.y).length;
  const N = pairs.length - P;
  const points = [{ fpr: 0, tpr: 0, threshold: Infinity, tp: 0, fp: 0 }];
  let tp = 0, fp = 0, prev = null;
  for (const p of pairs) {
    if (prev !== null && p.s !== prev) {
      points.push({ fpr: N ? fp / N : 0, tpr: P ? tp / P : 0, threshold: higherIsPositive ? prev : -prev, tp, fp });
    }
    if (p.y) tp++; else fp++;
    prev = p.s;
  }
  points.push({ fpr: N ? fp / N : 0, tpr: P ? tp / P : 0, threshold: higherIsPositive ? prev : -prev, tp, fp });
  points.push({ fpr: 1, tpr: 1, threshold: -Infinity, tp: P, fp: N });

  // AUC por regla del trapecio (equivale al estadístico de Mann–Whitney)
  let auc = 0;
  for (let i = 1; i < points.length; i++) {
    auc += ((points[i].fpr - points[i - 1].fpr) * (points[i].tpr + points[i - 1].tpr)) / 2;
  }

  // Punto de corte óptimo por índice de Youden
  let best = points[0], bestJ = -Infinity;
  for (const pt of points) {
    const J = pt.tpr - pt.fpr;
    if (Number.isFinite(pt.threshold) && J > bestJ) { bestJ = J; best = pt; }
  }

  return {
    points, auc, nPositive: P, nNegative: N,
    bestCutoff: {
      threshold: best.threshold,
      sensitivity: best.tpr,
      specificity: 1 - best.fpr,
      youden: bestJ,
    },
    interpretation: aucLabel(auc),
  };
}

export function aucLabel(auc) {
  if (!Number.isFinite(auc)) return { label: '—', text: '' };
  if (auc < 0.6) return { label: 'sin utilidad práctica', text: 'AUC próxima a 0,5 significa que la prueba no discrimina mejor que el azar.' };
  if (auc < 0.7) return { label: 'discriminación pobre', text: 'La prueba discrimina poco; difícilmente útil como cribado.' };
  if (auc < 0.8) return { label: 'discriminación aceptable', text: 'Discriminación moderada; puede servir combinada con otra información.' };
  if (auc < 0.9) return { label: 'discriminación buena', text: 'Buena capacidad de discriminación.' };
  return { label: 'discriminación excelente', text: 'Muy buena discriminación. Comprueba que no haya sobreajuste ni sesgo de selección.' };
}

/**
 * Interpretación de la AUC: es la probabilidad de que, tomando al azar un
 * enfermo y un sano, la prueba dé un valor más alto al enfermo.
 */
export const aucMeaning = 'La AUC es la probabilidad de que, eligiendo al azar una persona enferma y '
  + 'una sana, la prueba asigne un valor más alto a la enferma. AUC = 0,5 equivale a lanzar una moneda.';

/* -------------------------------------------------- cribado vs confirm -- */

/**
 * Qué priorizar según el uso clínico. Se usa en el feedback del Mundo 13.
 */
export const screeningGuidance = {
  screening: {
    priority: 'sensibilidad',
    why: 'En cribado interesa no dejar escapar casos: un falso negativo significa una enfermedad no detectada. '
      + 'Se acepta un exceso de falsos positivos porque se confirmarán después.',
    mnemonic: 'SnNOut: con una prueba muy Sensible, un resultado Negativo descarta (rule OUT).',
  },
  confirmation: {
    priority: 'especificidad',
    why: 'En confirmación interesa no etiquetar como enfermo a quien está sano, porque el diagnóstico '
      + 'desencadena tratamiento, coste y ansiedad.',
    mnemonic: 'SpPIn: con una prueba muy Específica, un resultado Positivo confirma (rule IN).',
  },
};
