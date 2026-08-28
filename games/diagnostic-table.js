/**
 * Minijuego: TABLA DIAGNÓSTICA
 * ---------------------------------------------------------------------------
 * Se narra un estudio de validez diagnóstica y hay que construir la tabla 2×2
 * y calcular las cuatro métricas. Al corregir se muestra cada fórmula con los
 * números sustituidos, porque el error casi siempre está en el DENOMINADOR
 * (dividir entre el total en lugar de entre la fila o la columna correcta).
 *
 * La última ronda incluye una curva ROC con punto de corte móvil, para conectar
 * el compromiso sensibilidad/especificidad con la elección del corte.
 */

import { el, clear, replace, announce } from '../js/dom.js';
import { fmt, fmtPct } from '../js/utils.js';
import { rngFor } from '../js/rng.js';
import { mount as mountTable } from '../js/engine/types/table2x2.js';
import { diagnosticMetrics, rocCurve, screeningGuidance, aucMeaning } from '../js/stats/diagnostics.js';
import { rocChart } from '../js/viz.js';

export const meta = {
  id: 'diagnostic-table',
  title: 'Tabla diagnóstica',
  concepts: ['vp-vn-fp-fn', 'sensibilidad', 'especificidad', 'vpp', 'vpn', 'prevalencia', 'roc', 'auc', 'youden', 'cribado-confirmacion'],
  observation: 'Sensibilidad y especificidad se calculan por COLUMNAS (entre los enfermos y entre los sanos): son '
    + 'propiedades de la prueba. VPP y VPN se calculan por FILAS (entre los positivos y entre los negativos): dependen '
    + 'de la prevalencia. El paciente pregunta por el VPP; el prospecto informa de la sensibilidad.',
};

const SCENARIOS = [
  {
    id: 'd1',
    text: 'Se evalúa una prueba rápida en 500 personas. La prueba de referencia identifica 100 enfermos. '
      + 'De ellos, la prueba rápida detecta 88. De los 400 sanos, la prueba rápida da negativo en 372.',
    truth: { tp: 88, fn: 12, tn: 372, fp: 28 },
  },
  {
    id: 'd2',
    text: 'Cribado en 2.000 personas con prevalencia del 3 %. La prueba tiene sensibilidad del 95 % y especificidad del 90 %. '
      + '(Calcula primero cuántos enfermos y sanos hay.)',
    truth: { tp: 57, fn: 3, tn: 1746, fp: 194 },
  },
  {
    id: 'd3',
    text: 'En una consulta especializada se estudian 300 pacientes con síntomas compatibles; 120 resultan enfermos según la '
      + 'prueba de referencia. La prueba a evaluar da positivo en 108 de los enfermos y en 27 de los sanos.',
    truth: { tp: 108, fn: 12, tn: 153, fp: 27 },
  },
  {
    id: 'd4',
    text: 'Prueba de detección precoz aplicada a 5.000 personas asintomáticas. Hay 25 casos reales. La prueba detecta 23 de '
      + 'ellos y da positivo además en 249 personas sanas.',
    truth: { tp: 23, fn: 2, tn: 4726, fp: 249 },
  },
  {
    id: 'd5',
    text: 'Se comparan dos umbrales de la misma prueba cuantitativa en 400 personas (80 enfermas). Con el umbral bajo se '
      + 'detectan 76 enfermos y hay 96 falsos positivos.',
    truth: { tp: 76, fn: 4, tn: 224, fp: 96 },
  },
];

