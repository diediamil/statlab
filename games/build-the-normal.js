/**
 * Laboratorio: CONSTRUYE LA NORMAL
 * ---------------------------------------------------------------------------
 * Dos mandos (media y desviación típica) y dos límites móviles. Se ve al mismo
 * tiempo la curva, el área sombreada, las puntuaciones z de los límites y la
 * probabilidad exacta. El objetivo es que el alumno deje de necesitar la tabla:
 * si ve la curva, ve la probabilidad.
 *
 * Incluye el botón «regla 68–95–99,7» que coloca los límites en μ ± kσ para
 * comprobar que los porcentajes famosos no son magia, sino integración.
 */

import { el, clear, replace } from '../js/dom.js';
import { fmt, fmtPct } from '../js/utils.js';
import { normalPdf, normalCdf, empiricalRule, normalInv } from '../js/stats/distributions.js';
import { lineChart } from '../js/viz.js';

export const meta = {
  id: 'build-the-normal',
  title: 'Construye la normal',
  concepts: ['normal', 'puntuacion-z', 'regla-68-95', 'percentil-normal'],
  observation: 'Cambia solo la desviación típica: la curva se ensancha y se aplana, porque el área total siempre vale 1. '
    + 'Y observa que las puntuaciones z de los límites no cambian al mover la media si mueves los límites con ella.',
};

