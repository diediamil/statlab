/**
 * Minijuego: CLASIFICADOR DE VARIABLES
 * ---------------------------------------------------------------------------
 * Rondas de arrastre: variables sanitarias reales que hay que colocar en su
 * tipo. Es el minijuego más básico y el más rentable: casi todos los errores
 * de elección de prueba estadística nacen de una clasificación equivocada.
 *
 * Accesible: además del arrastre, cada ficha se puede seleccionar con el
 * teclado y soltar pulsando 1–4 o Intro sobre la categoría.
 */

import { el, clear, announce } from '../js/dom.js';
import { rngFor } from '../js/rng.js';
import { mount as mountClassify } from '../js/engine/types/classify.js';

const BANK = [
  { text: 'Grupo sanguíneo (A, B, AB, 0)', bin: 'nominal' },
  { text: 'Servicio de ingreso hospitalario', bin: 'nominal' },
  { text: 'Presencia de alergia (sí / no)', bin: 'nominal' },
  { text: 'Tipo de parto (eutócico / instrumental / cesárea)', bin: 'nominal' },
  { text: 'Lateralidad de la lesión (derecha / izquierda)', bin: 'nominal' },
  { text: 'Método anticonceptivo utilizado', bin: 'nominal' },
  { text: 'Sexo codificado como 1 = mujer, 2 = hombre', bin: 'nominal' },
  { text: 'Estadio tumoral (I, II, III, IV)', bin: 'ordinal' },
  { text: 'Grado de disnea (leve / moderada / grave)', bin: 'ordinal' },
  { text: 'Clasificación ASA (I a V)', bin: 'ordinal' },
  { text: 'Nivel de estudios (primarios / secundarios / universitarios)', bin: 'ordinal' },
  { text: 'Escala de Likert de satisfacción (1 a 5)', bin: 'ordinal' },
  { text: 'Grado de úlcera por presión (I a IV)', bin: 'ordinal' },
  { text: 'Número de caídas en el último año', bin: 'discreta' },
  { text: 'Número de fármacos prescritos', bin: 'discreta' },
  { text: 'Sesiones de rehabilitación completadas', bin: 'discreta' },
  { text: 'Número de ingresos previos', bin: 'discreta' },
  { text: 'Recuento de plaquetas por microlitro', bin: 'discreta' },
  { text: 'Número de hijos', bin: 'discreta' },
  { text: 'Peso corporal en kilogramos', bin: 'continua' },
  { text: 'Temperatura corporal en grados Celsius', bin: 'continua' },
  { text: 'Distancia caminada en 6 minutos (metros)', bin: 'continua' },
  { text: 'Tiempo de reacción en milisegundos', bin: 'continua' },
  { text: 'Concentración de hemoglobina (g/dL)', bin: 'continua' },
  { text: 'Saturación de oxígeno (%)', bin: 'continua' },
  { text: 'Presión arterial sistólica (mmHg)', bin: 'continua' },
];

const BINS = [
  { id: 'nominal', title: '1 · Cualitativa nominal', desc: 'Categorías sin orden' },
  { id: 'ordinal', title: '2 · Cualitativa ordinal', desc: 'Categorías con orden' },
  { id: 'discreta', title: '3 · Cuantitativa discreta', desc: 'Recuentos' },
  { id: 'continua', title: '4 · Cuantitativa continua', desc: 'Mediciones' },
];

export const meta = {
  id: 'variable-classifier',
  title: 'Clasificador de variables',
  concepts: ['cualitativa', 'cuantitativa', 'nominal-ordinal', 'discreta-continua', 'tipo-variable-analisis'],
  observation: 'Fíjate en el patrón: «número de…» casi siempre es discreta; una escala con orden pero sin distancias '
    + 'comparables es ordinal; y codificar con números NO convierte una variable en cuantitativa.',
};

export function mount(host, config = {}, api = {}) {
  const perRound = config.itemsPerRound || 6;
  const rounds = config.rounds || 3;
  const rng = rngFor(config.seed || `vc-${Date.now()}`);

  let round = 0;
  let totalOk = 0, totalItems = 0;
  const wrap = el('div', { class: 'stack' });
  host.appendChild(wrap);

  function nextRound() {
    clear(wrap);
    round++;
    if (round > rounds) return finish();

    // Muestra equilibrada: al menos una de cada tipo
    const picks = [];
    for (const b of BINS) {
      const pool = BANK.filter((x) => x.bin === b.id);
      picks.push(rng.pick(pool));
    }
    while (picks.length < perRound) {
      const cand = rng.pick(BANK);
      if (!picks.includes(cand)) picks.push(cand);
    }
    const items = rng.shuffle(picks).map((p, i) => ({ id: `i${i}`, text: p.text, bin: p.bin }));

    const item = { id: `vc-r${round}`, type: 'classify', bins: BINS, items };
    const answerHost = el('div');

    const checkBtn = el('button', { type: 'button', class: 'btn btn--primary', text: 'Comprobar', disabled: true });
    const nextBtn = el('button', { type: 'button', class: 'btn btn--success', text: 'Siguiente ronda', hidden: true });
    const feedback = el('div');

    wrap.appendChild(el('div', { class: 'row row--between' }, [
      el('h3', { class: 'mb-0', text: `Ronda ${round} de ${rounds}` }),
      el('span', { class: 'badge', text: `${totalOk}/${totalItems} aciertos` }),
    ]));
    wrap.appendChild(answerHost);
    wrap.appendChild(feedback);
    wrap.appendChild(el('div', { class: 'row row--end' }, [checkBtn, nextBtn]));

    const ctrl = mountClassify(answerHost, item, {
      onChange: () => { checkBtn.disabled = !ctrl.hasAnswer(); },
    });

    checkBtn.onclick = () => {
      const answer = ctrl.read();
      const grade = ctrl.grade(answer);
      ctrl.mark(answer);
      ctrl.lock();
      const ok = Math.round(grade.score * items.length);
      totalOk += ok;
      totalItems += items.length;
      checkBtn.hidden = true;
      nextBtn.hidden = false;
      clear(feedback);
      feedback.appendChild(el('div', {
        class: `feedback feedback--${grade.score >= 0.999 ? 'ok' : grade.score >= 0.5 ? 'partial' : 'bad'}`,
      }, [
        el('div', { class: 'feedback__verdict', text: `${ok} de ${items.length} correctas` }),
        el('p', { class: 'feedback__what mb-0', text: grade.score >= 0.999
          ? 'Ronda perfecta. Las cuatro categorías están claras.'
          : 'Revisa las fichas marcadas en rojo: la flecha indica dónde debían ir.' }),
      ]));
      api.onScore?.(ok, { game: meta.id, round, of: items.length });
      announce(`${ok} de ${items.length} correctas.`);
      nextBtn.focus();
    };

    nextBtn.onclick = nextRound;
  }

  function finish() {
    clear(wrap);
    const pct = totalItems ? totalOk / totalItems : 0;
    wrap.appendChild(el('div', { class: 'card stack' }, [
      el('h3', { text: 'Clasificador completado' }),
      el('p', { text: `Has colocado correctamente ${totalOk} de ${totalItems} variables (${Math.round(pct * 100)} %).` }),
      el('div', { class: 'callout' }, [el('span', { class: 'callout__title', text: 'Qué llevarte' }), meta.observation]),
    ]));
    api.onFinish?.({ game: meta.id, score: pct, correct: totalOk, total: totalItems, concepts: meta.concepts });
  }

  nextRound();
  return { destroy() { clear(host); } };
}
