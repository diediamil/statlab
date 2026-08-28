/**
 * STATLAB — puntuación de los retos semanales (Challenge Points)
 * ===========================================================================
 * PRINCIPIO: la competición debe premiar SABER ESTADÍSTICA, no responder
 * rápido. Por eso el tiempo pesa poco, la exactitud domina y ninguna
 * componente cae a cero de golpe.
 *
 * Máximo: 1.000 Challenge Points, repartidos así (configurable):
 *
 *   Exactitud y resolución  700   media ponderada del acierto por paso
 *   Eficiencia (errores)    150   150 · E / (E + errores),  E = pasos / 2
 *   Tiempo                  100   100 si t ≤ t_ref; después caída suave, suelo 25
 *   Pistas                   50   50 · (1 − pistas usadas / pistas disponibles)
 *
 * ---------------------------------------------------------------------------
 * 1. EXACTITUD (700)
 *    Cada paso i tiene un peso w_i (por defecto 1) y una puntuación s_i ∈ [0,1]
 *    que el propio tipo de paso calcula (crédito parcial incluido: en un paso
 *    de clasificación con 6 elementos, acertar 5 da 0,833).
 *
 *        accuracy = 700 · Σ(w_i · s_i) / Σ(w_i)
 *
 *    Los pasos más importantes (elegir la prueba, concluir) llevan peso 1,5–2.
 *
 * 2. EFICIENCIA (150)
 *    errores = número de comprobaciones incorrectas acumuladas en todo el reto.
 *
 *        efficiency = 150 · E / (E + errores),   E = max(2, pasos / 2)
 *
 *    Con 8 pasos (E = 4): 0 errores → 150 · 1     = 150
 *                         1 error   → 150 · 4/5   = 120
 *                         2 errores → 150 · 4/6   = 100
 *                         4 errores → 150 · 4/8   =  75
 *                         8 errores → 150 · 4/12  =  50
 *    Nunca llega a cero: equivocarse cuesta, pero no arruina el intento.
 *    Es una hipérbola, así que el primer error penaliza más que el octavo:
 *    exactamente el incentivo que queremos (pensar antes de responder), sin
 *    convertir un despiste en una catástrofe.
 *
 * 3. TIEMPO (100)  ← la parte más delicada
 *    t_ref = tiempo de referencia que fija el profesor (minutos → segundos).
 *    r = t_activo / t_ref
 *
 *        r ≤ 1   → 100 puntos completos
 *        r > 1   → 100 / (1 + (r − 1)^1.35), con suelo en 25 puntos
 *
 *    Consecuencias buscadas:
 *      · Por debajo del tiempo de referencia NO hay carrera: terminar en 4 o
 *        en 9 minutos con t_ref = 10 da exactamente lo mismo. Así se elimina
 *        el incentivo a responder a lo loco.
 *      · Pasarse un 50 % (15 min con t_ref 10) → 100/(1+0,5^1,35) ≈ 72 puntos.
 *      · Pasarse el doble (20 min) → 100/(1+1) = 50 puntos.
 *      · El suelo de 25 evita que un alumno lento pierda toda esperanza.
 *      · Diferencias de segundos no cambian nada: la función es continua y
 *        plana en la zona relevante.
 *
 *    COMPROBACIÓN DEL REQUISITO DE JUSTICIA (t_ref = 10 min):
 *      Alumno A: 9 min, todo perfecto, 0 errores, 0 pistas
 *        → 700 + 150 + 100 + 50 = 1000
 *      Alumno B: 4 min, 6 de 8 pasos correctos, 3 errores, 0 pistas
 *        → 700·0,75 + 150·4/7 + 100 + 50 = 525 + 86 + 150 = 761
 *      A supera a B por 239 puntos aunque tarde más del doble. ✔
 *
 * 4. PISTAS (50)
 *        hints = 50 · (1 − usadas / disponibles)
 *    Si el reto no ofrece pistas, se otorgan los 50 puntos completos (no se
 *    puede penalizar por algo que no existía).
 *
 * ---------------------------------------------------------------------------
 * XP frente a CHALLENGE POINTS: son sistemas separados y no se mezclan.
 * · Challenge Points → competición dentro del reto (ranking).
 * · XP → progresión general en STATLAB (nivel, logros).
 * Un reto genera ambos, pero el ranking NUNCA usa XP: si lo hiciera, quien
 * lleva más tiempo jugando quedaría permanentemente por delante.
 *
 * Nada de esto es una calificación académica.
 */