export function mount(host, config = {}, api = {}) {
  const rng = rngFor(config.seed || `dt-${Date.now()}`);
  const deck = rng.shuffle(SCENARIOS).slice(0, config.rounds || 4);
  let idx = 0, scoreSum = 0;

  const wrap = el('div', { class: 'stack' });
  host.appendChild(wrap);

  function render() {
    clear(wrap);
    if (idx >= deck.length) return finishWithRoc();
    const sc = deck[idx];

    const item = {
      id: `dt-${sc.id}`, type: 'table2x2',
      answer: sc.truth,
      ask: ['sensitivity', 'specificity', 'ppv', 'npv'],
    };
    const answerHost = el('div');
    const feedback = el('div');
    const checkBtn = el('button', { type: 'button', class: 'btn btn--primary', text: 'Comprobar', disabled: true });
    const nextBtn = el('button', { type: 'button', class: 'btn btn--success', text: 'Siguiente caso', hidden: true });

    wrap.appendChild(el('div', { class: 'row row--between' }, [
      el('h3', { class: 'mb-0', text: `Caso ${idx + 1} de ${deck.length}` }),
      el('span', { class: 'badge', text: `${Math.round((scoreSum / Math.max(1, idx)) * 100)} % medio` }),
    ]));
    wrap.appendChild(el('div', { class: 'activity__stem', text: sc.text }));
    wrap.appendChild(answerHost);
    wrap.appendChild(feedback);
    wrap.appendChild(el('div', { class: 'row row--end' }, [checkBtn, nextBtn]));

    const ctrl = mountTable(answerHost, item, {
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

      const m = diagnosticMetrics(sc.truth);
      const fpShare = m.positives ? m.fp / m.positives : 0;
      clear(feedback);
      feedback.appendChild(el('div', {
        class: `feedback feedback--${grade.score >= 0.999 ? 'ok' : grade.score >= 0.5 ? 'partial' : 'bad'}`,
      }, [
        el('div', { class: 'feedback__verdict', text: `${Math.round(grade.score * 100)} % correcto` }),
        el('p', { class: 'feedback__what', text: ctrl.describeCorrect() }),
        el('p', { class: 'feedback__concept' }, [
          el('b', { text: 'Lectura clínica: ' }),
          `prevalencia ${fmtPct(m.prevalence, 1)}. De cada 100 positivos, ${Math.round(fpShare * 100)} son falsos. `
          + `Razón de verosimilitud positiva ${fmt(m.lrPositive, 1)}; índice de Youden ${fmt(m.youden, 2)}.`,
        ]),
      ]));
      api.onScore?.(grade.score, { game: meta.id, scenario: sc.id });
      announce(`${Math.round(grade.score * 100)} por ciento correcto`);
      nextBtn.focus();
    };
    nextBtn.onclick = () => { idx++; render(); };
  }

  /** Última pantalla: ROC interactiva. */
  function finishWithRoc() {
    clear(wrap);
    const avg = deck.length ? scoreSum / deck.length : 0;

    // Datos continuos simulados: enfermos con valores más altos
    const scores = [], labels = [];
    for (let i = 0; i < 120; i++) { scores.push(rng.normal(62, 12)); labels.push(false); }
    for (let i = 0; i < 60; i++) { scores.push(rng.normal(78, 13)); labels.push(true); }
    const roc = rocCurve(scores, labels);

    let cutoff = Math.round(roc.bestCutoff.threshold);
    const chartHost = el('div', { class: 'lab__stage' });
    const readout = el('div', { class: 'lab__readout' });

    const slider = el('input', {
      class: 'range', type: 'range', min: 40, max: 110, step: 1, value: cutoff,
      'aria-label': 'Punto de corte',
      onInput: (e) => { cutoff = Number(e.target.value); paintRoc(); },
    });

    function paintRoc() {
      const tp = scores.filter((s, i) => labels[i] && s >= cutoff).length;
      const fn = scores.filter((s, i) => labels[i] && s < cutoff).length;
      const fp = scores.filter((s, i) => !labels[i] && s >= cutoff).length;
      const tn = scores.filter((s, i) => !labels[i] && s < cutoff).length;
      const m = diagnosticMetrics({ tp, fp, fn, tn });
      replace(chartHost, [rocChart(roc)]);
      replace(readout, [
        rd('Punto de corte', String(cutoff), true),
        rd('Sensibilidad', fmtPct(m.sensitivity, 1)),
        rd('Especificidad', fmtPct(m.specificity, 1)),
        rd('VPP (prevalencia de la muestra)', fmtPct(m.ppv, 1)),
        rd('VPN', fmtPct(m.npv, 1)),
        rd('Índice de Youden', fmt(m.youden, 3)),
        rd('AUC (no depende del corte)', fmt(roc.auc, 3), true),
        rd('Corte de Youden óptimo', fmt(roc.bestCutoff.threshold, 0)),
      ]);
    }

    wrap.appendChild(el('div', { class: 'card stack' }, [
      el('h3', { text: 'Casos completados' }),
      el('p', { text: `Puntuación media: ${Math.round(avg * 100)} % en ${deck.length} casos.` }),
    ]));

    wrap.appendChild(el('h3', { text: 'Y ahora, el punto de corte' }));
    wrap.appendChild(el('p', { class: 'small muted', text: 'La misma prueba cuantitativa, distintos umbrales. Mueve el corte y observa el intercambio.' }));
    wrap.appendChild(el('div', { class: 'lab lab--split' }, [
      chartHost,
      el('div', { class: 'stack' }, [
        el('div', { class: 'slider-row' }, [
          el('div', { class: 'slider-row__top' }, [el('span', { text: 'Punto de corte' })]),
          slider,
        ]),
        readout,
      ]),
    ]));
    wrap.appendChild(el('div', { class: 'callout' }, [
      el('span', { class: 'callout__title', text: 'Qué significa la AUC' }), aucMeaning,
    ]));
    wrap.appendChild(el('div', { class: 'callout callout--warn' }, [
      el('span', { class: 'callout__title', text: 'No hay un corte «óptimo» universal' }),
      `${screeningGuidance.screening.why} ${screeningGuidance.screening.mnemonic} — `
      + `${screeningGuidance.confirmation.why} ${screeningGuidance.confirmation.mnemonic}`,
    ]));
    wrap.appendChild(el('div', { class: 'callout' }, [
      el('span', { class: 'callout__title', text: 'Qué llevarte' }), meta.observation,
    ]));

    paintRoc();
    api.onFinish?.({ game: meta.id, score: avg, total: deck.length, concepts: meta.concepts });
  }

  function rd(k, v, hl = false) {
    return el('div', { class: `readout${hl ? ' readout--hl' : ''}` }, [
      el('span', { class: 'readout__k', text: k }),
      el('span', { class: 'readout__v', text: v }),
    ]);
  }

  render();
  return { destroy() { clear(host); } };
}
