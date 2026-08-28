/**
 * Minijuego: ELIGE TU PRUEBA
 * ---------------------------------------------------------------------------
 * El minijuego central de STATLAB. Un escenario sanitario, y dos decisiones:
 * qué prueba usar y POR QUÉ. La justificación puntúa el 30 %, así que acertar
 * por eliminación no basta.
 *
 * En modo difícil (`hardMode`) el escenario no dice si los supuestos se
 * cumplen: hay que deducirlo de la descripción de los datos.
 */

import { el, clear, announce } from '../js/dom.js';
import { rngFor } from '../js/rng.js';
import { mount as mountDecision } from '../js/engine/types/decision.js';

export const meta = {
  id: 'choose-your-test',
  title: 'Elige tu prueba',
  concepts: ['parametrica-no', 'independientes-relacionadas', 'n-grupos', 'normalidad-supuesto',
    't-independiente', 't-pareada', 'anova', 'chi2', 'fisher', 'mann-whitney', 'wilcoxon', 'kruskal'],
  observation: 'El árbol de decisión completo: (1) tipo de la variable resultado; (2) número de grupos o momentos; '
    + '(3) independientes o relacionados; (4) supuestos. En ese orden, y nunca al revés.',
};

/** Catálogo de pruebas: siempre se ofrecen las mismas opciones, como en la vida real. */
const TESTS = [
  { id: 't-one-sample', text: 't de una muestra' },
  { id: 't-independent', text: 't de Student para muestras independientes (o Welch)' },
  { id: 't-paired', text: 't de Student para muestras relacionadas' },
  { id: 'anova', text: 'ANOVA de un factor' },
  { id: 'chi2', text: 'Chi-cuadrado de independencia' },
  { id: 'fisher', text: 'Prueba exacta de Fisher' },
  { id: 'mann-whitney', text: 'U de Mann–Whitney' },
  { id: 'wilcoxon', text: 'Wilcoxon de rangos con signo' },
  { id: 'kruskal', text: 'H de Kruskal–Wallis' },
  { id: 'pearson', text: 'Correlación de Pearson' },
  { id: 'spearman', text: 'Correlación de Spearman' },
  { id: 'regression', text: 'Regresión lineal simple' },
];

const WHY = {
  't-one-sample': 'Compara la media de UNA muestra con un valor de referencia conocido.',
  't-independent': 'Compara la media de DOS grupos independientes.',
  't-paired': 'Compara DOS medidas del mismo sujeto (o pares emparejados).',
  anova: 'Compara TRES O MÁS grupos independientes.',
  chi2: 'Asociación entre DOS variables cualitativas con frecuencias esperadas suficientes.',
  fisher: 'Como chi-cuadrado pero válida con frecuencias esperadas pequeñas.',
  'mann-whitney': 'Alternativa por rangos para DOS grupos independientes.',
  wilcoxon: 'Alternativa por rangos para DOS medidas relacionadas.',
  kruskal: 'Alternativa por rangos para TRES O MÁS grupos independientes.',
  pearson: 'Asociación LINEAL entre dos variables cuantitativas.',
  spearman: 'Asociación MONÓTONA; admite variables ordinales y resiste atípicos.',
  regression: 'Modelo predictivo de una variable cuantitativa a partir de otra.',
};

const JUSTIFICATIONS = [
  { id: 'j-quant', text: 'La variable resultado es cuantitativa' },
  { id: 'j-cat', text: 'La variable resultado es cualitativa' },
  { id: 'j-ordinal', text: 'La variable resultado es ordinal' },
  { id: 'j-indep', text: 'Los grupos son independientes' },
  { id: 'j-paired', text: 'Las medidas están emparejadas (mismo sujeto)' },
  { id: 'j-two', text: 'Se comparan exactamente dos grupos o momentos' },
  { id: 'j-three', text: 'Se comparan tres o más grupos' },
  { id: 'j-one', text: 'Hay una sola muestra frente a un valor de referencia' },
  { id: 'j-normal', text: 'La distribución es aproximadamente simétrica / normalidad razonable' },
  { id: 'j-skew', text: 'La distribución es muy asimétrica o hay valores extremos' },
  { id: 'j-smallcells', text: 'Hay frecuencias esperadas menores que 5' },
  { id: 'j-assoc', text: 'El objetivo es cuantificar una asociación, no comparar grupos' },
  { id: 'j-predict', text: 'El objetivo es predecir una variable a partir de otra' },
];