export function mount(host, config = {}, api = {}) {
  const ctx = config.context || { label: 'Colesterol total', unit: 'mg/dL', mu: 195, sd: 35, lo: 60, hi: 340 };
  const state = { mu: ctx.mu, sd: ctx.sd, a: ctx.mu - ctx.sd, b: ctx.mu + ctx.sd };

  const stage = el('div', { class: 'lab__stage' });
  const readout = el('div', { class: 'lab__readout' });
  const controls = el('div', { class: 'lab__controls' });
  const notes = el('div');

  host.appendChild(el('div', { class: 'lab lab--split' }, [
    el('div', { class: 'stack' }, [stage, notes]),
    el('div', { class: 'stack' }, [controls, readout]),
  ]));

  const muRow = staticSlider('Media (μ)', 'mu', ctx.lo + 20, ctx.hi - 20, 1, (v) => `${fmt(v, 0)} ${ctx.unit}`);
  const sdRow = staticSlider('Desviación típica (σ)', 'sd', Math.max(1, Math.round(ctx.sd / 4)), Math.round(ctx.sd * 2.2), 1, (v) => `${fmt(v, 0)} ${ctx.unit}`);
  const aRow = staticSlider('Límite inferior', 'a', ctx.lo, ctx.hi, 1, (v) => `${fmt(v, 0)} ${ctx.unit}`);
  const bRow = staticSlider('Límite superior', 'b', ctx.lo, ctx.hi, 1, (v) => `${fmt(v, 0)} ${ctx.unit}`);

  function staticSlider(label, key, min, max, step, fmtFn) {
    const val = el('span', { class: 'slider-row__val' });
    const input = el('input', {
      class: 'range', type: 'range', min, max, step, value: state[key], 'aria-label': label,
      onInput: (e) => { state[key] = Number(e.target.value); update(); },
    });
    const row = el('div', { class: 'slider-row' }, [
      el('div', { class: 'slider-row__top' }, [el('span', { text: label }), val]),
      input,
    ]);
    row.__set = () => { val.textContent = fmtFn(state[key]); input.value = state[key]; };
    return row;
  }

  const actions = el('div', { class: 'lab-actions' }, [
    el('button', { type: 'button', class: 'btn btn--sm', text: 'μ ± 1σ', onClick: () => setK(1) }),
    el('button', { type: 'button', class: 'btn btn--sm', text: 'μ ± 2σ', onClick: () => setK(2) }),
    el('button', { type: 'button', class: 'btn btn--sm', text: 'μ ± 3σ', onClick: () => setK(3) }),
    el('button', { type: 'button', class: 'btn btn--sm', text: 'Percentil 95', onClick: () => {
      state.a = Math.round(normalInv(0.95, state.mu, state.sd));
      state.b = ctx.hi; update();
    } }),
  ]);

  function setK(k) {
    state.a = Math.round(state.mu - k * state.sd);
    state.b = Math.round(state.mu + k * state.sd);
    update();
  }

  controls.appendChild(el('div', { class: 'stack' }, [muRow, sdRow, aRow, bRow]));
  controls.appendChild(el('div', {}, [el('p', { class: 'small strong', text: 'Atajos' }), actions]));

  function update() {
    [muRow, sdRow, aRow, bRow].forEach((r) => r.__set());
    const lo = Math.min(state.a, state.b), hi = Math.max(state.a, state.b);

    const pts = [];
    const xMin = ctx.lo, xMax = ctx.hi;
    for (let i = 0; i <= 300; i++) {
      const x = xMin + ((xMax - xMin) * i) / 300;
      pts.push({ x, y: normalPdf(x, state.mu, state.sd) });
    }
    const shaded = pts.filter((p) => p.x >= lo && p.x <= hi);
    const p = normalCdf(hi, state.mu, state.sd) - normalCdf(lo, state.mu, state.sd);

    replace(stage, [lineChart([{ name: 'Densidad', points: pts, color: 'var(--data-1)' }], {
      shade: [{ points: shaded, color: 'var(--data-1)', opacity: 0.32, label: 'área seleccionada' }],
      vLines: [
        { x: state.mu, color: 'var(--data-6)', label: 'μ' },
        { x: lo, color: 'var(--ink-3)', label: `${fmt(lo, 0)}`, labelOffset: 24 },
        { x: hi, color: 'var(--ink-3)', label: `${fmt(hi, 0)}`, labelOffset: 24 },
      ],
      xLabel: `${ctx.label} (${ctx.unit})`, yLabel: 'densidad',
      title: `Normal(μ = ${fmt(state.mu, 0)}, σ = ${fmt(state.sd, 0)})`,
      yMin: 0, yMax: normalPdf(state.mu, state.mu, Math.max(1, Math.round(ctx.sd / 4))) * 1.05,
      yFmt: (v) => v.toFixed(3).replace('.', ','),
    })]);

    const zA = (lo - state.mu) / state.sd;
    const zB = (hi - state.mu) / state.sd;

    replace(readout, [
      rd('P(a ≤ X ≤ b)', fmtPct(p, 2), true),
      rd('z del límite inferior', fmt(zA, 2)),
      rd('z del límite superior', fmt(zB, 2)),
      rd('P(X < a)', fmtPct(normalCdf(lo, state.mu, state.sd), 2)),
      rd('P(X > b)', fmtPct(1 - normalCdf(hi, state.mu, state.sd), 2)),
      rd('Percentil de a', fmt(normalCdf(lo, state.mu, state.sd) * 100, 1)),
      rd('Percentil de b', fmt(normalCdf(hi, state.mu, state.sd) * 100, 1)),
      rd('Densidad máxima (en μ)', fmt(normalPdf(state.mu, state.mu, state.sd), 4)),
    ]);

    const rule = empiricalRule(state.mu, state.sd);
    replace(notes, [
      el('div', { class: 'callout' }, [
        el('span', { class: 'callout__title', text: 'Regla 68–95–99,7 calculada, no memorizada' }),
        rule.map((r) => `μ ± ${r.k}σ = [${fmt(r.from, 0)}; ${fmt(r.to, 0)}] → ${fmt(r.p * 100, 2)} %`).join(' · '),
      ]),
      el('div', { class: 'callout callout--warn' }, [
        el('span', { class: 'callout__title', text: 'Aviso' }),
        'Todo esto vale SOLO si la variable es aproximadamente normal. Aplicarlo a una variable claramente '
        + 'asimétrica (tiempos de espera, estancias, costes) da resultados sin sentido.',
      ]),
    ]);

    api.onState?.({ ...state, p });
  }

  function rd(k, v, hl = false) {
    return el('div', { class: `readout${hl ? ' readout--hl' : ''}` }, [
      el('span', { class: 'readout__k', text: k }),
      el('span', { class: 'readout__v', text: v }),
    ]);
  }

  update();
  api.onFinish?.({ game: meta.id, score: null, concepts: meta.concepts, exploratory: true });
  return { destroy() { clear(host); }, state };
}
