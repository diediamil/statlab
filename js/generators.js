/**
 * STATLAB — generación procedural de ejercicios y datos
 * ---------------------------------------------------------------------------
 * Objetivo: que los ejercicios NO sean memorizables. Cada vez que un alumno
 * abre una actividad con `generator`, los números, los contextos sanitarios y
 * las opciones cambian, pero el concepto evaluado y la dificultad se mantienen.
 *
 * Todo se construye con un RNG SEMILLADO (js/rng.js), así que:
 *   · el mismo alumno ve el mismo enunciado al revisar su intento;
 *   · toda la clase recibe el mismo reto (semilla = id del reto);
 *   · los tests son deterministas.
 *
 * Cada generador recibe (rng, activity) y devuelve un objeto con los campos
 * que sustituyen a los de la actividad: prompt, stem, options, answer, etc.
 */

import { RNG, rngFor } from './rng.js';
import { mean, sd, median, se as seOf, variance } from './stats/descriptive.js';
import { fmt, round } from './utils.js';

/* --------------------------------------------------------- vocabularios -- */

const CONTEXTS = [
  { unit: 'mg/dL', what: 'glucemia en ayunas', who: 'pacientes con diabetes tipo 2', lo: 80, hi: 190 },
  { unit: 'mmHg', what: 'presión arterial sistólica', who: 'personas con hipertensión', lo: 110, hi: 180 },
  { unit: 'puntos', what: 'puntuación de dolor (0–10)', who: 'pacientes con lumbalgia', lo: 0, hi: 10 },
  { unit: 'metros', what: 'distancia en el test de 6 minutos', who: 'personas mayores en rehabilitación', lo: 200, hi: 600 },
  { unit: 'g/dL', what: 'concentración de hemoglobina', who: 'donantes de sangre', lo: 9, hi: 17 },
  { unit: 'kg/m²', what: 'índice de masa corporal', who: 'estudiantes de Ciencias de la Salud', lo: 17, hi: 38 },
  { unit: 'segundos', what: 'tiempo del test de levantarse y andar', who: 'pacientes con riesgo de caídas', lo: 6, hi: 30 },
  { unit: 'puntos', what: 'puntuación GAD-7 de ansiedad (0–21)', who: 'estudiantado de primer curso', lo: 0, hi: 21 },
];

const VARIABLE_BANK = [
  { text: 'Grupo sanguíneo (A, B, AB, 0)', type: 'nominal' },
  { text: 'Servicio de ingreso', type: 'nominal' },
  { text: 'Tipo de fractura (abierta / cerrada)', type: 'nominal' },
  { text: 'Presencia de fiebre (sí / no)', type: 'nominal' },
  { text: 'Lateralidad de la lesión (derecha / izquierda / bilateral)', type: 'nominal' },
  { text: 'Estadio tumoral (I, II, III, IV)', type: 'ordinal' },
  { text: 'Grado de disnea (leve / moderada / grave)', type: 'ordinal' },
  { text: 'Nivel de estudios (primarios / secundarios / universitarios)', type: 'ordinal' },
  { text: 'Grado de satisfacción (nada / poco / bastante / mucho)', type: 'ordinal' },
  { text: 'Clasificación ASA (I a V)', type: 'ordinal' },
  { text: 'Número de caídas en un año', type: 'discreta' },
  { text: 'Número de sesiones de fisioterapia completadas', type: 'discreta' },
  { text: 'Número de fármacos prescritos', type: 'discreta' },
  { text: 'Número de ingresos hospitalarios previos', type: 'discreta' },
  { text: 'Recuento de linfocitos por campo', type: 'discreta' },
  { text: 'Peso corporal en kilogramos', type: 'continua' },
  { text: 'Temperatura corporal en grados Celsius', type: 'continua' },
  { text: 'Tiempo de reacción en milisegundos', type: 'continua' },
  { text: 'Concentración plasmática de creatinina', type: 'continua' },
  { text: 'Distancia caminada en 6 minutos', type: 'continua' },
  { text: 'Saturación de oxígeno en porcentaje', type: 'continua' },
];