const SCENARIOS = [
  {
    id: 'sc1',
    text: 'Se comparan las horas de sueño (cuantitativa, distribución simétrica) entre estudiantes de Enfermería y de Medicina. n = 45 y n = 48, personas distintas.',
    answer: 't-independent',
    just: ['j-quant', 'j-indep', 'j-two', 'j-normal'],
  },
  {
    id: 'sc2',
    text: 'Se mide la fuerza de prensión (cuantitativa) en los MISMOS 30 pacientes antes y después de 12 semanas de entrenamiento. Las diferencias son razonablemente simétricas.',
    answer: 't-paired',
    just: ['j-quant', 'j-paired', 'j-two', 'j-normal'],
  },
  {
    id: 'sc3',
    text: 'Se comparan las puntuaciones de calidad de vida (cuantitativa) entre cuatro servicios hospitalarios distintos, con n ≈ 40 por servicio y distribuciones simétricas.',
    answer: 'anova',
    just: ['j-quant', 'j-indep', 'j-three', 'j-normal'],
  },
  {
    id: 'sc4',
    text: 'Se compara la proporción de complicaciones (sí/no) entre dos técnicas quirúrgicas. Tabla 2×2, todas las frecuencias esperadas por encima de 12.',
    answer: 'chi2',
    just: ['j-cat', 'j-indep', 'j-two'],
  },
  {
    id: 'sc5',
    text: 'Se compara la proporción de una complicación muy rara (2 casos frente a 0) entre dos grupos de 18 pacientes. Las frecuencias esperadas son menores que 2.',
    answer: 'fisher',
    just: ['j-cat', 'j-indep', 'j-two', 'j-smallcells'],
  },
  {
    id: 'sc6',
    text: 'Se comparan los días de estancia (recuento muy asimétrico: mayoría de 1–3 días y unos pocos de más de 40) entre dos hospitales independientes.',
    answer: 'mann-whitney',
    just: ['j-indep', 'j-two', 'j-skew'],
  },
  {
    id: 'sc7',
    text: 'Se compara el grado de dolor en escala ordinal (leve/moderado/intenso convertido a rangos) en los MISMOS 24 pacientes antes y después de una infiltración.',
    answer: 'wilcoxon',
    just: ['j-ordinal', 'j-paired', 'j-two', 'j-skew'],
  },
  {
    id: 'sc8',
    text: 'Se compara el número de caídas al año (recuento muy asimétrico) entre tres residencias independientes.',
    answer: 'kruskal',
    just: ['j-indep', 'j-three', 'j-skew'],
  },
  {
    id: 'sc9',
    text: 'Se quiere cuantificar la asociación entre el IMC y la presión sistólica (ambas cuantitativas, relación aproximadamente lineal, sin atípicos llamativos).',
    answer: 'pearson',
    just: ['j-quant', 'j-assoc', 'j-normal'],
  },
  {
    id: 'sc10',
    text: 'Se quiere cuantificar la asociación entre el estadio tumoral (ordinal: I–IV) y la puntuación de fatiga, con un par de valores extremos.',
    answer: 'spearman',
    just: ['j-ordinal', 'j-assoc', 'j-skew'],
  },
  {
    id: 'sc11',
    text: 'Se quiere PREDECIR la distancia caminada en 6 minutos a partir de la edad, y estimar cuántos metros se pierden por año.',
    answer: 'regression',
    just: ['j-quant', 'j-predict'],
  },
  {
    id: 'sc12',
    text: 'Se comprueba si la glucemia media de una muestra de 40 pacientes difiere del valor de referencia poblacional de 100 mg/dL.',
    answer: 't-one-sample',
    just: ['j-quant', 'j-one', 'j-normal'],
  },
];

