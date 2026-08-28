/**
 * STATLAB — Concept Mastery (0–100)
 * ===========================================================================
 * Requisito explícito del diseño: NADA DE ALGORITMOS OPACOS. Esta es la
 * fórmula completa, y la app la muestra al alumno cuando pulsa «¿cómo se
 * calcula?».
 *
 * 1. CALIDAD DE CADA RESPUESTA (q)
 *    Cada intento sobre un concepto recibe una calidad entre 0 y 1:
 *
 *      1,00  correcto a la primera, sin pistas
 *      0,85  correcto a la primera, con pista
 *      0,70  correcto en el segundo intento
 *      0,40  correcto tras tres o más intentos
 *      0,50  parcialmente correcto a la primera (crédito parcial ≥ 0,5)
 *      0,00  incorrecto
 *
 *    En pasos con crédito parcial, q parte del propio crédito (0–1) y se
 *    aplican los mismos descuentos por pistas e intentos.
 *
 * 2. PESO POR DIFICULTAD (w_d)
 *      fácil (1) → 1,0     media (2) → 1,3     difícil (3) → 1,6
 *
 *    Acertar ejercicios difíciles demuestra más dominio que acertar fáciles.
 *
 * 3. PESO POR RECENCIA (w_r)
 *    Las respuestas se ordenan de la más reciente a la más antigua. La
 *    k-ésima más reciente (k = 0 para la última) pesa:
 *
 *      w_r(k) = λ^k,  con λ = 0,85
 *
 *    Así, un concepto que se dominaba hace tres meses y ahora se falla baja;
 *    y un concepto que se falló al principio y ahora se acierta sube. Se
 *    consideran como máximo las 12 respuestas más recientes.
 *
 * 4. VALOR BRUTO
 *      bruto = Σ(w_d · w_r · q) / Σ(w_d · w_r)      ∈ [0, 1]
 *
 * 5. CONTRACCIÓN POR FALTA DE EVIDENCIA
 *    Con dos aciertos sueltos NO se debe mostrar un 100. Se contrae hacia 0:
 *
 *      mastery = 100 · bruto · n / (n + k),   con k = 2 y n = nº de respuestas
 *
 *    n = 1 → factor 0,33 · n = 2 → 0,50 · n = 5 → 0,71 · n = 10 → 0,83
 *    n = 20 → 0,91. El techo real solo se alcanza con evidencia sostenida.
 *
 * 6. NIVELES
 *      0–39  iniciando · 40–59 en desarrollo · 60–79 consolidando · 80–100 dominado
 *
 * DIFICULTAD ADAPTATIVA (sin IA): el mastery del concepto decide qué se
 * ofrece a continuación. Ver `nextDifficulty()` y `adaptivePlan()`.
 */

import { clamp, round } from './utils.js';

export const MASTERY_CONFIG = {
  lambda: 0.85,          // decaimiento por recencia
  window: 12,            // respuestas más recientes consideradas
  shrinkK: 2,            // contracción por poca evidencia
  difficultyWeight: { 1: 1.0, 2: 1.3, 3: 1.6 },
  quality: {
    firstTryClean: 1.0,
    firstTryHint: 0.85,
    secondTry: 0.7,
    laterTry: 0.4,
    wrong: 0,
  },
};

/**
 * Calidad de una respuesta individual.
 * @param {object} r  { correct, partial (0–1), attempts, hintsUsed }
 */
export function responseQuality(r, cfg = MASTERY_CONFIG) {
  const Q = cfg.quality;
  const attempts = Math.max(1, r.attempts || 1);
  const base = r.correct ? 1 : clamp(r.partial ?? 0, 0, 1);
  if (base <= 0) return 0;

  let q;
  if (attempts === 1) q = r.hintsUsed > 0 ? Q.firstTryHint : Q.firstTryClean;
  else if (attempts === 2) q = Q.secondTry;
  else q = Q.laterTry;

  // Con crédito parcial, q no puede superar el propio crédito.
  return round(Math.min(q, base <= 0.999 ? base * q : q), 4);
}