const TYPE_LABELS = {
  nominal: 'Cualitativa nominal',
  ordinal: 'Cualitativa ordinal',
  discreta: 'Cuantitativa discreta',
  continua: 'Cuantitativa continua',
};

const STUDY_TEMPLATES = [
  {
    target: 'las personas adultas con {cond} atendidas en {setting}',
    sample: 'los {n} pacientes reclutados durante {months} meses',
    conds: ['insuficiencia cardíaca', 'artrosis de rodilla', 'asma moderada', 'migraña crónica', 'diabetes tipo 2'],
    settings: ['atención primaria', 'un hospital comarcal', 'tres centros de rehabilitación', 'una consulta de especialidad'],
  },
  {
    target: 'el estudiantado de grados de Ciencias de la Salud de la universidad',
    sample: 'las {n} personas que respondieron a la encuesta',
    conds: ['ansiedad académica', 'mala calidad del sueño', 'sedentarismo'],
    settings: ['la universidad'],
  },
];

/* =============================================== generadores de ejercicio */

/** w01: identificar la población objetivo. */
export function populationSample(rng) {
  const tpl = rng.pick(STUDY_TEMPLATES);
  const cond = rng.pick(tpl.conds);
  const setting = rng.pick(tpl.settings);
  const n = rng.int(40, 220);
  const months = rng.int(3, 18);
  const target = tpl.target.replace('{cond}', cond).replace('{setting}', setting);
  const sample = tpl.sample.replace('{n}', n).replace('{months}', months);

  const options = rng.shuffle([
    { id: 'target', text: capitalize(target), why: 'Es el conjunto sobre el que se quiere concluir.' },
    { id: 'sample', text: capitalize(sample), why: 'Ese es el conjunto medido: la muestra.' },
    { id: 'wide', text: 'Toda la población del país', why: 'La población de un estudio la define la pregunta, no el territorio.' },
    { id: 'staff', text: 'El personal sanitario que participó en el estudio', why: 'Aplican la intervención; no son las unidades de estudio.' },
  ]);

  return {
    stem: `Se investiga ${cond} en ${target}. Para ello se estudian ${sample}.`,
    prompt: '¿Cuál es la POBLACIÓN objetivo de este estudio?',
    options,
    answer: 'target',
  };
}

/** w02: identificar el tipo de una variable. */
export function variableTypes(rng) {
  const target = rng.pick(VARIABLE_BANK);
  const options = rng.shuffle(Object.keys(TYPE_LABELS).map((k) => ({
    id: k,
    text: TYPE_LABELS[k],
    why: k === target.type ? 'Correcto.' : WHY_TYPE[k],
  })));
  return {
    stem: `Variable registrada en la historia clínica: «${target.text}».`,
    prompt: '¿De qué tipo es esta variable?',
    options,
    answer: target.type,
  };
}

const WHY_TYPE = {
  nominal: 'Sería nominal si fueran categorías sin ningún orden natural.',
  ordinal: 'Sería ordinal si fueran categorías con un orden pero sin distancias comparables.',
  discreta: 'Sería discreta si se tratara de un recuento de valores aislados.',
  continua: 'Sería continua si pudiera tomar cualquier valor de un intervalo.',
};