export function mount(host, config = {}, api = {}) {
  const rng = rngFor(config.seed || `cyt-${Date.now()}`);
  const deck = rng.shuffle(SCENARIOS).slice(0, config.rounds || 8);
  let idx = 0, scoreSum = 0;

  const wrap = el('div', { class: 'stack' });
  host.appendChild(wrap);

  function render() {
    clear(wrap);
    if (idx >= deck.length) return finish();
    const sc = deck[idx];

    const item = {
      id: `cyt-${sc.id}`,
      type: 'decision',
      prompt: '¿Qué prueba estadística corresponde?',
      options: TESTS.map((tt) => ({ ...tt, why: WHY[tt.id] })),
      answer: sc.answer,
      justify: {
        prompt: '¿Por qué? Marca todas las razones que sostienen tu elección.',
        min: Math.min(3, sc.just.length),
        options: JUSTIFICATIONS.map((j) => ({ ...j, correct: sc.just.includes(j.id) })),
      },
    };

    const answerHost = el('div');
    const feedback = el('div');
    const checkBtn = el('button', { type: 'button', class: 'btn btn--primary', text: 'Comprobar', disabled: true });
    const nextBtn = el('button', { type: 'button', class: 'btn btn--success', text: 'Siguiente escenario', hidden: true });

    wrap.appendChild(el('div', { class: 'row row--between' }, [
      el('h3', { class: 'mb-0', text: `Escenario ${idx + 1} de ${deck.length}` }),
      el('span', { class: 'badge', text: `${Math.round((scoreSum / Math.max(1, idx)) * 100)} % medio` }),
    ]));
    wrap.appendChild(el('div', { class: 'activity__stem', text: sc.text }));
    wrap.appendChild(answerHost);
    wrap.appendChild(feedback);
    wrap.appendChild(el('div', { class: 'row row--end' }, [checkBtn, nextBtn]));

    const ctrl = mountDecision(answerHost, item, {
      onChange: () => { checkBtn.disabled = !ctrl.hasAnswer(); },
    });

    checkBtn.onclick = () => {
      const answer = ctrl.read();
      const grade = ctrl.grade(answer);
      ctrl.mark(answer, grade);
      ctrl.lock();
      scoreSum += grade.score;
      checkBtn.hidden = true;
      nextBtn.hidden = false;
      clear(feedback);
      feedback.appendChild(el('div', {
        class: `feedback feedback--${grade.score >= 0.999 ? 'ok' : grade.score >= 0.5 ? 'partial' : 'bad'}`,
      }, [
        el('div', { class: 'feedback__verdict', text: `${Math.round(grade.score * 100)} % del paso` }),
        el('p', { class: 'feedback__what' }, [
          el('b', { text: grade.primaryOk ? 'Prueba correcta. ' : 'Prueba incorrecta. ' }),
          `La adecuada es: ${TESTS.find((tt) => tt.id === sc.answer).text}. ${WHY[sc.answer]}`,
        ]),
        el('p', { class: 'feedback__concept', text: `Justificación: ${Math.round((grade.justScore ?? 0) * 100)} % de las razones válidas.` }),
      ]));
      api.onScore?.(grade.score, { game: meta.id, scenario: sc.id });
      announce(`${Math.round(grade.score * 100)} por ciento`);
      nextBtn.focus();
    };
    nextBtn.onclick = () => { idx++; render(); };
  }

  function finish() {
    clear(wrap);
    const avg = deck.length ? scoreSum / deck.length : 0;
    wrap.appendChild(el('div', { class: 'card stack' }, [
      el('h3', { text: 'Sesión completada' }),
      el('p', { text: `Puntuación media: ${Math.round(avg * 100)} % en ${deck.length} escenarios.` }),
      el('div', { class: 'callout' }, [el('span', { class: 'callout__title', text: 'El árbol de decisión' }), meta.observation]),
    ]));
    api.onFinish?.({ game: meta.id, score: avg, total: deck.length, concepts: meta.concepts });
  }

  render();
  return { destroy() { clear(host); } };
}