/**
 * Mastery de un concepto a partir de su historial.
 * @param {Array} responses  ordenadas de más antigua a más reciente:
 *                           { correct, partial, attempts, hintsUsed, difficulty }
 */
export function conceptMastery(responses, cfg = MASTERY_CONFIG) {
  const list = (responses || []).slice(-cfg.window).reverse();     // más reciente primero
  if (!list.length) {
    return { value: 0, n: 0, raw: 0, shrink: 0, level: masteryLevel(0), evidence: 0 };
  }
  let num = 0, den = 0;
  list.forEach((r, k) => {
    const wd = cfg.difficultyWeight[r.difficulty ?? 1] ?? 1;
    const wr = cfg.lambda ** k;
    const q = responseQuality(r, cfg);
    num += wd * wr * q;
    den += wd * wr;
  });
  const raw = den ? num / den : 0;
  const n = (responses || []).length;
  const shrink = n / (n + cfg.shrinkK);
  const value = round(100 * raw * shrink, 1);
  return {
    value: clamp(value, 0, 100),
    raw: round(raw, 4),
    shrink: round(shrink, 3),
    n,
    evidence: list.length,
    level: masteryLevel(value),
  };
}

export function masteryLevel(v) {
  if (v >= 80) return { key: 'mastered', label: 'dominado', color: 'var(--ok)' };
  if (v >= 60) return { key: 'consolidating', label: 'consolidando', color: 'var(--brand-2)' };
  if (v >= 40) return { key: 'developing', label: 'en desarrollo', color: 'var(--warn)' };
  return { key: 'starting', label: 'iniciando', color: 'var(--bad)' };
}

/** Mastery de todos los conceptos a partir de un historial de intentos. */
export function computeAllMastery(attempts, cfg = MASTERY_CONFIG) {
  const byConcept = new Map();
  const sorted = attempts.slice().sort((a, b) => new Date(a.created_at || 0) - new Date(b.created_at || 0));
  for (const a of sorted) {
    const concepts = a.concepts || (a.concept ? [a.concept] : []);
    for (const c of concepts) {
      if (!byConcept.has(c)) byConcept.set(c, []);
      byConcept.get(c).push({
        correct: !!a.correct,
        partial: a.score ?? (a.correct ? 1 : 0),
        attempts: a.attempt_number || a.attempts || 1,
        hintsUsed: a.hints_used || 0,
        difficulty: a.difficulty || 1,
      });
    }
  }
  const out = new Map();
  for (const [c, rs] of byConcept) out.set(c, conceptMastery(rs, cfg));
  return out;
}

/** Media de mastery ponderada por evidencia (para el panel del alumno). */
export function averageMastery(masteryMap) {
  const vals = Array.from(masteryMap.values()).filter((m) => m.n > 0);
  if (!vals.length) return 0;
  return round(vals.reduce((s, m) => s + m.value, 0) / vals.length, 1);
}

/* ================================================= dificultad adaptativa == */

/**
 * Dificultad recomendada para el siguiente ejercicio de un concepto.
 * Reglas simples, deterministas y auditables (nada de IA):
 *   mastery < 40  → dificultad 1 (fácil, muy guiado)
 *   40 ≤ m < 70   → dificultad 2 (media)
 *   m ≥ 70        → dificultad 3 (difícil, menos explícito)
 * Si los dos últimos intentos han sido fallos, se baja un escalón.
 */
export function nextDifficulty(mastery, recentResponses = []) {
  const m = mastery?.value ?? 0;
  let d = m >= 70 ? 3 : m >= 40 ? 2 : 1;
  const last2 = recentResponses.slice(-2);
  if (last2.length === 2 && last2.every((r) => !r.correct)) d = Math.max(1, d - 1);
  const lastRecent = recentResponses.slice(-3);
  if (lastRecent.length === 3 && lastRecent.every((r) => r.correct && (r.attempts || 1) === 1)) {
    d = Math.min(3, d + 1);
  }
  return d;
}

/**
 * Plan adaptativo tras una respuesta. Determina qué hacer a continuación.
 * Sin castigos: nunca se resta XP ya ganada.
 */
