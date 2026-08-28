/**
 * Laboratorio: SIMULADOR DE MUESTREO
 * ---------------------------------------------------------------------------
 * Dos modos en un solo laboratorio:
 *
 *  · TCL: elige la forma de la población, el tamaño de muestra y el número de
 *    repeticiones. Se dibujan la población y la distribución de las medias, y
 *    se comparan el error estándar observado y el teórico σ/√n. La lección se
 *    ve sola: la población NO cambia, la distribución de las medias sí.
 *
 *  · Cobertura de intervalos: se construyen 100 intervalos de confianza del
 *    95 % y se cuenta cuántos contienen la media verdadera. Es la mejor
 *    definición operativa de «95 % de confianza» que existe, y desmonta la
 *    lectura incorrecta («hay un 95 % de probabilidad de que μ esté aquí»).
 */

import { el, clear, replace } from '../js/dom.js';
import { fmt, fmtPct } from '../js/utils.js';
import { RNG } from '../js/rng.js';
import { mean, sd } from '../js/stats/descriptive.js';
import { makePopulation, POPULATION_KINDS, samplingDistribution, coverageSimulation, cltGuidance, seMean } from '../js/stats/sampling.js';
import { histogram } from '../js/viz.js';
import { svgEl as _svg } from '../js/dom.js';

export const meta = {
  id: 'sampling-simulator',
  title: 'Simulador de muestreo',
  concepts: ['tcl', 'error-estandar', 'distribucion-muestral', 'variabilidad-muestral', 'tamano-muestra', 'ic', 'nivel-confianza'],
  observation: 'Tres cosas a la vez: al aumentar n la distribución de las medias se ESTRECHA (σ/√n), se hace más SIMÉTRICA '
    + '(TCL) y su centro sigue siendo la media de la población. La población de partida no cambia nunca.',
};