/** w03: calcular un estadístico descriptivo sobre datos generados. */
export function descriptiveBasics(rng) {
  const ctx = rng.pick(CONTEXTS);
  const n = rng.int(6, 9);
  const mu = rng.nice(ctx.lo + (ctx.hi - ctx.lo) * 0.3, ctx.lo + (ctx.hi - ctx.lo) * 0.7, 0);
  const sigma = Math.max(1, round((ctx.hi - ctx.lo) * rng.uniform(0.06, 0.13), 0));
  const decimals = ctx.hi - ctx.lo < 25 ? 1 : 0;
  const values = Array.from({ length: n }, () => round(rng.normalIn(mu, sigma, ctx.lo, ctx.hi), decimals));

  const which = rng.weighted(['mean', 'median', 'sd', 'range'], [4, 3, 3, 2]);
  const answers = {
    mean: { value: round(mean(values), 2), label: 'la MEDIA', tol: 0.06 },
    median: { value: round(median(values), 2), label: 'la MEDIANA', tol: 0.06 },
    sd: { value: round(sd(values), 2), label: 'la DESVIACIÓN TÍPICA muestral (n − 1)', tol: 0.12 },
    range: { value: round(Math.max(...values) - Math.min(...values), 2), label: 'el RANGO', tol: 0.06 },
  };
  const a = answers[which];

  return {
    stem: `${capitalize(ctx.what)} (${ctx.unit}) en ${n} ${ctx.who}:\n${values.join(' · ')}`,
    prompt: `Calcula ${a.label}. Redondea a dos decimales.`,
    answer: a.value,
    tolerance: a.tol,
    unit: ctx.unit,
    data: values,
    explanation: `Datos ordenados: ${values.slice().sort((x, y) => x - y).join(' · ')}. `
      + `Media = ${fmt(mean(values), 2)} · Mediana = ${fmt(median(values), 2)} · `
      + `Desviación típica (n−1) = ${fmt(sd(values), 2)} · Rango = ${fmt(Math.max(...values) - Math.min(...values), 2)}. `
      + 'Recuerda: la mediana exige ordenar los datos, y la desviación típica muestral divide entre n − 1.',
  };
}

/** w07: calcular el error estándar de la media. */
export function seFromSample(rng) {
  const ctx = rng.pick(CONTEXTS);
  const n = rng.pick([16, 25, 36, 49, 64, 100]);
  const s = round(rng.uniform(0.08, 0.2) * (ctx.hi - ctx.lo), 1);
  const m = round(rng.uniform(ctx.lo + (ctx.hi - ctx.lo) * 0.35, ctx.lo + (ctx.hi - ctx.lo) * 0.65), 1);
  const answer = round(s / Math.sqrt(n), 3);
  return {
    stem: `Muestra de n = ${n} ${ctx.who}. ${capitalize(ctx.what)}: media ${fmt(m, 1)} ${ctx.unit}, `
      + `desviación típica ${fmt(s, 1)} ${ctx.unit}.`,
    prompt: 'Calcula el ERROR ESTÁNDAR de la media. Tres decimales.',
    answer,
    tolerance: 0.02,
    unit: ctx.unit,
    explanation: `SE = s/√n = ${fmt(s, 1)}/√${n} = ${fmt(s, 1)}/${Math.sqrt(n)} = ${fmt(answer, 3)} ${ctx.unit}. `
      + 'El error estándar describe la variabilidad de la MEDIA entre muestras, no la variabilidad de los individuos '
      + `(que es ${fmt(s, 1)} ${ctx.unit}). Nótese que SE < s siempre que n > 1.`,
  };
}

/** w05: probabilidad condicionada con una tabla 2×2 generada. */
export function conditionalProbability(rng) {
  const total = rng.pick([200, 240, 300, 400, 500]);
  const pA = rng.nice(0.2, 0.45, 2);
  const pB = rng.nice(0.15, 0.35, 2);
  const nA = Math.round(total * pA);
  const nB = Math.round(total * pB);
  const both = Math.round(Math.min(nA, nB) * rng.uniform(0.15, 0.5));
  const answer = round(both / nA, 3);
  const cond = rng.pick(['dolor cervical', 'insomnio', 'cefalea', 'fatiga persistente']);
  const cond2 = rng.pick(['dolor lumbar', 'ansiedad', 'mareo']);
  return {
    stem: `En una consulta se han atendido ${total} pacientes: ${nA} presentan ${cond2}, `
      + `${nB} presentan ${cond} y ${both} presentan ambos.`,
    prompt: `Si un paciente presenta ${cond2}, ¿cuál es la probabilidad de que además presente ${cond}? `
      + 'Tanto por uno, tres decimales.',
    answer,
    tolerance: 0.006,
    explanation: `P(${cond} | ${cond2}) = ${both}/${nA} = ${fmt(answer, 3)}. Al condicionar, el denominador `
      + `deja de ser el total (${total}) y pasa a ser el grupo condicionante (${nA}).`,
  };
}