import { clamp, round } from './utils.js';

/** Pesos por defecto. Un profesor puede alterarlos por reto. */
export const DEFAULT_SCORING = {
  maxTotal: 1000,
  accuracyMax: 700,
  efficiencyMax: 150,
  timeMax: 100,
  hintsMax: 50,
  timeFloor: 25,        // puntos mínimos del componente temporal
  timeExponent: 1.35,   // curvatura de la caída
  errorRefDivisor: 2,   // E = pasos / 2
  errorRefMin: 2,
};

/**
 * Puntuación de exactitud.
 * @param {{score:number, weight?:number}[]} steps
 */
export function accuracyScore(steps, cfg = DEFAULT_SCORING) {
  if (!steps.length) return { points: 0, fraction: 0 };
  let num = 0, den = 0;
  for (const s of steps) {
    const w = s.weight ?? 1;
    num += w * clamp(s.score ?? 0, 0, 1);
    den += w;
  }
  const fraction = den ? num / den : 0;
  return { points: round(cfg.accuracyMax * fraction, 1), fraction: round(fraction, 4) };
}

/** Puntuación de eficiencia (errores). */
export function efficiencyScore(errors, nSteps, cfg = DEFAULT_SCORING) {
  const E = Math.max(cfg.errorRefMin, nSteps / cfg.errorRefDivisor);
  const points = cfg.efficiencyMax * (E / (E + Math.max(0, errors)));
  return { points: round(points, 1), reference: E };
}

/** Puntuación temporal. `activeSeconds` es TIEMPO ACTIVO, no tiempo de reloj. */
export function timeScore(activeSeconds, referenceSeconds, cfg = DEFAULT_SCORING) {
  if (!referenceSeconds || referenceSeconds <= 0) return { points: cfg.timeMax, ratio: 0 };
  const r = Math.max(0, activeSeconds) / referenceSeconds;
  if (r <= 1) return { points: cfg.timeMax, ratio: round(r, 3) };
  const raw = cfg.timeMax / (1 + (r - 1) ** cfg.timeExponent);
  // El suelo nunca puede superar el máximo: si un profesor pone timeMax = 0
  // (tiempo irrelevante), el componente debe valer 0, no el suelo por defecto.
  const floor = Math.min(cfg.timeFloor, cfg.timeMax);
  return { points: round(Math.max(floor, raw), 1), ratio: round(r, 3) };
}

/** Puntuación de pistas. */
export function hintsScore(used, available, cfg = DEFAULT_SCORING) {
  if (!available) return { points: cfg.hintsMax, fraction: 0 };
  const frac = clamp(used / available, 0, 1);
  return { points: round(cfg.hintsMax * (1 - frac), 1), fraction: round(frac, 3) };
}

/**
 * Puntuación completa de un intento de reto.
 *
 * @param {object} attempt
 *   steps          [{id, score, weight, errors, hintsUsed, hintsAvailable}]
 *   activeSeconds  tiempo activo total
 *   referenceSeconds tiempo de referencia del reto
 *   errors         errores totales (si no se pasa, se suman los de los pasos)
 *   hintsUsed / hintsAvailable (idem)
 * @param {object} cfg pesos
 */
