/**
 * Laboratorio: LABORATORIO DE REGRESIÓN
 * ---------------------------------------------------------------------------
 * Dos capas de aprendizaje:
 *
 *  1. AJUSTA LA RECTA A MANO con dos mandos (intercepto y pendiente) y mira la
 *     suma de cuadrados de los residuos. Después pulsa «mínimos cuadrados» y
 *     comprueba que ninguna recta consigue una SSE menor. Así se entiende qué
 *     significa «mínimos cuadrados» sin una sola derivada.
 *
 *  2. MUEVE LOS PUNTOS y observa cómo cambian pendiente, intercepto, R² y los
 *     puntos influyentes. La diferencia entre «residuo grande» y «punto
 *     influyente» se ve inmediatamente al arrastrar un punto en el extremo del
 *     rango de x.
 *
 * También muestra explícitamente que la regresión NO es simétrica: el botón
 * «intercambiar ejes» da una recta distinta, mientras que r no cambia.
 */

import { el, clear, replace } from '../js/dom.js';
import { fmt, fmtP } from '../js/utils.js';
import { rngFor } from '../js/rng.js';
import { linearRegression, sseFor, influentialPoints } from '../js/stats/regression.js';
import { scatter } from '../js/viz.js';
import { attachDrag } from './correlation-lab.js';

export const meta = {
  id: 'regression-lab',
  title: 'Laboratorio de regresión',
  concepts: ['modelo-lineal', 'pendiente', 'intercepto', 'residuos', 'minimos-cuadrados', 'r2',
    'outliers-regresion', 'prediccion', 'extrapolacion', 'dependiente-independiente'],
  observation: 'Mínimos cuadrados minimiza la suma de los residuos VERTICALES al cuadrado, no las distancias '
    + 'perpendiculares. Y fíjate en que un punto en el extremo del rango de x mueve la recta muchísimo más que '
    + 'uno en el centro, aunque su residuo sea parecido: eso es apalancamiento.',
};