export function mount(host, config = {}, api = {}) {
  const state = {
    mode: config.mode || 'clt',
    kind: config.population || 'skewed',
    n: config.n || 10,
    reps: 500,
    conf: config.conf || 0.95,
    seed: 1,
  };

  let population = makePopulation(state.kind, 5000, new RNG(7));

  const stagePop = el('div', { class: 'lab__stage' });
  const stageSamp = el('div', { class: 'lab__stage' });
  const readout = el('div', { class: 'lab__readout' });
  const controls = el('div', { class: 'lab__controls' });
  const notes = el('div');

  host.appendChild(el('div', { class: 'lab lab--split' }, [
    el('div', { class: 'stack' }, [stagePop, stageSamp, notes]),
    el('div', { class: 'stack' }, [controls, readout]),
  ]));

  /* ------------------------------------------------------------- mandos -- */

  const modeSel = el('select', {
    class: 'select', 'aria-label': 'Modo',
    onChange: (e) => { state.mode = e.target.value; render(); },
  }, [
    el('option', { value: 'clt', text: 'Teorema Central del Límite' }),
    el('option', { value: 'coverage', text: 'Cobertura de intervalos de confianza' }),
  ]);
  modeSel.value = state.mode;

  const popSel = el('select', {
    class: 'select', 'aria-label': 'Forma de la población',
    onChange: (e) => {
      state.kind = e.target.value;
      population = makePopulation(state.kind, 5000, new RNG(7));
      render();
    },
  }, POPULATION_KINDS.map((k) => el('option', { value: k.id, text: k.label })));
  popSel.value = state.kind;

  const nRow = sliderRow('Tamaño de cada muestra (n)', 'n', 2, 120, 1, (v) => String(v));
  const repsRow = sliderRow('Número de muestras', 'reps', 50, 3000, 50, (v) => String(v));

  function sliderRow(label, key, min, max, step, fmtFn) {
    const val = el('span', { class: 'slider-row__val' });
    const input = el('input', {
      class: 'range', type: 'range', min, max, step, value: state[key], 'aria-label': label,
      onInput: (e) => { state[key] = Number(e.target.value); render(); },
    });
    const row = el('div', { class: 'slider-row' }, [
      el('div', { class: 'slider-row__top' }, [el('span', { text: label }), val]),
      input,
    ]);
    row.__set = () => { val.textContent = fmtFn(state[key]); input.value = state[key]; };
    return row;
  }

  const actions = el('div', { class: 'lab-actions' }, [
    el('button', { type: 'button', class: 'btn btn--sm btn--primary', text: 'Volver a simular', onClick: () => { state.seed++; render(); } }),
    el('button', { type: 'button', class: 'btn btn--sm', text: 'n = 5', onClick: () => { state.n = 5; render(); } }),
    el('button', { type: 'button', class: 'btn btn--sm', text: 'n = 30', onClick: () => { state.n = 30; render(); } }),
    el('button', { type: 'button', class: 'btn btn--sm', text: 'n = 100', onClick: () => { state.n = 100; render(); } }),
  ]);

  controls.appendChild(el('label', { class: 'field' }, [
    el('span', { class: 'field__label', text: 'Modo' }), modeSel,
  ]));
  controls.appendChild(el('label', { class: 'field' }, [
    el('span', { class: 'field__label', text: 'Forma de la población' }), popSel,
    el('span', { class: 'field__hint', id: 'popHint' }),
  ]));
  controls.appendChild(el('div', { class: 'stack' }, [nRow, repsRow]));
  controls.appendChild(actions);

  /* ----------------------------------------------------------- pintado -- */

  function render() {
    nRow.__set(); repsRow.__set();
    const hint = POPULATION_KINDS.find((k) => k.id === state.kind)?.hint || '';
    const hintNode = controls.querySelector('#popHint');
    if (hintNode) hintNode.textContent = hint;
    repsRow.hidden = state.mode === 'coverage';

    const muPop = mean(population), sdPop = sd(population);

    replace(stagePop, [
      el('p', { class: 'chart-title', text: `Población (5.000 individuos) — μ = ${fmt(muPop, 2)}, σ = ${fmt(sdPop, 2)}` }),
      histogram(population, { xLabel: 'valor del individuo', yLabel: 'frecuencia', nBins: 30, color: 'var(--data-8)', h: 240 }),
      el('p', { class: 'chart-note', text: 'Esta distribución NO cambia al muestrear. Es la población de partida.' }),
    ]);

    if (state.mode === 'clt') renderClt(muPop, sdPop);
    else renderCoverage(muPop);
  }

  function renderClt(muPop, sdPop) {
    const rng = new RNG(1000 + state.seed);
    const dist = samplingDistribution(population, state.n, state.reps, rng);

    replace(stageSamp, [
      el('p', { class: 'chart-title', text: `Distribución de las MEDIAS de ${state.reps} muestras de tamaño n = ${state.n}` }),
      histogram(dist.means, {
        xLabel: 'media de la muestra', yLabel: 'frecuencia', nBins: 28, color: 'var(--data-1)', h: 260,
        xMin: muPop - 4 * sdPop, xMax: muPop + 4 * sdPop,
        overlayNormal: { mu: dist.mean, sd: dist.sd },
        markMean: true,
      }),
      el('p', { class: 'chart-note', text: 'La curva discontinua es la normal teórica. Fíjate en que el eje X abarca el mismo rango que la población: las medias se concentran mucho más.' }),
    ]);

    replace(readout, [
      rd('Media de la población (μ)', fmt(muPop, 3)),
      rd('Media de las medias', fmt(dist.mean, 3), true),
      rd('σ de la población', fmt(sdPop, 3)),
      rd('SD observada de las medias', fmt(dist.sd, 3), true),
      rd('SE teórico (σ/√n)', fmt(dist.theoreticalSe, 3), true),
      rd('Cociente observado / teórico', fmt(dist.sd / dist.theoreticalSe, 3)),
      rd('SE si n se cuadruplicara', fmt(seMean(sdPop, state.n * 4), 3)),
    ]);

    const g = cltGuidance(state.kind, state.n);
    replace(notes, [
      el('div', { class: `callout ${g.ok ? 'callout--ok' : 'callout--warn'}` }, [
        el('span', { class: 'callout__title', text: g.ok ? 'La aproximación normal es razonable' : 'La aproximación normal todavía no es buena' }),
        `${g.text} ${g.caveat}`,
      ]),
      el('div', { class: 'callout' }, [
        el('span', { class: 'callout__title', text: 'La confusión que hay que evitar' }),
        `La desviación típica de la población es ${fmt(sdPop, 2)}: describe a los INDIVIDUOS. `
        + `El error estándar es ${fmt(dist.theoreticalSe, 2)}: describe a las MEDIAS. `
        + 'No son medidas alternativas de lo mismo: describen objetos distintos.',
      ]),
    ]);

    api.onScore?.(state.reps, { game: meta.id, n: state.n, kind: state.kind });
    api.onState?.({ ...state, seObserved: dist.sd, seTheoretical: dist.theoreticalSe });
  }

  function renderCoverage(muPop) {
    const rng = new RNG(2000 + state.seed);
    const sim = coverageSimulation(population, state.n, 100, state.conf, rng);

    // Gráfico de los 100 intervalos
    const w = 560, h = 420, ml = 40, mr = 12, mt = 22, mb = 34;
    const all = sim.intervals.flatMap((i) => [i.lo, i.hi]);
    const lo = Math.min(...all), hi = Math.max(...all);
    const sx = (v) => ml + ((v - lo) / (hi - lo)) * (w - ml - mr);
    const sy = (i) => mt + (i * (h - mt - mb)) / sim.intervals.length;

    const svg = _svg('svg', {
      viewBox: `0 0 ${w} ${h}`, role: 'img', style: 'width:100%;height:auto',
      'aria-label': `Cien intervalos de confianza del ${state.conf * 100} %. ${sim.covered} contienen la media verdadera.`,
    });
    svg.appendChild(_svg('line', {
      x1: sx(muPop), x2: sx(muPop), y1: mt - 6, y2: h - mb,
      stroke: 'var(--data-6)', 'stroke-width': 2,
    }));
    svg.appendChild(_svg('text', {
      x: sx(muPop), y: mt - 9, 'text-anchor': 'middle', 'font-size': 11, 'font-weight': 700,
      fill: 'var(--data-6)', text: `μ = ${fmt(muPop, 2)}`,
    }));
    sim.intervals.forEach((iv, i) => {
      svg.appendChild(_svg('line', {
        x1: sx(iv.lo), x2: sx(iv.hi), y1: sy(i), y2: sy(i),
        stroke: iv.ok ? 'var(--data-2)' : 'var(--bad)', 'stroke-width': iv.ok ? 2 : 2.6,
        opacity: iv.ok ? 0.75 : 1,
      }));
      svg.appendChild(_svg('circle', { cx: sx(iv.mean), cy: sy(i), r: 1.8, fill: 'var(--ink-3)' }));
    });
    [lo, (lo + hi) / 2, hi].forEach((v) => {
      svg.appendChild(_svg('text', {
        x: sx(v), y: h - 12, 'text-anchor': 'middle', 'font-size': 10, fill: 'var(--ink-3)', text: fmt(v, 1),
      }));
    });

    replace(stageSamp, [
      el('p', { class: 'chart-title', text: `100 intervalos de confianza del ${state.conf * 100} % (n = ${state.n})` }),
      svg,
      el('p', { class: 'chart-note', text: 'Cada línea es una muestra distinta. En rojo, los intervalos que NO contienen la media verdadera.' }),
    ]);

    replace(readout, [
      rd('Nivel de confianza nominal', fmtPct(state.conf, 0)),
      rd('Intervalos que contienen μ', `${sim.covered} de 100`, true),
      rd('Cobertura observada', fmtPct(sim.coverage, 0), true),
      rd('Media verdadera (μ)', fmt(muPop, 3)),
      rd('Tamaño de cada muestra', String(state.n)),
    ]);

    replace(notes, [
      el('div', { class: 'callout callout--ok' }, [
        el('span', { class: 'callout__title', text: 'Qué significa «95 % de confianza»' }),
        `De estos 100 intervalos, ${sim.covered} contienen la media verdadera y ${100 - sim.covered} no. `
        + 'Eso ES el 95 % de confianza: una propiedad del PROCEDIMIENTO repetido. '
        + 'Ante un intervalo concreto ya calculado no se puede decir «hay un 95 % de probabilidad de que μ esté aquí»: '
        + 'μ es un valor fijo, y este intervalo concreto lo contiene o no lo contiene.',
      ]),
      el('div', { class: 'callout' }, [
        el('span', { class: 'callout__title', text: 'Prueba a cambiar n' }),
        'Al aumentar n los intervalos se vuelven más estrechos, pero la proporción de fallos se mantiene alrededor '
        + 'del 5 %. Más datos dan más PRECISIÓN, no más confianza.',
      ]),
    ]);

    api.onScore?.(100, { game: meta.id, mode: 'coverage', n: state.n });
    api.onState?.({ ...state, coverage: sim.coverage });
  }

  function rd(k, v, hl = false) {
    return el('div', { class: `readout${hl ? ' readout--hl' : ''}` }, [
      el('span', { class: 'readout__k', text: k }),
      el('span', { class: 'readout__v', text: v }),
    ]);
  }

  render();
  api.onFinish?.({ game: meta.id, score: null, concepts: meta.concepts, exploratory: true });
  return { destroy() { clear(host); }, state };
}