export function scoreChallengeAttempt(attempt, cfg = DEFAULT_SCORING) {
  const steps = attempt.steps || [];
  const errors = attempt.errors ?? steps.reduce((s, x) => s + (x.errors || 0), 0);
  const hintsUsed = attempt.hintsUsed ?? steps.reduce((s, x) => s + (x.hintsUsed || 0), 0);
  const hintsAvailable = attempt.hintsAvailable
    ?? steps.reduce((s, x) => s + (x.hintsAvailable || 0), 0);

  const acc = accuracyScore(steps, cfg);
  const eff = efficiencyScore(errors, steps.length, cfg);
  const tim = timeScore(attempt.activeSeconds || 0, attempt.referenceSeconds || 0, cfg);
  const hin = hintsScore(hintsUsed, hintsAvailable, cfg);

  const total = round(acc.points + eff.points + tim.points + hin.points, 0);

  return {
    total: clamp(total, 0, cfg.maxTotal),
    max: cfg.maxTotal,
    components: {
      accuracy: { points: acc.points, max: cfg.accuracyMax, fraction: acc.fraction },
      efficiency: { points: eff.points, max: cfg.efficiencyMax, errors, reference: eff.reference },
      time: { points: tim.points, max: cfg.timeMax, activeSeconds: attempt.activeSeconds || 0, referenceSeconds: attempt.referenceSeconds || 0, ratio: tim.ratio },
      hints: { points: hin.points, max: cfg.hintsMax, used: hintsUsed, available: hintsAvailable },
    },
    perfectRun: errors === 0 && acc.fraction >= 0.9999,
    noHints: hintsUsed === 0,
    stepsCorrect: steps.filter((s) => (s.score ?? 0) >= 0.9999).length,
    stepsTotal: steps.length,
  };
}

/**
 * XP que otorga un reto. Deliberadamente MODESTO respecto a los Challenge
 * Points, para que el ranking competitivo y la progresión no se confundan.
 * Base 40 XP + hasta 60 XP proporcionales a la exactitud.
 */
export function challengeXp(scoreResult, { base = 40, maxBonus = 60 } = {}) {
  const frac = scoreResult.components.accuracy.fraction;
  return Math.round(base + maxBonus * frac);
}

/** Bonus de XP por posición en el ranking semanal (pequeño a propósito). */
export const RANK_XP_BONUS = { 1: 100, 2: 75, 3: 50 };
export const rankBonusXp = (position) => RANK_XP_BONUS[position] || 0;

/* ------------------------------------------------ puntuación de un paso -- */

/**
 * Crédito parcial estándar para respuestas de selección múltiple.
 * Penaliza las selecciones incorrectas para que marcar todo no sea rentable.
 *
 *   score = max(0, (aciertos − falsos positivos) / número de correctas)
 */
export function multiSelectScore(selected, correctIds, allIds) {
  const sel = new Set(selected);
  const cor = new Set(correctIds);
  let hits = 0, falsePos = 0;
  for (const id of allIds) {
    if (sel.has(id) && cor.has(id)) hits++;
    if (sel.has(id) && !cor.has(id)) falsePos++;
  }
  return cor.size ? clamp((hits - falsePos) / cor.size, 0, 1) : 0;
}

/** Crédito parcial de una clasificación: proporción de elementos bien colocados. */
export function classifyScore(placements, items) {
  if (!items.length) return 0;
  let ok = 0;
  for (const it of items) if (placements[it.id] === it.bin) ok++;
  return ok / items.length;
}

/** Crédito parcial de una ordenación: pares en orden relativo correcto (Kendall). */
export function orderScore(order, items) {
  const truth = new Map(items.map((i) => [i.id, i.pos]));
  const n = order.length;
  if (n < 2) return order.length === items.length ? 1 : 0;
  let concordant = 0, pairs = 0;
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      pairs++;
      if ((truth.get(order[i]) ?? 0) < (truth.get(order[j]) ?? 0)) concordant++;
    }
  }
  return pairs ? concordant / pairs : 0;
}

/** Crédito de una respuesta numérica con tolerancia. */
export function numericScore(value, answer, tolerance = 0) {
  if (!Number.isFinite(value)) return 0;
  return Math.abs(value - answer) <= (tolerance || 0) + 1e-9 ? 1 : 0;
}

/** Crédito de un juicio de afirmaciones (verdadero/falso con razón). */
export function claimAuditScore(answers, claims) {
  if (!claims.length) return 0;
  let ok = 0;
  for (const c of claims) if (answers[c.id] === c.correct) ok++;
  return ok / claims.length;
}

