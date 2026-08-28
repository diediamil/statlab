/**
 * Laboratorio: LABORATORIO DE CORRELACIÓN
 * ---------------------------------------------------------------------------
 * Nube de puntos ARRASTRABLE. Al mover un punto, r y r² se recalculan en vivo.
 * Con esto se aprenden tres cosas que ninguna fórmula transmite:
 *
 *   1. Un solo punto puede cambiar r de 0,8 a 0,1 (y al revés).
 *   2. r ≈ 0 no significa «sin relación»: significa «sin relación LINEAL».
 *      El botón «relación curva» lo demuestra en un clic.
 *   3. r es simétrico y sin unidades: al intercambiar los ejes no cambia.
 *
 * Accesible: los puntos también se mueven con el teclado (Tab para elegir,
 * flechas para desplazar).
 */

import { el, clear, replace, announce } from '../js/dom.js';
import { fmt } from '../js/utils.js';
import { rngFor } from '../js/rng.js';
import { pearsonR, spearmanRho, pearsonTest } from '../js/stats/regression.js';
import { scatter } from '../js/viz.js';

export const meta = {
  id: 'correlation-lab',
  title: 'Laboratorio de correlación',
  concepts: ['pearson', 'spearman', 'intensidad', 'direccion', 'outliers-r', 'scatter-r', 'causalidad', 'significacion-r'],
  observation: 'Coge el punto más alejado y muévelo: mira cuánto cambia r. Ahora prueba la relación curva y comprueba '
    + 'que r ≈ 0 pese a que la relación es evidente. Moraleja: nunca informes un r sin su diagrama de dispersión.',
};

const PRESETS = {
  strongPos: { r: 0.85, label: 'Positiva fuerte' },
  moderate: { r: 0.5, label: 'Positiva moderada' },
  none: { r: 0.0, label: 'Sin relación' },
  negative: { r: -0.7, label: 'Negativa' },
};