/** w13: métricas diagnósticas a partir de una tabla generada. */
export function diagnosticMetricsExercise(rng) {
  const prev = rng.pick([0.01, 0.02, 0.05, 0.1, 0.2, 0.35]);
  const sens = rng.nice(0.8, 0.98, 2);
  const spec = rng.nice(0.8, 0.98, 2);
  const pop = 10000;
  const diseased = Math.round(pop * prev);
  const healthy = pop - diseased;
  const tp = Math.round(diseased * sens);
  const fn = diseased - tp;
  const tn = Math.round(healthy * spec);
  const fp = healthy - tn;
  const ppv = round((tp / (tp + fp)) * 100, 1);
  return {
    stem: `Prueba con sensibilidad ${fmt(sens * 100, 0)} % y especificidad ${fmt(spec * 100, 0)} %, `
      + `aplicada a ${pop.toLocaleString('es-ES')} personas con una prevalencia del ${fmt(prev * 100, 1)} %.`,
    prompt: '¿Cuál es el VALOR PREDICTIVO POSITIVO? Porcentaje con un decimal.',
    answer: ppv,
    tolerance: 1.2,
    unit: '%',
    explanation: `Enfermos: ${diseased} → VP = ${tp}, FN = ${fn}. Sanos: ${healthy} → VN = ${tn}, FP = ${fp}. `
      + `VPP = VP/(VP+FP) = ${tp}/${tp + fp} = ${fmt(ppv, 1)} %. `
      + `Con prevalencia ${fmt(prev * 100, 1)} %, ${fp > tp ? 'los falsos positivos SUPERAN a los verdaderos positivos' : 'los verdaderos positivos superan a los falsos'}: `
      + 'el VPP depende de la prevalencia, la sensibilidad no.',
  };
}

/** w06: puntuación z y probabilidad normal. */
export function zScoreExercise(rng) {
  const ctx = rng.pick(CONTEXTS.filter((c) => c.hi - c.lo > 15));
  const mu = round(rng.uniform(ctx.lo + (ctx.hi - ctx.lo) * 0.4, ctx.lo + (ctx.hi - ctx.lo) * 0.6), 0);
  const sigma = round((ctx.hi - ctx.lo) * rng.uniform(0.08, 0.16), 0);
  const k = rng.pick([-2, -1.5, -1, 1, 1.5, 2]);
  const x = round(mu + k * sigma, 0);
  return {
    stem: `${capitalize(ctx.what)} en ${ctx.who}: distribución aproximadamente normal con media `
      + `${fmt(mu, 0)} ${ctx.unit} y desviación típica ${fmt(sigma, 0)} ${ctx.unit}. Una persona presenta ${fmt(x, 0)} ${ctx.unit}.`,
    prompt: 'Calcula su puntuación z. Dos decimales.',
    answer: round((x - mu) / sigma, 2),
    tolerance: 0.03,
    explanation: `z = (${fmt(x, 0)} − ${fmt(mu, 0)}) / ${fmt(sigma, 0)} = ${fmt((x - mu) / sigma, 2)}. `
      + `Está ${Math.abs(k)} desviaciones típicas ${k < 0 ? 'POR DEBAJO' : 'POR ENCIMA'} de la media. `
      + 'El signo importa: indica el lado de la distribución.',
  };
}

export const GENERATORS = {
  populationSample,
  variableTypes,
  descriptiveBasics,
  seFromSample,
  conditionalProbability,
  diagnosticMetrics: diagnosticMetricsExercise,
  zScore: zScoreExercise,
};

/**
 * Aplica el generador de una actividad. Si no tiene generador, devuelve la
 * actividad tal cual. `seedKey` permite reproducir el mismo enunciado.
 */
export function instantiate(activity, seedKey = null) {
  if (!activity.generator) return { ...activity, seed: null };
  const gen = GENERATORS[activity.generator];
  if (!gen) {
    console.warn('[generators] generador desconocido:', activity.generator);
    return { ...activity, seed: null };
  }
  const seed = seedKey || `${activity.id}-${Date.now()}-${Math.random()}`;
  const rng = rngFor(seed);
  const produced = gen(rng, activity);
  return { ...activity, ...produced, seed, generated: true };
}

/* ==================================== generadores de conjuntos de datos == */

/**
 * Ensayo clínico de dos grupos. Devuelve filas + resúmenes + resultados de la
 * prueba, listos para alimentar un reto semanal.
 */
