/**
 * Laboratorio: MÁQUINA DE BAYES
 * ---------------------------------------------------------------------------
 * Tres mandos (sensibilidad, especificidad, prevalencia) y una población de
 * 1.000 personas dibujada punto por punto. Al bajar la prevalencia se ve
 * literalmente cómo los falsos positivos (amarillos) desbordan a los
 * verdaderos positivos (verdes), y el VPP se hunde.
 *
 * Es la forma más eficaz que conocemos de erradicar la confusión entre
 * sensibilidad y valor predictivo positivo.
 */

import { el, clear, replace } from '../js/dom.js';
import { fmt, fmtPct } from '../js/utils.js';
import { diagnosticMetrics, tableFromRates, screeningGuidance } from '../js/stats/diagnostics.js';
import { pictogram, legend } from '../js/viz.js';

export const meta = {
  id: 'bayes-machine',
  title: 'Máquina de Bayes',
  concepts: ['bayes', 'condicionada', 'vpp', 'vpn', 'prevalencia', 'sensibilidad', 'especificidad'],
  observation: 'Mueve solo la prevalencia y observa el VPP. Sensibilidad y especificidad NO cambian: son propiedades de '
    + 'la prueba. El VPP sí cambia, porque depende de cuántos enfermos había antes de hacer la prueba.',
};

export function mount(host, config = {}, api = {}) {
  const state = {
    sensitivity: config.sensitivity ?? 0.9,
    specificity: config.specificity ?? 0.95,
    prevalence: config.prevalence ?? 0.01,
    population: 1000,
  };

  const stage = el('div', { class: 'lab__stage' });
  const readout = el('div', { class: 'lab__readout' });
  const narrative = el('div');
  const controls = el('div', { class: 'lab__controls' });

  host.appendChild(el('div', { class: 'lab lab--split' }, [
    el('div', { class: 'stack' }, [stage, narrative]),
    el('div', { class: 'stack' }, [controls, readout]),
  ]));

  /* ------------------------------------------------------------ mandos -- */

  const slider = (label, key, min, max, step, format) => {
    const val = el('span', { class: 'slider-row__val' });
    const input = el('input', {
      class: 'range', type: 'range', min, max, step, value: state[key],
      'aria-label': label,
      onInput: (e) => { state[key] = Number(e.target.value); update(); },
    });
    const row = el('div', { class: 'slider-row' }, [
      el('div', { class: 'slider-row__top' }, [el('span', { text: label }), val]),
      input,
    ]);
    row.__set = () => { val.textContent = format(state[key]); input.value = state[key]; };
    return row;
  };

  const sSlider = slider('Sensibilidad', 'sensitivity', 0.5, 1, 0.01, (v) => fmtPct(v, 0));
  const eSlider = slider('Especificidad', 'specificity', 0.5, 1, 0.01, (v) => fmtPct(v, 0));
  const pSlider = slider('Prevalencia', 'prevalence', 0.001, 0.6, 0.001, (v) => fmtPct(v, 1));

  const presets = el('div', { class: 'lab-actions' }, [
    presetBtn('Cribado poblacional', { prevalence: 0.008, sensitivity: 0.92, specificity: 0.94 }),
    presetBtn('Consulta con síntomas', { prevalence: 0.35, sensitivity: 0.92, specificity: 0.94 }),
    presetBtn('Prueba excelente, enfermedad rara', { prevalence: 0.001, sensitivity: 0.99, specificity: 0.99 }),
  ]);

  function presetBtn(label, values) {
    return el('button', {
      type: 'button', class: 'btn btn--sm', text: label,
      onClick: () => { Object.assign(state, values); update(); },
    });
  }

  controls.appendChild(el('div', { class: 'stack' }, [sSlider, eSlider, pSlider]));
  controls.appendChild(el('div', {}, [el('p', { class: 'small strong', text: 'Escenarios' }), presets]));

  /* ---------------------------------------------------------- actualizar -- */

  function update() {
    [sSlider, eSlider, pSlider].forEach((s) => s.__set());

    const table = tableFromRates(state);
    const rounded = {
      tp: Math.round(table.tp), fp: Math.round(table.fp),
      fn: Math.round(table.fn), tn: Math.round(table.tn),
    };
    const m = diagnosticMetrics(rounded);

    replace(stage, [
      el('p', { class: 'chart-title', text: `Población de ${state.population} personas` }),
      pictogram([
        { n: rounded.tp, color: 'var(--data-2)', label: 'Verdaderos positivos (enfermos detectados)' },
        { n: rounded.fn, color: 'var(--data-4)', label: 'Falsos negativos (enfermos no detectados)' },
        { n: rounded.fp, color: 'var(--data-3)', label: 'Falsos positivos (sanos con prueba +)' },
        { n: rounded.tn, color: 'var(--surface-3)', label: 'Verdaderos negativos (sanos con prueba −)' },
      ], { cols: 40, cell: 12 }),
      legend([
        { color: 'var(--data-2)', label: `VP ${rounded.tp}` },
        { color: 'var(--data-4)', label: `FN ${rounded.fn}` },
        { color: 'var(--data-3)', label: `FP ${rounded.fp}` },
        { color: 'var(--surface-3)', label: `VN ${rounded.tn}` },
      ]),
    ]);

    replace(readout, [
      row('Prevalencia', fmtPct(m.prevalence, 2)),
      row('Sensibilidad', fmtPct(m.sensitivity, 1)),
      row('Especificidad', fmtPct(m.specificity, 1)),
      row('VPP  ·  P(enfermo | prueba +)', fmtPct(m.ppv, 1), true),
      row('VPN  ·  P(sano | prueba −)', fmtPct(m.npv, 1), true),
      row('Razón de verosimilitud +', fmt(m.lrPositive, 1)),
      row('Índice de Youden', fmt(m.youden, 2)),
      row('Positivos totales', String(rounded.tp + rounded.fp)),
    ]);

    const share = rounded.tp + rounded.fp ? rounded.fp / (rounded.tp + rounded.fp) : 0;
    const guide = state.prevalence < 0.05 ? screeningGuidance.screening : screeningGuidance.confirmation;
    replace(narrative, [
      el('div', { class: `callout ${share > 0.5 ? 'callout--warn' : 'callout--ok'}` }, [
        el('span', { class: 'callout__title', text: 'Lectura clínica' }),
        `De cada 100 resultados positivos, ${Math.round(share * 100)} son FALSOS. `
        + `Con una prevalencia del ${fmt(state.prevalence * 100, 2)} %, una persona con prueba positiva tiene `
        + `una probabilidad del ${fmt(m.ppv * 100, 1)} % de estar realmente enferma. `
        + 'La sensibilidad no responde a esa pregunta.',
      ]),
      el('div', { class: 'callout' }, [
        el('span', { class: 'callout__title', text: `Prioriza la ${guide.priority}` }),
        `${guide.why} ${guide.mnemonic}`,
      ]),
    ]);

    api.onState?.({ ...state, ppv: m.ppv, npv: m.npv });
  }

  function row(k, v, hl = false) {
    return el('div', { class: `readout${hl ? ' readout--hl' : ''}` }, [
      el('span', { class: 'readout__k', text: k }),
      el('span', { class: 'readout__v', text: v }),
    ]);
  }

  update();
  api.onFinish?.({ game: meta.id, score: null, concepts: meta.concepts, exploratory: true });
  return { destroy() { clear(host); }, state };
}