export function adaptivePlan({ correct, attempts = 1, hintsUsed = 0, mastery }) {
  if (!correct && attempts >= 2) {
    return {
      action: 'guided',
      showFullExplanation: true,
      offerHints: true,
      nextDifficulty: 1,
      message: 'Vamos a verlo con más detalle y después practicas uno parecido.',
    };
  }
  if (!correct) {
    return {
      action: 'retry',
      showFullExplanation: false,
      offerHints: true,
      nextDifficulty: Math.max(1, nextDifficulty(mastery) - 1),
      message: 'Vuelve a intentarlo. Puedes pedir una pista.',
    };
  }
  if (correct && attempts === 1 && hintsUsed === 0 && (mastery?.value ?? 0) >= 70) {
    return {
      action: 'level-up',
      showFullExplanation: false,
      offerHints: false,
      nextDifficulty: 3,
      message: 'Dominado. Vamos con un caso menos explícito.',
    };
  }
  return {
    action: 'continue',
    showFullExplanation: false,
    offerHints: true,
    nextDifficulty: nextDifficulty(mastery),
    message: null,
  };
}

/* ============================================== conceptos para repasar === */

/**
 * Conceptos que necesitan repaso, ordenados por prioridad.
 * Prioridad = (100 − mastery) · log(1 + errores recientes), lo que combina
 * «lo tienes poco dominado» con «has fallado varias veces hace poco».
 */
export function conceptsToReview(masteryMap, attempts, { limit = 8, recentDays = 21 } = {}) {
  const since = Date.now() - recentDays * 86400000;
  const errors = new Map();
  const lastFail = new Map();
  for (const a of attempts) {
    if (a.correct) continue;
    const t = new Date(a.created_at || 0).getTime();
    if (t < since) continue;
    for (const c of a.concepts || (a.concept ? [a.concept] : [])) {
      errors.set(c, (errors.get(c) || 0) + 1);
      if (!lastFail.has(c) || t > lastFail.get(c)) lastFail.set(c, t);
    }
  }
  const rows = [];
  for (const [c, n] of errors) {
    const m = masteryMap.get(c) || { value: 0 };
    rows.push({
      concept: c,
      mastery: m.value,
      errors: n,
      lastFailAt: new Date(lastFail.get(c)).toISOString(),
      priority: round((100 - m.value) * Math.log(1 + n), 2),
    });
  }
  // Conceptos con mastery bajo pero sin errores recientes también merecen repaso
  for (const [c, m] of masteryMap) {
    if (errors.has(c)) continue;
    if (m.n > 0 && m.value < 45) {
      rows.push({ concept: c, mastery: m.value, errors: 0, lastFailAt: null, priority: round((100 - m.value) * 0.4, 2) });
    }
  }
  return rows.sort((a, b) => b.priority - a.priority).slice(0, limit);
}

/** Documentación legible de la fórmula (se muestra en la interfaz). */
/* ===========================================================================
   DOCUMENTACIÓN QUE VE EL USUARIO
   ---------------------------------------------------------------------------
   El requisito «nada de algoritmos opacos» obliga a que la fórmula que se
   muestra sea LA MISMA que se ejecuta. Por eso este bloque vive aquí, junto a
   `conceptMastery()`, y no en los archivos de idioma: si alguien cambia el
   cálculo y no actualiza la explicación, el descuadre salta a la vista.

   Las ecuaciones van en MathML nativo. No hace falta ninguna librería: los
   navegadores actuales lo componen como LaTeX y los lectores de pantalla lo
   leen como matemáticas, no como una ristra de símbolos sueltos.
   =========================================================================== */