/**
 * Crédito de un paso de decisión: 70 % la elección de la prueba, 30 % la
 * justificación. Se puntúa así porque elegir bien por casualidad y elegir bien
 * con criterio no deben valer lo mismo.
 */
export function decisionScore({ chosen, justification }, step) {
  const primary = chosen === step.answer ? 1
    : (step.acceptable || []).includes(chosen) ? 0.6 : 0;
  if (!step.justify) return primary;
  const opts = step.justify.options || [];
  const correctIds = opts.filter((o) => o.correct).map((o) => o.id);
  const j = multiSelectScore(justification || [], correctIds, opts.map((o) => o.id));
  return round(0.7 * primary + 0.3 * j, 4);
}

/** Texto explicativo del scoring para mostrarlo en la interfaz. */
export function scoringExplanation(cfg = DEFAULT_SCORING) {
  return [
    { key: 'accuracy', max: cfg.accuracyMax, formula: 'media ponderada del acierto por paso', note: 'Componente dominante.' },
    { key: 'efficiency', max: cfg.efficiencyMax, formula: `${cfg.efficiencyMax} · E / (E + errores), con E = pasos / 2`, note: 'Nunca llega a cero.' },
    { key: 'time', max: cfg.timeMax, formula: `${cfg.timeMax} si t ≤ t_ref; después ${cfg.timeMax} / (1 + (t/t_ref − 1)^${cfg.timeExponent})`, note: `Suelo de ${cfg.timeFloor} puntos. Por debajo del tiempo de referencia no hay carrera.` },
    { key: 'hints', max: cfg.hintsMax, formula: `${cfg.hintsMax} · (1 − usadas / disponibles)`, note: 'Íntegros si no usas ninguna.' },
  ];
}

/* ===========================================================================
   DOCUMENTACIÓN QUE VE EL USUARIO
   ---------------------------------------------------------------------------
   Misma disciplina que en `js/mastery.js`: la explicación vive junto al código
   que la implementa, para que un cambio en la fórmula sin cambio en el texto
   cante. Ecuaciones en MathML nativo, sin librerías.
   =========================================================================== */