export function mount(host, config = {}, api = {}) {
  const ctx = config.context || {
    xLabel: 'Puntuación de ansiedad (GAD-7)', yLabel: 'Mala calidad del sueño (PSQI)',
    xMin: 0, xMax: 21, yMin: 0, yMax: 21,
  };
  const n = config.n || 20;
  let points = makePoints(config.targetR ?? 0.7, n, ctx, config.seed || 'corr-1');
  let curved = false;
  let selected = null;

  const stage = el('div', { class: 'lab__stage' });
  const readout = el('div', { class: 'lab__readout' });
  const controls = el('div', { class: 'lab__controls' });
  const notes = el('div');

  host.appendChild(el('div', { class: 'lab lab--split' }, [
    el('div', { class: 'stack' }, [stage, notes]),
    el('div', { class: 'stack' }, [controls, readout]),
  ]));

  const actions = el('div', { class: 'lab-actions' },
    Object.entries(PRESETS).map(([k, p]) => el('button', {
      type: 'button', class: 'btn btn--sm', text: p.label,
      onClick: () => { curved = false; points = makePoints(p.r, n, ctx, `${k}-${Math.random()}`); render(); },
    })).concat([
      el('button', {
        type: 'button', class: 'btn btn--sm btn--outline', text: 'Relación curva',
        onClick: () => { curved = true; points = makeCurved(n, ctx); render(); },
      }),
      el('button', {
        type: 'button', class: 'btn btn--sm', text: 'Añadir un atípico',
        onClick: () => {
          points = points.concat([{ x: ctx.xMax * 0.95, y: ctx.yMin + (ctx.yMax - ctx.yMin) * 0.05, highlight: true }]);
          render();
          announce('Punto atípico añadido en la esquina inferior derecha.');
        },
      }),
      el('button', {
        type: 'button', class: 'btn btn--sm', text: 'Intercambiar ejes',
        onClick: () => { points = points.map((p) => ({ ...p, x: p.y, y: p.x })); render(); },
      }),
    ]));

  controls.appendChild(el('div', {}, [
    el('p', { class: 'small strong', text: 'Escenarios' }), actions,
  ]));
  controls.appendChild(el('div', { class: 'callout' }, [
    el('span', { class: 'callout__title', text: 'Cómo mover los puntos' }),
    'Arrástralos con el ratón o el dedo. Con teclado: Tab para seleccionar un punto y flechas para moverlo.',
  ]));

  /* ------------------------------------------------------------ pintado -- */

  /**
   * `liveOnly` evita repintar el SVG mientras se arrastra un punto: si se
   * sustituyera el nodo en cada movimiento, el navegador perdería la captura
   * del puntero y el arrastre se cortaría.
   */
  function render(liveOnly = false) {
    const xs = points.map((p) => p.x), ys = points.map((p) => p.y);
    const r = pearsonR(xs, ys);
    const rho = spearmanRho(xs, ys);
    const test = pearsonTest(xs, ys);

    if (!liveOnly) {
      const svg = scatter(points, {
        xLabel: ctx.xLabel, yLabel: ctx.yLabel,
        xMin: ctx.xMin, xMax: ctx.xMax, yMin: ctx.yMin, yMax: ctx.yMax,
        draggable: true, r: 6,
        title: `r = ${fmt(r, 3)}`,
      });
      replace(stage, [svg, el('p', { class: 'chart-note', text: `n = ${points.length} puntos. Arrastra cualquiera de ellos.` })]);
      attachDrag(svg, points, ctx, render, { hostForFocus: stage });
    }

    const strength = Math.abs(r) < 0.1 ? 'prácticamente nula' : Math.abs(r) < 0.3 ? 'débil'
      : Math.abs(r) < 0.5 ? 'moderada' : Math.abs(r) < 0.7 ? 'apreciable' : 'fuerte';

    replace(readout, [
      rd('r de Pearson', fmt(r, 3), true),
      rd('r² (varianza compartida)', fmt(r * r, 3), true),
      rd('rho de Spearman', fmt(rho, 3)),
      rd('Dirección', r > 0.02 ? 'positiva' : r < -0.02 ? 'negativa' : 'sin dirección clara'),
      rd('Intensidad (Pearson)', strength),
      rd('n', String(points.length)),
      rd('p-valor de r = 0', test.p < 0.001 ? '< 0,001' : fmt(test.p, 3)),
      rd('IC 95 % de r', test.ci && Number.isFinite(test.ci[0]) ? `${fmt(test.ci[0], 2)} a ${fmt(test.ci[1], 2)}` : '—'),
    ]);

    const noteList = [
      el('div', { class: 'callout' }, [
        el('span', { class: 'callout__title', text: 'Lectura' }),
        `r = ${fmt(r, 2)} indica una asociación lineal ${strength} y ${r >= 0 ? 'positiva' : 'negativa'}. `
        + `r² = ${fmt(r * r, 2)} significa que las dos variables comparten el ${fmt(r * r * 100, 1)} % de su variabilidad. `
        + 'Ojo: r² NO es «el porcentaje de casos explicados» ni prueba de causalidad.',
      ]),
    ];

    if (curved) {
      noteList.push(el('div', { class: 'callout callout--warn' }, [
        el('span', { class: 'callout__title', text: 'Aquí está la trampa' }),
        `La relación es evidente en el gráfico y sin embargo r = ${fmt(r, 2)}. Pearson mide solo la componente LINEAL: `
        + 'en una curva en U las contribuciones positivas y negativas se cancelan. Patrón muy real en farmacología '
        + '(ventana terapéutica) y fisiología.',
      ]));
    }
    if (Math.abs(r - rho) > 0.15) {
      noteList.push(el('div', { class: 'callout callout--warn' }, [
        el('span', { class: 'callout__title', text: 'Pearson y Spearman discrepan' }),
        `r = ${fmt(r, 2)} frente a rho = ${fmt(rho, 2)}. Esa diferencia suele señalar valores atípicos influyentes o `
        + 'una relación monótona pero no lineal. Spearman, al trabajar con rangos, es más robusta.',
      ]));
    }
    noteList.push(el('div', { class: 'callout callout--bad' }, [
      el('span', { class: 'callout__title', text: 'Recordatorio permanente' }),
      'Por muy alto que sea r, estos datos son observacionales: correlación NO implica causalidad. '
      + 'Antes de pensar en causa hay que descartar azar, sesgo, confusión y causalidad inversa.',
    ]));
    replace(notes, noteList);

    api.onState?.({ r, rho, n: points.length });
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

/* ------------------------------------------------------------- utilidades -- */

function makePoints(r, n, ctx, seed) {
  const rng = rngFor(String(seed));
  const muX = (ctx.xMin + ctx.xMax) / 2, sdX = (ctx.xMax - ctx.xMin) / 6;
  const muY = (ctx.yMin + ctx.yMax) / 2, sdY = (ctx.yMax - ctx.yMin) / 6;
  const { xs, ys } = rng.correlated(n, r, muX, sdX, muY, sdY);
  return xs.map((x, i) => ({
    x: clamp(Math.round(x * 10) / 10, ctx.xMin, ctx.xMax),
    y: clamp(Math.round(ys[i] * 10) / 10, ctx.yMin, ctx.yMax),
  }));
}

function makeCurved(n, ctx) {
  const out = [];
  for (let i = 0; i < n; i++) {
    const x = ctx.xMin + ((ctx.xMax - ctx.xMin) * i) / (n - 1);
    const t = (x - ctx.xMin) / (ctx.xMax - ctx.xMin);
    const y = ctx.yMin + (ctx.yMax - ctx.yMin) * (1 - 4 * (t - 0.5) ** 2) * 0.9 + (ctx.yMax - ctx.yMin) * 0.05;
    out.push({ x: Math.round(x * 10) / 10, y: Math.round(y * 10) / 10 });
  }
  return out;
}

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

/**
 * Hace arrastrables los círculos de un diagrama de dispersión.
 * Usa eventos de puntero (ratón, táctil y lápiz con la misma ruta de código)
 * y añade control por teclado.
 */
export function attachDrag(svg, points, ctx, onChange, extra = {}) {
  const plot = svg.__plot;
  if (!plot) return;
  let dragging = null;
  const circles = new Map();

  const toData = (evt) => {
    const rect = svg.getBoundingClientRect();
    const vb = svg.viewBox.baseVal;
    const px = ((evt.clientX - rect.left) / rect.width) * vb.width;
    const py = ((evt.clientY - rect.top) / rect.height) * vb.height;
    return {
      x: clamp(Math.round(plot.ix(px) * 10) / 10, ctx.xMin, ctx.xMax),
      y: clamp(Math.round(plot.iy(py) * 10) / 10, ctx.yMin, ctx.yMax),
    };
  };

  svg.querySelectorAll('circle[data-i]').forEach((c) => {
    circles.set(Number(c.dataset.i), c);
    c.setAttribute('tabindex', '0');
    c.style.cursor = 'grab';
    c.addEventListener('pointerdown', (e) => {
      dragging = Number(c.dataset.i);
      svg.setPointerCapture?.(e.pointerId);
      e.preventDefault();
    });
    c.addEventListener('keydown', (e) => {
      const i = Number(c.dataset.i);
      const stepX = (ctx.xMax - ctx.xMin) / 40;
      const stepY = (ctx.yMax - ctx.yMin) / 40;
      let moved = false;
      if (e.key === 'ArrowUp') { points[i].y = clamp(points[i].y + stepY, ctx.yMin, ctx.yMax); moved = true; }
      if (e.key === 'ArrowDown') { points[i].y = clamp(points[i].y - stepY, ctx.yMin, ctx.yMax); moved = true; }
      if (e.key === 'ArrowRight') { points[i].x = clamp(points[i].x + stepX, ctx.xMin, ctx.xMax); moved = true; }
      if (e.key === 'ArrowLeft') { points[i].x = clamp(points[i].x - stepX, ctx.xMin, ctx.xMax); moved = true; }
      if (moved) {
        e.preventDefault();
        points[i].x = Math.round(points[i].x * 10) / 10;
        points[i].y = Math.round(points[i].y * 10) / 10;
        onChange(false);
        // Devuelve el foco al mismo punto tras el repintado.
        requestAnimationFrame(() => {
          const again = (extra.hostForFocus || document).querySelector(`circle[data-i="${i}"]`);
          again?.focus?.();
        });
      }
    });
  });

  svg.addEventListener('pointermove', (e) => {
    if (dragging === null) return;
    const d = toData(e);
    points[dragging].x = d.x;
    points[dragging].y = d.y;
    // Se mueve el círculo en el sitio (sin repintar el SVG) para no perder
    // la captura del puntero, y se refrescan solo los indicadores numéricos.
    const c = circles.get(dragging);
    if (c) { c.setAttribute('cx', plot.sx(d.x)); c.setAttribute('cy', plot.sy(d.y)); }
    extra.onLiveMove?.(dragging, d, plot);
    onChange(true);
  });

  const end = () => {
    if (dragging === null) return;
    dragging = null;
    onChange(false);            // repintado completo al soltar
  };
  svg.addEventListener('pointerup', end);
  svg.addEventListener('pointercancel', end);
}
