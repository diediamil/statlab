/**
 * Tipo de actividad: construir la tabla diagnóstica 2×2.
 * El alumno coloca VP, FP, FN y VN y, si la actividad lo pide, calcula además
 * las métricas. Cada casilla y cada métrica puntúan por separado (crédito
 * parcial), y al corregir se muestra la fórmula con los números sustituidos:
 * el error casi siempre está en el DENOMINADOR.
 */
import { el } from '../../dom.js';
import { fmt, parseNum, round } from '../../utils.js';
import { diagnosticMetrics } from '../../stats/diagnostics.js';

const CELLS = [
  { key: 'tp', tag: 'VP', row: 0, col: 0, label: 'Verdaderos positivos' },
  { key: 'fp', tag: 'FP', row: 0, col: 1, label: 'Falsos positivos' },
  { key: 'fn', tag: 'FN', row: 1, col: 0, label: 'Falsos negativos' },
  { key: 'tn', tag: 'VN', row: 1, col: 1, label: 'Verdaderos negativos' },
];

const METRIC_DEFS = {
  sensitivity: { label: 'Sensibilidad', formula: (m) => `VP/(VP+FN) = ${m.tp}/${m.tp + m.fn}`, pct: true },
  specificity: { label: 'Especificidad', formula: (m) => `VN/(VN+FP) = ${m.tn}/${m.tn + m.fp}`, pct: true },
  ppv: { label: 'VPP', formula: (m) => `VP/(VP+FP) = ${m.tp}/${m.tp + m.fp}`, pct: true },
  npv: { label: 'VPN', formula: (m) => `VN/(VN+FN) = ${m.tn}/${m.tn + m.fn}`, pct: true },
  prevalence: { label: 'Prevalencia', formula: (m) => `(VP+FN)/total = ${m.tp + m.fn}/${m.total}`, pct: true },
  youden: { label: 'Índice de Youden', formula: () => 'S + E − 1', pct: false },
};

export function mount(host, item, ctx = {}) {
  const truth = item.answer || {};
  const inputs = {};
  const metricInputs = {};
  const ask = item.ask || [];

  const cellNode = (c) => {
    const input = el('input', {
      class: 'input', type: 'text', inputmode: 'numeric',
      'aria-label': c.label, id: `cell-${item.id || 'x'}-${c.key}`,
      onInput: () => ctx.onChange?.(),
    });
    inputs[c.key] = input;
    return el('td', {}, [
      el('div', { class: `cell cell--${c.key}` }, [
        el('span', { class: 'cell__tag', text: c.tag }),
        input,
      ]),
    ]);
  };

  const table = el('table', { class: 'tab2x2' }, [
    el('thead', {}, [
      el('tr', {}, [
        el('th', { class: 'cellhead', text: '' }),
        el('th', { class: 'cellhead', text: 'Enfermo (referencia +)' }),
        el('th', { class: 'cellhead', text: 'Sano (referencia −)' }),
      ]),
    ]),
    el('tbody', {}, [
      el('tr', {}, [el('th', { class: 'cellhead', text: 'Prueba +' }), cellNode(CELLS[0]), cellNode(CELLS[1])]),
      el('tr', {}, [el('th', { class: 'cellhead', text: 'Prueba −' }), cellNode(CELLS[2]), cellNode(CELLS[3])]),
    ]),
  ]);

  host.appendChild(el('div', { style: { overflowX: 'auto' } }, [table]));

  if (ask.length) {
    const grid = el('div', { class: 'grid grid--3', style: { marginTop: 'var(--s-5)' } });
    ask.forEach((k) => {
      const def = METRIC_DEFS[k];
      if (!def) return;
      const input = el('input', {
        class: 'input input--num', type: 'text', inputmode: 'decimal',
        'aria-label': def.label, placeholder: def.pct ? '%' : '',
        onInput: () => ctx.onChange?.(),
      });
      metricInputs[k] = input;
      grid.appendChild(el('label', { class: 'field', style: { marginBottom: 0 } }, [
        el('span', { class: 'field__label', text: def.label + (def.pct ? ' (%)' : '') }),
        input,
        el('span', { class: 'field__hint metric-why' }),
      ]));
    });
    host.appendChild(grid);
    host.appendChild(el('p', { class: 'xsmall muted', text: 'Introduce los porcentajes con un decimal. Se acepta un margen de ±1 punto.' }));
  }

  const expected = diagnosticMetrics(truth);

  return {
    read() {
      const cells = {};
      for (const c of CELLS) cells[c.key] = parseNum(inputs[c.key].value);
      const metrics = {};
      for (const k of ask) metrics[k] = parseNum(metricInputs[k].value);
      return { cells, metrics };
    },
    hasAnswer() {
      return CELLS.every((c) => Number.isFinite(parseNum(inputs[c.key].value)));
    },
    grade(answer) {
      let ok = 0;
      const cellOk = {};
      for (const c of CELLS) {
        cellOk[c.key] = answer.cells[c.key] === truth[c.key];
        if (cellOk[c.key]) ok++;
      }
      let metricOk = {};
      let mOk = 0;
      for (const k of ask) {
        const target = METRIC_DEFS[k].pct ? expected[k] * 100 : expected[k];
        metricOk[k] = Number.isFinite(answer.metrics[k]) && Math.abs(answer.metrics[k] - target) <= 1.0;
        if (metricOk[k]) mOk++;
      }
      const total = CELLS.length + ask.length;
      return { score: (ok + mOk) / total, chosen: answer, cellOk, metricOk };
    },
    mark(answer, grade) {
      for (const c of CELLS) {
        const box = inputs[c.key].parentElement;
        box.style.borderColor = grade.cellOk[c.key] ? 'var(--ok)' : 'var(--bad)';
        if (!grade.cellOk[c.key]) {
          box.appendChild(el('span', { class: 'xsmall', style: { color: 'var(--bad)' }, text: `→ ${truth[c.key]}` }));
        }
      }
      ask.forEach((k) => {
        const def = METRIC_DEFS[k];
        const target = def.pct ? expected[k] * 100 : expected[k];
        const hint = metricInputs[k].parentElement.querySelector('.metric-why');
        metricInputs[k].style.borderColor = grade.metricOk[k] ? 'var(--ok)' : 'var(--bad)';
        hint.textContent = `${def.formula(truth)} = ${fmt(target, 1)}${def.pct ? ' %' : ''}`;
      });
    },
    lock() {
      Object.values(inputs).forEach((i) => { i.disabled = true; });
      Object.values(metricInputs).forEach((i) => { i.disabled = true; });
    },
    reset() {
      Object.values(inputs).forEach((i) => {
        i.disabled = false; i.value = '';
        i.parentElement.style.borderColor = '';
        i.parentElement.querySelector('.xsmall')?.remove();
      });
      Object.values(metricInputs).forEach((i) => { i.disabled = false; i.value = ''; i.style.borderColor = ''; });
    },
    describeAnswer(answer) {
      return CELLS.map((c) => `${c.tag}=${answer.cells[c.key] ?? '—'}`).join(' · ');
    },
    describeCorrect() {
      return CELLS.map((c) => `${c.tag}=${truth[c.key]}`).join(' · ')
        + ` · S=${fmt(expected.sensitivity * 100, 1)} % · E=${fmt(expected.specificity * 100, 1)} %`
        + ` · VPP=${fmt(expected.ppv * 100, 1)} % · VPN=${fmt(expected.npv * 100, 1)} %`;
    },
    expected: { ...expected, rounded: round(expected.ppv, 4) },
  };
}