export function clinicalTrial2Groups(params, seed = 'statlab') {
  const rng = rngFor(seed);
  const {
    n = 80,
    groupNames = ['Control', 'Intervención'],
    outcome, baseline, covariates = [], categorical = [],
  } = params;

  const half = Math.floor(n / 2);
  const rows = [];
  for (let i = 0; i < n; i++) {
    const g = i < half ? 0 : 1;
    const row = { id: `P${String(i + 1).padStart(3, '0')}`, grupo: groupNames[g] };

    if (baseline) {
      row[baseline.name] = clampRound(rng.normal(baseline.mean, baseline.sd), baseline);
    }
    const shift = g === 1 ? (outcome.effect || 0) : 0;
    row[outcome.name] = clampRound(rng.normal(outcome.mean + shift, outcome.sd), outcome);

    for (const c of covariates) row[c.name] = clampRound(rng.normal(c.mean, c.sd), c);
    for (const c of categorical) {
      row[c.name] = rng.weighted(c.levels, c.probs || c.levels.map(() => 1));
    }
    rows.push(row);
  }

  const g1 = rows.filter((r) => r.grupo === groupNames[0]).map((r) => r[outcome.name]);
  const g2 = rows.filter((r) => r.grupo === groupNames[1]).map((r) => r[outcome.name]);

  return {
    rows,
    groupNames,
    outcome,
    baseline,
    variables: [
      { name: 'grupo', label: 'Grupo', type: 'nominal' },
      ...(baseline ? [{ name: baseline.name, label: baseline.label, type: 'discreta' }] : []),
      { name: outcome.name, label: outcome.label, type: 'discreta' },
      ...covariates.map((c) => ({ name: c.name, label: c.label, type: 'continua' })),
      ...categorical.map((c) => ({ name: c.name, label: c.label, type: 'nominal' })),
    ],
    groups: {
      [groupNames[0]]: summarize(g1),
      [groupNames[1]]: summarize(g2),
    },
    values: { [groupNames[0]]: g1, [groupNames[1]]: g2 },
  };
}

function summarize(xs) {
  return {
    n: xs.length,
    mean: round(mean(xs), 2),
    sd: round(sd(xs), 2),
    median: round(median(xs), 2),
    se: round(seOf(xs), 3),
    variance: round(variance(xs), 3),
    min: Math.min(...xs),
    max: Math.max(...xs),
  };
}

function clampRound(v, spec) {
  let x = v;
  if (spec.min !== undefined) x = Math.max(spec.min, x);
  if (spec.max !== undefined) x = Math.min(spec.max, x);
  return spec.round !== undefined ? round(x, spec.round) : round(x, 2);
}

/** Correlación / regresión: pares (x, y) con r aproximado. */
export function correlatedPairs({ n = 30, r = 0.6, muX = 0, sdX = 1, muY = 0, sdY = 1, roundTo = 1 }, seed = 'statlab') {
  const rng = rngFor(seed);
  const { xs, ys } = rng.correlated(n, r, muX, sdX, muY, sdY);
  return xs.map((x, i) => ({ x: round(x, roundTo), y: round(ys[i], roundTo) }));
}

/** Tabla 2×2 diagnóstica a partir de tasas. */
export function diagnostic2x2({ sensitivity, specificity, prevalence, population = 1000 }) {
  const diseased = Math.round(population * prevalence);
  const healthy = population - diseased;
  const tp = Math.round(diseased * sensitivity);
  const tn = Math.round(healthy * specificity);
  return { tp, fn: diseased - tp, tn, fp: healthy - tn, population };
}

export const DATASET_GENERATORS = { clinicalTrial2Groups, correlatedPairs, diagnostic2x2 };

/** Genera el conjunto de datos declarado por un reto. */
export function buildDataset(spec) {
  if (!spec) return null;
  const gen = DATASET_GENERATORS[spec.generator];
  if (!gen) { console.warn('[generators] dataset desconocido:', spec.generator); return null; }
  return gen(spec.params || {}, spec.seed || 'statlab');
}

const capitalize = (s) => (s ? s[0].toUpperCase() + s.slice(1) : s);
export { RNG };