const EQ = {
  peso: `<math display="block"><msub><mi>ω</mi><mi>i</mi></msub><mo>=</mo>
    <mi>w</mi><mo stretchy="false">(</mo><msub><mi>d</mi><mi>i</mi></msub><mo stretchy="false">)</mo>
    <mo>·</mo><msup><mi>λ</mi><mrow><mi>i</mi><mo>−</mo><mn>1</mn></mrow></msup></math>`,

  bruto: `<math display="block"><mover accent="true"><mi>q</mi><mo>‾</mo></mover><mo>=</mo>
    <mfrac>
      <mrow><munderover><mo>∑</mo><mrow><mi>i</mi><mo>=</mo><mn>1</mn></mrow><mi>m</mi></munderover>
        <msub><mi>ω</mi><mi>i</mi></msub><mspace width="0.1em"/><msub><mi>q</mi><mi>i</mi></msub></mrow>
      <mrow><munderover><mo>∑</mo><mrow><mi>i</mi><mo>=</mo><mn>1</mn></mrow><mi>m</mi></munderover>
        <msub><mi>ω</mi><mi>i</mi></msub></mrow>
    </mfrac>
    <mo>,</mo><mspace width="0.6em"/>
    <mover accent="true"><mi>q</mi><mo>‾</mo></mover><mo>∈</mo>
    <mo stretchy="false">[</mo><mn>0</mn><mo>,</mo><mn>1</mn><mo stretchy="false">]</mo></math>`,

  contraccion: `<math display="block"><mi>κ</mi><mo stretchy="false">(</mo><mi>n</mi><mo stretchy="false">)</mo>
    <mo>=</mo><mfrac><mi>n</mi><mrow><mi>n</mi><mo>+</mo><mn>2</mn></mrow></mfrac></math>`,

  mastery: `<math display="block"><mi>M</mi><mo>=</mo><mn>100</mn><mo>·</mo>
    <mover accent="true"><mi>q</mi><mo>‾</mo></mover><mo>·</mo>
    <mi>κ</mi><mo stretchy="false">(</mo><mi>n</mi><mo stretchy="false">)</mo></math>`,

  completa: `<math display="block"><mi>M</mi><mo>=</mo><mn>100</mn><mo>·</mo>
    <mfrac>
      <mrow><munderover><mo>∑</mo><mrow><mi>i</mi><mo>=</mo><mn>1</mn></mrow><mi>m</mi></munderover>
        <mi>w</mi><mo stretchy="false">(</mo><msub><mi>d</mi><mi>i</mi></msub><mo stretchy="false">)</mo>
        <msup><mi>λ</mi><mrow><mi>i</mi><mo>−</mo><mn>1</mn></mrow></msup>
        <msub><mi>q</mi><mi>i</mi></msub></mrow>
      <mrow><munderover><mo>∑</mo><mrow><mi>i</mi><mo>=</mo><mn>1</mn></mrow><mi>m</mi></munderover>
        <mi>w</mi><mo stretchy="false">(</mo><msub><mi>d</mi><mi>i</mi></msub><mo stretchy="false">)</mo>
        <msup><mi>λ</mi><mrow><mi>i</mi><mo>−</mo><mn>1</mn></mrow></msup></mrow>
    </mfrac>
    <mo>·</mo><mfrac><mi>n</mi><mrow><mi>n</mi><mo>+</mo><mn>2</mn></mrow></mfrac></math>`,
};

const eq = (m, n) => `<div class="eq"><div class="eq__body">${m}</div><span class="eq__n">(${n})</span></div>`;