const S = {
  total: `<math display="block"><mi>P</mi><mo>=</mo>
    <msub><mi>P</mi><mtext>exac</mtext></msub><mo>+</mo>
    <msub><mi>P</mi><mtext>efic</mtext></msub><mo>+</mo>
    <msub><mi>P</mi><mtext>tiempo</mtext></msub><mo>+</mo>
    <msub><mi>P</mi><mtext>pistas</mtext></msub>
    <mo>≤</mo><mn>1000</mn></math>`,

  exactitud: `<math display="block"><msub><mi>P</mi><mtext>exac</mtext></msub><mo>=</mo><mn>700</mn><mo>·</mo>
    <mfrac>
      <mrow><munderover><mo>∑</mo><mrow><mi>i</mi><mo>=</mo><mn>1</mn></mrow><mi>k</mi></munderover>
        <msub><mi>w</mi><mi>i</mi></msub><msub><mi>s</mi><mi>i</mi></msub></mrow>
      <mrow><munderover><mo>∑</mo><mrow><mi>i</mi><mo>=</mo><mn>1</mn></mrow><mi>k</mi></munderover>
        <msub><mi>w</mi><mi>i</mi></msub></mrow>
    </mfrac></math>`,

  eficiencia: `<math display="block"><msub><mi>P</mi><mtext>efic</mtext></msub><mo>=</mo><mn>150</mn><mo>·</mo>
    <mfrac><mi>E</mi><mrow><mi>E</mi><mo>+</mo><mi>e</mi></mrow></mfrac>
    <mo>,</mo><mspace width="0.6em"/>
    <mi>E</mi><mo>=</mo><mi>máx</mi><mo stretchy="false">(</mo><mn>2</mn><mo>,</mo>
    <mi>k</mi><mo>/</mo><mn>2</mn><mo stretchy="false">)</mo></math>`,

  tiempo: `<math display="block"><msub><mi>P</mi><mtext>tiempo</mtext></msub><mo>=</mo>
    <mrow><mo>{</mo><mtable columnalign="left left">
      <mtr><mtd><mn>100</mn></mtd><mtd><mtext>si&#xA0;</mtext><mi>r</mi><mo>≤</mo><mn>1</mn></mtd></mtr>
      <mtr><mtd><mi>máx</mi><mo stretchy="false">(</mo><mn>25</mn><mo>,</mo>
        <mfrac><mn>100</mn><mrow><mn>1</mn><mo>+</mo>
        <msup><mrow><mo stretchy="false">(</mo><mi>r</mi><mo>−</mo><mn>1</mn><mo stretchy="false">)</mo></mrow><mn>1,35</mn></msup>
        </mrow></mfrac><mo stretchy="false">)</mo></mtd>
        <mtd><mtext>si&#xA0;</mtext><mi>r</mi><mo>&gt;</mo><mn>1</mn></mtd></mtr>
    </mtable></mrow>
    <mo>,</mo><mspace width="0.6em"/>
    <mi>r</mi><mo>=</mo><mfrac><msub><mi>t</mi><mtext>activo</mtext></msub><msub><mi>t</mi><mtext>ref</mtext></msub></mfrac></math>`,

  pistas: `<math display="block"><msub><mi>P</mi><mtext>pistas</mtext></msub><mo>=</mo><mn>50</mn>
    <mrow><mo>(</mo><mn>1</mn><mo>−</mo>
    <mfrac><msub><mi>h</mi><mtext>usadas</mtext></msub><msub><mi>h</mi><mtext>disp</mtext></msub></mfrac>
    <mo>)</mo></mrow></math>`,

  nivel: `<math display="block"><mi>XP</mi><mo stretchy="false">(</mo><mi>L</mi><mo stretchy="false">)</mo>
    <mo>=</mo><mn>60</mn><mo stretchy="false">(</mo><mi>L</mi><mo>−</mo><mn>1</mn><mo stretchy="false">)</mo>
    <mo>+</mo><mn>20</mn><msup><mrow><mo stretchy="false">(</mo><mi>L</mi><mo>−</mo><mn>1</mn><mo stretchy="false">)</mo></mrow><mn>2</mn></msup></math>`,
};

const eqs = (m, n) => `<div class="eq"><div class="eq__body">${m}</div><span class="eq__n">(${n})</span></div>`;