export function mount(host, config = {}, api = {}) {
  const ctx = config.context || {
    xLabel: 'Edad (años)', yLabel: 'Distancia en 6 minutos (m)',
    xMin: 60, xMax: 92, yMin: 200, yMax: 620,
  };
  const n = config.n || 14;
  let points = makePoints(n, ctx, config.seed || 'reg-1');
  const manual = { intercept: (ctx.yMin + ctx.yMax) / 2, slope: 0 };
  let showResiduals = config.showResiduals ?? true;
  let showManual = true;
  let predictX = Math.round((ctx.xMin + ctx.xMax) / 2);

  const stage = el('div', { class: 'lab__stage' });
  const readout = el('div', { class: 'lab__readout' });
  const controls = el('div', { class: 'lab__controls' });
  const notes = el('div');

  host.appendChild(el('div', { class: 'lab lab--split' }, [
    el('div', { class: 'stack' }, [stage, notes]),
    el('div', { class: 'stack' }, [controls, readout]),
  ]));

  const bRow = sliderRow('Intercepto (b₀) de tu recta', 'intercept', ctx.yMin - 300, ctx.yMax + 300, 5, (v) => fmt(v, 0));
  const mRow = sliderRow('Pendiente (b₁) de tu recta', 'slope', -25, 25, 0.1, (v) => fmt(v, 1));

  function sliderRow(label, key, min, max, step, fmtFn) {
    const val = el('span', { class: 'slider-row__val' });
    const input = el('input', {
      class: 'range', type: 'range', min, max, step, value: manual[key], 'aria-label': label,
      onInput: (e) => { manual[key] = Number(e.target.value); showManual = true; render(); },
    });
    const row = el('div', { class: 'slider-row' }, [
      el('div', { class: 'slider-row__top' }, [el('span', { text: label }), val]),
      input,
    ]);
    row.__set = () => { val.textContent = fmtFn(manual[key]); input.value = manual[key]; };
    return row;
  }

  const predInput = el('input', {
    class: 'input input--num', type: 'number', value: predictX,
    min: Math.round(ctx.xMin - 20), max: Math.round(ctx.xMax + 20),
    'aria-label': 'Valor de x para predecir',
    onInput: (e) => { predictX = Number(e.target.value); render(); },
  });

  const actions = el('div', { class: 'lab-actions' }, [
    el('button', {
      type: 'button', class: 'btn btn--sm btn--primary', text: 'Mínimos cuadrados',
      onClick: () => {
        const m = model();
        manual.intercept = Math.round(m.intercept);
        manual.slope = Math.round(m.slope * 10) / 10;
        render();
      },
    }),
    el('button', {
      type: 'button', class: 'btn btn--sm', text: showResiduals ? 'Ocultar residuos' : 'Mostrar residuos',
      onClick: (e) => { showResiduals = !showResiduals; e.target.textContent = showResiduals ? 'Ocultar residuos' : 'Mostrar residuos'; render(); },
    }),
    el('button', {
      type: 'button', class: 'btn btn--sm', text: 'Datos nuevos',
      onClick: () => { points = makePoints(n, ctx, `reg-${Math.random()}`); render(); },
    }),
    el('button', {
      type: 'button', class: 'btn btn--sm btn--outline', text: 'Añadir punto influyente',
      onClick: () => {
        points = points.concat([{ x: ctx.xMax, y: ctx.yMax * 0.95, highlight: true }]);
        render();
      },
    }),
  ]);

  controls.appendChild(el('div', { class: 'stack' }, [bRow, mRow]));
  controls.appendChild(el('div', {}, [el('p', { class: 'small strong', text: 'Acciones' }), actions]));
  controls.appendChild(el('label', { class: 'field' }, [
    el('span', { class: 'field__label', text: `Predecir para x =` }),
    predInput,
    el('span', { class: 'field__hint', id: 'predHint' }),
  ]));

  const model = () => {
    const xs = points.map((p) => p.x), ys = points.map((p) => p.y);
    return linearRegression(xs, ys);
  };

  function render(liveOnly = false) {
    bRow.__set(); mRow.__set();
    const xs = points.map((p) => p.x), ys = points.map((p) => p.y);
    const m = model();
    const sseManual = sseFor(xs, ys, manual.intercept, manual.slope);
    const infl = influentialPoints(m);

    const marked = points.map((p, i) => ({
      ...p,
      highlight: infl.some((f) => f.i === i),
    }));

    if (!liveOnly) {
      const svg = scatter(marked, {
        xLabel: ctx.xLabel, yLabel: ctx.yLabel,
        xMin: ctx.xMin, xMax: ctx.xMax, yMin: ctx.yMin, yMax: ctx.yMax,
        draggable: true, r: 6,
        line: { intercept: m.intercept, slope: m.slope, color: 'var(--data-2)', label: 'recta de mínimos cuadrados' },
        residualsTo: showResiduals ? { intercept: manual.intercept, slope: manual.slope } : null,
        title: `y = ${fmt(m.intercept, 1)} + ${fmt(m.slope, 2)}·x   ·   R² = ${fmt(m.r2, 3)}`,
      });
      // La recta manual se dibuja encima
      if (showManual) {
        const plot = svg.__plot;
        const xa = ctx.xMin, xb = ctx.xMax;
        const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
        line.setAttribute('x1', plot.sx(xa));
        line.setAttribute('y1', plot.sy(manual.intercept + manual.slope * xa));
        line.setAttribute('x2', plot.sx(xb));
        line.setAttribute('y2', plot.sy(manual.intercept + manual.slope * xb));
        line.setAttribute('stroke', 'var(--data-6)');
        line.setAttribute('stroke-width', '2.4');
        line.setAttribute('stroke-dasharray', '6 4');
        line.setAttribute('aria-label', 'tu recta');
        svg.appendChild(line);
      }
      replace(stage, [
        svg,
        el('div', { class: 'legend' }, [
          swatch('var(--data-2)', 'Recta de mínimos cuadrados'),
          swatch('var(--data-6)', 'Tu recta (discontinua)'),
          swatch('var(--ink)', 'Puntos influyentes (borde grueso)'),
        ]),
      ]);
      attachDrag(svg, points, ctx, render, { hostForFocus: stage });
    }

    const extrapolating = m.isExtrapolation(predictX);
    const pred = m.predict(predictX);
    const ciM = m.ciMean(predictX);
    const piN = m.piNew(predictX);
    const hint = controls.querySelector('#predHint');
    if (hint) {
      hint.textContent = extrapolating
        ? `⚠ ${predictX} está FUERA del rango observado (${fmt(m.xRange[0], 0)}–${fmt(m.xRange[1], 0)}): es extrapolación.`
        : `Dentro del rango observado (${fmt(m.xRange[0], 0)}–${fmt(m.xRange[1], 0)}).`;
      hint.style.color = extrapolating ? 'var(--bad)' : 'var(--ink-3)';
    }

    replace(readout, [
      rd('Tu SSE', fmt(sseManual, 1), true),
      rd('SSE mínima (MCO)', fmt(m.ssRes, 1), true),
      rd('Exceso de tu recta', `+${fmt(Math.max(0, sseManual - m.ssRes), 1)}`),
      rd('Intercepto MCO (b₀)', fmt(m.intercept, 2)),
      rd('Pendiente MCO (b₁)', fmt(m.slope, 3)),
      rd('IC 95 % de la pendiente', `${fmt(m.ciSlope[0], 2)} a ${fmt(m.ciSlope[1], 2)}`),
      rd('p-valor de la pendiente', fmtP(m.pSlope)),
      rd('r de Pearson', fmt(m.r, 3)),
      rd('R²', fmt(m.r2, 3), true),
      rd('R² ajustado', fmt(m.r2adj, 3)),
      rd('Error típico (RSE)', fmt(m.rse, 2)),
      rd(`Predicción en x = ${predictX}`, fmt(pred, 1)),
      rd('IC 95 % de la media', `${fmt(ciM[0], 1)} a ${fmt(ciM[1], 1)}`),
      rd('Intervalo de predicción', `${fmt(piN[0], 1)} a ${fmt(piN[1], 1)}`),
      rd('Puntos influyentes', String(infl.length)),
    ]);

    const noteList = [
      el('div', { class: 'callout' }, [
        el('span', { class: 'callout__title', text: 'Interpretación de la pendiente' }),
        `Por cada año más de edad, la distancia caminada cambia en promedio ${fmt(m.slope, 2)} metros. `
        + 'La pendiente SIEMPRE se interpreta con unidades: metros por año. '
        + `El intercepto (${fmt(m.intercept, 1)}) sería el valor esperado cuando x = 0, `
        + 'que aquí no tiene ningún sentido clínico porque nadie tiene 0 años en esta muestra.',
      ]),
      el('div', { class: sseManual <= m.ssRes + 0.5 ? 'callout callout--ok' : 'callout callout--warn' }, [
        el('span', { class: 'callout__title', text: 'Mínimos cuadrados' }),
        sseManual <= m.ssRes + 0.5
          ? 'Has encontrado (prácticamente) la recta de mínimos cuadrados: ninguna otra recta consigue una suma de residuos al cuadrado menor.'
          : `Tu recta acumula ${fmt(sseManual - m.ssRes, 1)} unidades más de SSE que la óptima. Sigue ajustando: `
            + 'la recta de MCO es la ÚNICA que minimiza la suma de los residuos verticales al cuadrado.',
      ]),
      el('div', { class: 'callout callout--warn' }, [
        el('span', { class: 'callout__title', text: 'IC de la media frente a intervalo de predicción' }),
        `Para x = ${predictX}: la MEDIA de todos los individuos con ese valor está entre ${fmt(ciM[0], 0)} y ${fmt(ciM[1], 0)}; `
        + `pero UN individuo concreto puede estar entre ${fmt(piN[0], 0)} y ${fmt(piN[1], 0)}. `
        + 'En clínica interesa casi siempre el segundo, y es el que suele omitirse.',
      ]),
    ];
    if (infl.length) {
      noteList.push(el('div', { class: 'callout callout--bad' }, [
        el('span', { class: 'callout__title', text: `${infl.length} punto(s) potencialmente influyente(s)` }),
        'Marcados con borde grueso. Criterios: distancia de Cook > 4/n, apalancamiento > 2p/n o residuo estandarizado > 2. '
        + 'Un residuo grande en el CENTRO del rango de x apenas mueve la recta; el mismo residuo en un EXTREMO la mueve mucho. '
        + 'Eso es la diferencia entre residuo grande y punto influyente.',
      ]));
    }
    replace(notes, noteList);

    api.onState?.({ slope: m.slope, intercept: m.intercept, r2: m.r2, sseManual, sseMin: m.ssRes });
  }

  function swatch(color, label) {
    return el('span', { class: 'legend__item' }, [
      el('span', { class: 'legend__swatch', style: { background: color } }), label,
    ]);
  }

  function rd(k, v, hl = false) {
    return el('div', { class: `readout${hl ? ' readout--hl' : ''}` }, [
      el('span', { class: 'readout__k', text: k }),
      el('span', { class: 'readout__v', text: v }),
    ]);
  }

  render();
  api.onFinish?.({ game: meta.id, score: null, concepts: meta.concepts, exploratory: true });
  return { destroy() { clear(host); }, get points() { return points; } };
}

function makePoints(n, ctx, seed) {
  const rng = rngFor(String(seed));
  const out = [];
  const slope = -(ctx.yMax - ctx.yMin) / (ctx.xMax - ctx.xMin) * rng.uniform(0.55, 0.9);
  const intercept = ctx.yMax - slope * ctx.xMin;
  for (let i = 0; i < n; i++) {
    const x = Math.round(rng.uniform(ctx.xMin + 1, ctx.xMax - 1));
    const noise = rng.normal(0, (ctx.yMax - ctx.yMin) * 0.09);
    const y = Math.round(Math.min(ctx.yMax, Math.max(ctx.yMin, intercept + slope * x - (ctx.yMax - ctx.yMin) * 0.15 + noise)));
    out.push({ x, y });
  }
  return out;
}