export const MASTERY_DOC = {
  /** Versión de una línea, en texto plano: cabeceras de CSV, avisos, consola. */
  formula: 'M = 100 · [Σ ωᵢ·qᵢ / Σ ωᵢ] · n/(n+2),  con ωᵢ = w(dᵢ)·λ^(i−1) y λ = 0,85',

  /** Explicación completa. Marcado propio, sin datos de usuario interpolados. */
  html: `
<p class="mathdoc__lead">El <b>mastery</b> resume en una escala de 0 a 100 la evidencia disponible de que
dominas <em>ahora mismo</em> un concepto. Mide el estado actual, no el histórico acumulado, y
por eso puede bajar si dejas de acertar lo que antes acertabas.</p>

<h4 class="mathdoc__h">Nomenclatura</h4>
<table class="mathdoc__t mathdoc__t--nom"><tbody>
<tr><th><math><mi>n</mi></math></th><td>número total de respuestas registradas en ese concepto</td></tr>
<tr><th><math><mi>N</mi><mo>=</mo><mn>12</mn></math></th><td>tamaño de la ventana: solo las respuestas más recientes pesan en la media</td></tr>
<tr><th><math><mi>m</mi><mo>=</mo><mi>mín</mi><mo stretchy="false">(</mo><mi>n</mi><mo>,</mo><mi>N</mi><mo stretchy="false">)</mo></math></th><td>respuestas que entran efectivamente en la media</td></tr>
<tr><th><math><mi>i</mi></math></th><td>índice de respuesta, ordenadas de reciente a antigua: <math><mi>i</mi><mo>=</mo><mn>1</mn></math> es la última</td></tr>
<tr><th><math><msub><mi>q</mi><mi>i</mi></msub><mo>∈</mo><mo stretchy="false">[</mo><mn>0</mn><mo>,</mo><mn>1</mn><mo stretchy="false">]</mo></math></th><td>calidad de la respuesta <math><mi>i</mi></math></td></tr>
<tr><th><math><msub><mi>d</mi><mi>i</mi></msub><mo>∈</mo><mo stretchy="false">{</mo><mn>1</mn><mo>,</mo><mn>2</mn><mo>,</mo><mn>3</mn><mo stretchy="false">}</mo></math></th><td>dificultad del ejercicio: fácil, media, difícil</td></tr>
<tr><th><math><mi>w</mi><mo stretchy="false">(</mo><mi>d</mi><mo stretchy="false">)</mo></math></th><td>peso por dificultad</td></tr>
<tr><th><math><mi>λ</mi><mo>=</mo><mn>0,85</mn></math></th><td>factor de decaimiento por recencia</td></tr>
<tr><th><math><msub><mi>ω</mi><mi>i</mi></msub></math></th><td>peso total de la respuesta <math><mi>i</mi></math></td></tr>
<tr><th><math><mover accent="true"><mi>q</mi><mo>‾</mo></mover></math></th><td>valor bruto: calidad media ponderada</td></tr>
<tr><th><math><mi>κ</mi><mo stretchy="false">(</mo><mi>n</mi><mo stretchy="false">)</mo></math></th><td>factor de contracción por falta de evidencia</td></tr>
<tr><th><math><mi>M</mi></math></th><td>mastery del concepto, entre 0 y 100</td></tr>
</tbody></table>

<h4 class="mathdoc__h">Definición</h4>
<p class="small">Cada respuesta recibe un peso que combina lo difícil que era el ejercicio y lo
reciente que es la respuesta:</p>
${eq(EQ.peso, 1)}
<p class="small">El valor bruto es la media de las calidades ponderada por esos pesos:</p>
${eq(EQ.bruto, 2)}
<p class="small">Y se contrae hacia cero cuando hay pocas respuestas, para que dos aciertos
sueltos no produzcan un 100:</p>
${eq(EQ.contraccion, 3)}
${eq(EQ.mastery, 4)}
<p class="small">Sustituyendo (1)–(3) en (4), la definición completa es:</p>
${eq(EQ.completa, 5)}
<p class="mathdoc__warn">Atención al detalle: la media (2) usa las <math><mi>m</mi></math> respuestas más
recientes, pero la contracción (3) usa <math><mi>n</mi></math>, el total histórico. Practicar de más
nunca resta: aumenta <math><mi>κ</mi></math> y acerca el mastery a su valor bruto.</p>

<h4 class="mathdoc__h">Calidad de la respuesta <math><msub><mi>q</mi><mi>i</mi></msub></math></h4>
<table class="mathdoc__t mathdoc__t--kv"><tbody>
<tr><th>Correcta a la primera, sin pistas</th><td>1,00</td></tr>
<tr><th>Correcta a la primera, con pista</th><td>0,85</td></tr>
<tr><th>Correcta en el segundo intento</th><td>0,70</td></tr>
<tr><th>Correcta tras tres o más intentos</th><td>0,40</td></tr>
<tr><th>Incorrecta</th><td>0,00</td></tr>
</tbody></table>
<p class="small">Con crédito parcial <math><mi>c</mi><mo>∈</mo><mo stretchy="false">(</mo><mn>0</mn><mo>,</mo><mn>1</mn><mo stretchy="false">)</mo></math>
—por ejemplo, clasificar bien 4 de 6— la calidad es el producto del crédito por el descuento anterior:
<math><msub><mi>q</mi><mi>i</mi></msub><mo>=</mo><mi>c</mi><mo>·</mo><msub><mi>q</mi><mtext>tabla</mtext></msub></math>.</p>

<h4 class="mathdoc__h">Peso por dificultad <math><mi>w</mi><mo stretchy="false">(</mo><mi>d</mi><mo stretchy="false">)</mo></math></h4>
<table class="mathdoc__t mathdoc__t--kv"><tbody>
<tr><th><math><mi>w</mi><mo stretchy="false">(</mo><mn>1</mn><mo stretchy="false">)</mo></math> fácil</th><td>1,0</td></tr>
<tr><th><math><mi>w</mi><mo stretchy="false">(</mo><mn>2</mn><mo stretchy="false">)</mo></math> media</th><td>1,3</td></tr>
<tr><th><math><mi>w</mi><mo stretchy="false">(</mo><mn>3</mn><mo stretchy="false">)</mo></math> difícil</th><td>1,6</td></tr>
</tbody></table>
<p class="small">Acertar un ejercicio difícil es más informativo sobre el dominio real que acertar uno fácil.</p>

<h4 class="mathdoc__h">Decaimiento por recencia <math><msup><mi>λ</mi><mrow><mi>i</mi><mo>−</mo><mn>1</mn></mrow></msup></math></h4>
<div class="mathdoc__scroll"><table class="mathdoc__t mathdoc__t--num"><thead><tr>
<th><math><mi>i</mi></math></th><td>1</td><td>2</td><td>3</td><td>4</td><td>6</td><td>11</td></tr></thead>
<tbody><tr><th>peso</th><td>1,00</td><td>0,85</td><td>0,72</td><td>0,61</td><td>0,44</td><td>0,20</td></tr></tbody></table></div>
<p class="small">Consecuencia buscada: un concepto que se dominaba hace tres meses y ahora se falla
<b>baja</b>; y uno que se falló al principio y ahora se acierta <b>sube</b>.</p>

<h4 class="mathdoc__h">Contracción <math><mi>κ</mi><mo stretchy="false">(</mo><mi>n</mi><mo stretchy="false">)</mo></math></h4>
<div class="mathdoc__scroll"><table class="mathdoc__t mathdoc__t--num"><thead><tr>
<th><math><mi>n</mi></math></th><td>1</td><td>2</td><td>5</td><td>10</td><td>20</td><td>50</td></tr></thead>
<tbody><tr><th><math><mi>κ</mi></math></th><td>0,33</td><td>0,50</td><td>0,71</td><td>0,83</td><td>0,91</td><td>0,96</td></tr></tbody></table></div>
<p class="small">Sin este factor, dos aciertos sueltos darían un 100 y el indicador no valdría nada.
El techo solo se alcanza con evidencia sostenida.</p>

<h4 class="mathdoc__h">Niveles</h4>
<table class="mathdoc__t mathdoc__t--kv"><tbody>
<tr><th><math><mn>0</mn><mo>≤</mo><mi>M</mi><mo>&lt;</mo><mn>40</mn></math></th><td>iniciando</td></tr>
<tr><th><math><mn>40</mn><mo>≤</mo><mi>M</mi><mo>&lt;</mo><mn>60</mn></math></th><td>en desarrollo</td></tr>
<tr><th><math><mn>60</mn><mo>≤</mo><mi>M</mi><mo>&lt;</mo><mn>80</mn></math></th><td>consolidando</td></tr>
<tr><th><math><mn>80</mn><mo>≤</mo><mi>M</mi><mo>≤</mo><mn>100</mn></math></th><td>dominado</td></tr>
</tbody></table>

<p class="mathdoc__note"><b>Lo que no es.</b> El mastery no es una calificación. Un
<math><mi>M</mi><mo>=</mo><mn>55</mn></math> no significa «un 5,5»: significa que hay evidencia
parcial de dominio y conviene seguir practicando.</p>`,
};