export const SCORING_DOC = {
  html: `
<p class="mathdoc__lead">Los <b>Challenge Points</b> ordenan el ranking del reto semanal. La regla que
gobierna todo el diseño: <b>premian saber estadística, no responder rápido</b>. Por eso la exactitud
vale siete veces más que el tiempo, y ninguna componente cae nunca a cero.</p>

<h4 class="mathdoc__h">Nomenclatura</h4>
<table class="mathdoc__t mathdoc__t--nom"><tbody>
<tr><th><math><mi>k</mi></math></th><td>número de pasos del reto (8 en los retos estándar)</td></tr>
<tr><th><math><msub><mi>s</mi><mi>i</mi></msub><mo>∈</mo><mo stretchy="false">[</mo><mn>0</mn><mo>,</mo><mn>1</mn><mo stretchy="false">]</mo></math></th><td>acierto del paso <math><mi>i</mi></math>, con crédito parcial</td></tr>
<tr><th><math><msub><mi>w</mi><mi>i</mi></msub></math></th><td>peso del paso: 1 por defecto, 1,5–2 en los decisivos</td></tr>
<tr><th><math><mi>e</mi></math></th><td>errores acumulados en todo el reto</td></tr>
<tr><th><math><mi>E</mi></math></th><td>errores de referencia</td></tr>
<tr><th><math><msub><mi>t</mi><mtext>activo</mtext></msub></math></th><td>tiempo <em>activo</em>: se detiene tras 90 s sin interacción o al cambiar de pestaña</td></tr>
<tr><th><math><msub><mi>t</mi><mtext>ref</mtext></msub></math></th><td>tiempo de referencia que fija el profesor</td></tr>
<tr><th><math><mi>r</mi></math></th><td>razón entre tiempo empleado y de referencia</td></tr>
<tr><th><math><msub><mi>h</mi><mtext>usadas</mtext></msub><mo>,</mo><msub><mi>h</mi><mtext>disp</mtext></msub></math></th><td>pistas usadas y disponibles</td></tr>
<tr><th><math><mi>P</mi></math></th><td>Challenge Points del intento</td></tr>
</tbody></table>

<h4 class="mathdoc__h">Definición</h4>
${eqs(S.total, 1)}
<p class="small"><b>Exactitud (máx. 700).</b> Media del acierto por paso, ponderada por su importancia:</p>
${eqs(S.exactitud, 2)}
<p class="small"><b>Eficiencia (máx. 150).</b> Una hipérbola: el primer error penaliza más que el octavo,
y el resultado nunca llega a cero.</p>
${eqs(S.eficiencia, 3)}
<div class="mathdoc__scroll"><table class="mathdoc__t mathdoc__t--num"><thead><tr>
<th>errores</th><td>0</td><td>1</td><td>2</td><td>4</td><td>8</td></tr></thead>
<tbody><tr><th>puntos</th><td>150</td><td>120</td><td>100</td><td>75</td><td>50</td></tr></tbody></table></div>
<p class="small"><b>Tiempo (máx. 100).</b> Por debajo del tiempo de referencia <em>no hay carrera</em>:</p>
${eqs(S.tiempo, 4)}
<div class="mathdoc__scroll"><table class="mathdoc__t mathdoc__t--num"><thead><tr>
<th><math><mi>r</mi></math></th><td>≤ 1</td><td>1,5</td><td>2</td><td>3</td><td>≥ 5</td></tr></thead>
<tbody><tr><th>puntos</th><td>100</td><td>72</td><td>50</td><td>34</td><td>25</td></tr></tbody></table></div>
<p class="small"><b>Pistas (máx. 50).</b> Íntegros si no usas ninguna. Si el reto no ofrece pistas se
conceden los 50: no se penaliza por algo que no existía.</p>
${eqs(S.pistas, 5)}

<h4 class="mathdoc__h">La comprobación que define el sistema</h4>
<p class="small">Con <math><msub><mi>t</mi><mtext>ref</mtext></msub><mo>=</mo><mn>10</mn></math> minutos:</p>
<table class="mathdoc__t"><tbody>
<tr><th>A — 9 min, todo correcto, 0 errores, 0 pistas</th><td><b>1000</b></td></tr>
<tr><th>B — 4 min, 6 de 8 pasos, 3 errores, 0 pistas</th><td>761</td></tr>
</tbody></table>
<p class="mathdoc__warn">Quien tarda <b>más del doble</b> pero razona bien gana por 239 puntos. Esto no es
una casualidad de los números: es el requisito que fija los pesos, y hay una prueba automática que
falla si alguien los cambia y lo rompe.</p>

<h4 class="mathdoc__h">XP y niveles: un sistema aparte</h4>
<p class="small">La XP mide tu progresión general y <b>nunca</b> ordena el ranking. Si lo hiciera, quien
lleva más tiempo jugando quedaría por delante para siempre. La XP acumulada al llegar al nivel
<math><mi>L</mi></math> es:</p>
${eqs(S.nivel, 6)}
<div class="mathdoc__scroll"><table class="mathdoc__t mathdoc__t--num"><thead><tr>
<th>nivel</th><td>2</td><td>3</td><td>5</td><td>10</td><td>20</td></tr></thead>
<tbody><tr><th>XP</th><td>80</td><td>200</td><td>560</td><td>2160</td><td>8360</td></tr></tbody></table></div>
<p class="small">Un reto da entre 40 y 100 XP según la exactitud, más un pequeño extra por podio
(🥇 100 · 🥈 75 · 🥉 50). <b>La XP ganada nunca se resta.</b></p>

<p class="mathdoc__note"><b>Lo que no es.</b> Ni los Challenge Points ni la XP son una calificación
académica, y no se convierten automáticamente en nota.</p>`,
};
