/**
 * STATLAB — motor de gráficos en SVG
 * ---------------------------------------------------------------------------
 * Por qué SVG a mano y no una librería: cero dependencias, escala sin pérdida,
 * accesible (cada gráfico lleva `role="img"` y una descripción textual), y
 * permite construir gráficos DELIBERADAMENTE ENGAÑOSOS para el minijuego
 * "Hospital de gráficos" (eje truncado, escala no lineal, sectores 3D…), algo
 * que ninguna librería serie te deja hacer.
 *
 * Reglas de accesibilidad aplicadas en todos los gráficos:
 *   · `role="img"` + `<title>` + `<desc>` con la lectura del gráfico;
 *   · nunca se codifica información SOLO con color: siempre hay etiqueta,
 *     patrón o posición;
 *   · los colores salen de las variables CSS (--data-N), así que respetan el
 *     tema claro/oscuro elegido por el usuario.
 */

import { svgEl } from './dom.js';
import { fmt, fmtInt } from './utils.js';
import { fiveNumber, histogramBins } from './stats/descriptive.js';
import { normalPdf } from './stats/distributions.js';

const PAL = ['var(--data-1)', 'var(--data-2)', 'var(--data-3)', 'var(--data-4)',
  'var(--data-5)', 'var(--data-6)', 'var(--data-7)', 'var(--data-8)'];

export const palette = (i) => PAL[i % PAL.length];

const DEF = { w: 560, h: 340, mt: 18, mr: 18, mb: 46, ml: 54 };

/**
 * Rango seguro para una escala. Si todos los valores coinciden (o no hay
 * datos), devuelve un intervalo artificial para que las divisiones no den
 * NaN y el gráfico siga siendo válido. Sin esto, una serie de ceros produce
 * atributos SVG «NaN» y el navegador descarta los elementos.
 */
function safeRange(lo, hi, fallbackSpan = 1) {
  if (!Number.isFinite(lo) || !Number.isFinite(hi)) return [0, fallbackSpan];
  if (hi > lo) return [lo, hi];
  const span = Math.abs(lo) > 1e-9 ? Math.abs(lo) * 0.5 : fallbackSpan;
  return [lo - span, lo + span];
}

/** Crea el lienzo base con márgenes y accesibilidad. */
function canvas(opts = {}) {
  const o = { ...DEF, ...opts };
  const svg = svgEl('svg', {
    viewBox: `0 0 ${o.w} ${o.h}`,
    role: 'img',
    'aria-label': o.title || 'Gráfico',
    preserveAspectRatio: 'xMidYMid meet',
    style: 'width:100%;height:auto',
  });
  if (o.title) svg.appendChild(svgEl('title', { text: o.title }));
  if (o.desc) svg.appendChild(svgEl('desc', { text: o.desc }));
  const plot = {
    svg, ...o,
    x0: o.ml, x1: o.w - o.mr, y0: o.h - o.mb, y1: o.mt,
    get pw() { return this.x1 - this.x0; },
    get ph() { return this.y0 - this.y1; },
  };
  return plot;
}

function axisLine(p, attrs) { return svgEl('line', { stroke: 'var(--axis)', 'stroke-width': 1, ...attrs }); }

function label(text, x, y, attrs = {}) {
  return svgEl('text', {
    x, y, 'font-size': 11, fill: 'var(--ink-3)', 'text-anchor': 'middle', ...attrs, text,
  });
}

/** Marcas "bonitas" para un eje numérico. */
export function niceTicks(lo, hi, count = 5) {
  if (lo === hi) return [lo];
  const span = hi - lo;
  const step0 = span / count;
  const mag = 10 ** Math.floor(Math.log10(step0));
  const norm = step0 / mag;
  const step = (norm >= 7.5 ? 10 : norm >= 3.5 ? 5 : norm >= 1.5 ? 2 : 1) * mag;
  const start = Math.ceil(lo / step) * step;
  const out = [];
  for (let v = start; v <= hi + step * 1e-9; v += step) out.push(Math.round(v / step) * step);
  return out;
}

/** Ejes cartesianos con rejilla horizontal. */
function drawAxes(p, { xTicks = [], yTicks = [], xLabel, yLabel, xFmt = (v) => fmt(v, 0), yFmt = (v) => fmt(v, 0), rotateX = false }) {
  const g = svgEl('g');
  for (const t of yTicks) {
    const y = p.sy(t);
    g.appendChild(svgEl('line', { x1: p.x0, x2: p.x1, y1: y, y2: y, stroke: 'var(--grid)', 'stroke-width': 1 }));
    g.appendChild(label(yFmt(t), p.x0 - 7, y + 4, { 'text-anchor': 'end' }));
  }
  g.appendChild(axisLine(p, { x1: p.x0, x2: p.x1, y1: p.y0, y2: p.y0 }));
  g.appendChild(axisLine(p, { x1: p.x0, x2: p.x0, y1: p.y0, y2: p.y1 }));
  for (const t of xTicks) {
    const x = typeof t === 'object' ? t.x : p.sx(t);
    const txt = typeof t === 'object' ? t.label : xFmt(t);
    g.appendChild(svgEl('line', { x1: x, x2: x, y1: p.y0, y2: p.y0 + 4, stroke: 'var(--axis)' }));
    g.appendChild(label(txt, x, p.y0 + 17, rotateX ? { transform: `rotate(-32 ${x} ${p.y0 + 17})`, 'text-anchor': 'end' } : {}));
  }
  if (xLabel) g.appendChild(label(xLabel, (p.x0 + p.x1) / 2, p.h - 6, { 'font-weight': 600, fill: 'var(--ink-2)' }));
  if (yLabel) {
    g.appendChild(label(yLabel, 0, 0, {
      'font-weight': 600, fill: 'var(--ink-2)',
      transform: `translate(13 ${(p.y0 + p.y1) / 2}) rotate(-90)`,
    }));
  }
  p.svg.appendChild(g);
  return g;
}

/* ====================================================== gráfico de barras */

/**
 * @param {{label:string,value:number,color?:string}[]} data
 * @param {object} opts  baselineZero:false produce un eje truncado (engañoso)
 */
export function barChart(data, opts = {}) {
  const p = canvas({
    title: opts.title, mb: opts.rotateX ? 66 : 46,
    desc: opts.desc || `Diagrama de barras: ${data.map((d) => `${d.label} ${fmt(d.value, 1)}`).join('; ')}.`,
    ...opts,
  });
  const vals = data.map((d) => d.value).filter(Number.isFinite);
  const rawMax = opts.yMax ?? (vals.length ? Math.max(...vals) * 1.12 : 1);
  const rawMin = opts.baselineZero === false
    ? (opts.yMin ?? (vals.length ? Math.min(...vals) * 0.985 : 0))
    : (opts.yMin ?? 0);
  const [minV, maxV] = safeRange(rawMin, rawMax);
  p.sy = (v) => p.y0 - ((v - minV) / (maxV - minV)) * p.ph;
  const bw = p.pw / data.length;
  const inner = bw * 0.66;

  const xTicks = data.map((d, i) => ({ x: p.x0 + bw * (i + 0.5), label: d.label }));
  drawAxes(p, {
    yTicks: niceTicks(minV, maxV, 5), xTicks,
    xLabel: opts.xLabel, yLabel: opts.yLabel,
    yFmt: opts.yFmt || ((v) => fmt(v, Math.abs(maxV - minV) < 5 ? 1 : 0)),
    rotateX: opts.rotateX,
  });

  const g = svgEl('g');
  data.forEach((d, i) => {
    const y = p.sy(d.value);
    const x = p.x0 + bw * i + (bw - inner) / 2;
    g.appendChild(svgEl('rect', {
      x, y: Math.min(y, p.y0), width: inner, height: Math.abs(p.y0 - y), rx: 3,
      fill: d.color || palette(i),
      'aria-label': `${d.label}: ${fmt(d.value, 2)}`,
    }));
    if (opts.showValues !== false) {
      g.appendChild(label(opts.valueFmt ? opts.valueFmt(d.value) : fmt(d.value, Math.abs(maxV - minV) < 5 ? 1 : 0),
        x + inner / 2, y - 5, { 'font-size': 10, fill: 'var(--ink-2)', 'font-weight': 600 }));
    }
  });
  p.svg.appendChild(g);

  if (opts.baselineZero === false) {
    p.svg.appendChild(label('⚠ eje Y truncado', p.x1 - 4, p.y1 + 10,
      { 'text-anchor': 'end', fill: 'var(--bad)', 'font-size': 10, 'font-weight': 700 }));
  }
  return p.svg;
}

/* =============================================== barras agrupadas por serie */

export function groupedBarChart(categories, series, opts = {}) {
  const p = canvas({
    title: opts.title, mb: 56,
    desc: opts.desc || `Barras agrupadas de ${series.map((s) => s.name).join(' y ')} por ${categories.join(', ')}.`,
    ...opts,
  });
  const all = series.flatMap((s) => s.values).filter(Number.isFinite);
  const maxV = safeRange(0, opts.yMax ?? (all.length ? Math.max(...all) * 1.15 : 1))[1];
  p.sy = (v) => p.y0 - (v / maxV) * p.ph;
  const gw = p.pw / categories.length;
  const bw = (gw * 0.7) / series.length;

  drawAxes(p, {
    yTicks: niceTicks(0, maxV, 5),
    xTicks: categories.map((c, i) => ({ x: p.x0 + gw * (i + 0.5), label: c })),
    xLabel: opts.xLabel, yLabel: opts.yLabel, yFmt: opts.yFmt,
  });

  const g = svgEl('g');
  categories.forEach((c, i) => {
    series.forEach((s, j) => {
      const v = s.values[i];
      const x = p.x0 + gw * i + gw * 0.15 + bw * j;
      g.appendChild(svgEl('rect', {
        x, y: p.sy(v), width: bw - 2, height: p.y0 - p.sy(v), rx: 2,
        fill: s.color || palette(j), 'aria-label': `${c}, ${s.name}: ${fmt(v, 2)}`,
      }));
    });
  });
  p.svg.appendChild(g);
  return p.svg;
}

/* ==================================================== diagrama de sectores */

export function pieChart(data, opts = {}) {
  const size = opts.size || 300;
  const svg = svgEl('svg', {
    viewBox: `0 0 ${size} ${size}`, role: 'img',
    'aria-label': opts.title || 'Diagrama de sectores',
    style: 'width:100%;max-width:320px;height:auto;margin:0 auto',
  });
  if (opts.title) svg.appendChild(svgEl('title', { text: opts.title }));
  const total = data.reduce((s, d) => s + d.value, 0) || 1;
  svg.appendChild(svgEl('desc', {
    text: opts.desc || `Sectores: ${data.map((d) => `${d.label} ${((d.value / total) * 100).toFixed(1)} %`).join('; ')}.`,
  }));
  const cx = size / 2, cy = size / 2, r = size / 2 - 26;
  let angle = -Math.PI / 2;
  const g = svgEl('g');
  data.forEach((d, i) => {
    const frac = d.value / total;
    const a2 = angle + frac * 2 * Math.PI;
    const large = frac > 0.5 ? 1 : 0;
    const x1 = cx + r * Math.cos(angle), y1 = cy + r * Math.sin(angle);
    const x2 = cx + r * Math.cos(a2), y2 = cy + r * Math.sin(a2);
    g.appendChild(svgEl('path', {
      d: `M ${cx} ${cy} L ${x1.toFixed(2)} ${y1.toFixed(2)} A ${r} ${r} 0 ${large} 1 ${x2.toFixed(2)} ${y2.toFixed(2)} Z`,
      fill: d.color || palette(i), stroke: 'var(--surface)', 'stroke-width': 2,
      'aria-label': `${d.label}: ${(frac * 100).toFixed(1)} %`,
    }));
    if (frac > 0.05) {
      const mid = (angle + a2) / 2;
      g.appendChild(svgEl('text', {
        x: cx + r * 0.68 * Math.cos(mid), y: cy + r * 0.68 * Math.sin(mid) + 4,
        'text-anchor': 'middle', 'font-size': 11, 'font-weight': 700, fill: '#fff',
        text: `${Math.round(frac * 100)} %`,
      }));
    }
    angle = a2;
  });
  svg.appendChild(g);
  return svg;
}

/* ============================================================= histograma */

export function histogram(values, opts = {}) {
  const bins = opts.bins || histogramBins(values, opts.nBins);
  const p = canvas({
    title: opts.title,
    desc: opts.desc || `Histograma de ${values.length} valores en ${bins.length} clases.`,
    ...opts,
  });
  if (!bins.length) return canvas({ title: opts.title }).svg;
  const maxC = safeRange(0, Math.max(...bins.map((b) => b.count)) * 1.15)[1];
  const [lo, hi] = safeRange(bins[0].from, bins[bins.length - 1].to);
  p.sx = (v) => p.x0 + ((v - lo) / (hi - lo)) * p.pw;
  p.sy = (v) => p.y0 - (v / maxC) * p.ph;

  drawAxes(p, {
    yTicks: niceTicks(0, maxC, 5),
    xTicks: niceTicks(lo, hi, 6),
    xLabel: opts.xLabel, yLabel: opts.yLabel || 'Frecuencia',
    xFmt: opts.xFmt || ((v) => fmt(v, Math.abs(hi - lo) < 12 ? 1 : 0)),
  });

  const g = svgEl('g');
  bins.forEach((b) => {
    const x = p.sx(b.from), w = Math.max(1, p.sx(b.to) - p.sx(b.from) - 1);
    g.appendChild(svgEl('rect', {
      x, y: p.sy(b.count), width: w, height: p.y0 - p.sy(b.count),
      fill: opts.color || 'var(--data-1)', 'fill-opacity': 0.85, stroke: 'var(--surface)',
      'aria-label': `De ${fmt(b.from, 1)} a ${fmt(b.to, 1)}: ${b.count}`,
    }));
  });
  p.svg.appendChild(g);

  // Curva normal superpuesta (opcional): útil para "¿parece normal?"
  if (opts.overlayNormal) {
    const { mu, sd: s } = opts.overlayNormal;
    const binW = bins[0].to - bins[0].from;
    const pts = [];
    for (let i = 0; i <= 100; i++) {
      const xv = lo + ((hi - lo) * i) / 100;
      pts.push(`${p.sx(xv).toFixed(1)},${p.sy(normalPdf(xv, mu, s) * values.length * binW).toFixed(1)}`);
    }
    p.svg.appendChild(svgEl('polyline', {
      points: pts.join(' '), fill: 'none', stroke: 'var(--data-3)', 'stroke-width': 2, 'stroke-dasharray': '5 3',
    }));
  }

  if (opts.markMean) {
    const m = values.reduce((s, x) => s + x, 0) / values.length;
    p.svg.appendChild(svgEl('line', {
      x1: p.sx(m), x2: p.sx(m), y1: p.y0, y2: p.y1, stroke: 'var(--data-6)', 'stroke-width': 2, 'stroke-dasharray': '4 3',
    }));
    p.svg.appendChild(label(`media ${fmt(m, 1)}`, p.sx(m), p.y1 + 12, { fill: 'var(--data-6)', 'font-weight': 700, 'font-size': 10 }));
  }
  return p.svg;
}

/* ================================================================ boxplot */

/** Uno o varios boxplots (con puntos atípicos marcados). */
export function boxplot(groups, opts = {}) {
  const list = Array.isArray(groups[0]) || typeof groups[0] === 'object' && groups[0].values
    ? groups.map((g, i) => (g.values ? g : { name: `Grupo ${i + 1}`, values: g }))
    : [{ name: opts.name || 'Datos', values: groups }];
  const stats = list.map((g) => ({ ...g, s: fiveNumber(g.values) }));
  const p = canvas({
    title: opts.title, mb: 52,
    desc: opts.desc || stats.map((g) => `${g.name}: mediana ${fmt(g.s.median, 1)}, Q1 ${fmt(g.s.q1, 1)}, Q3 ${fmt(g.s.q3, 1)}`).join('; ') + '.',
    ...opts,
  });
  const all = stats.flatMap((g) => g.values).filter(Number.isFinite);
  const [lo, hi] = safeRange(opts.yMin ?? (all.length ? Math.min(...all) : 0),
                             opts.yMax ?? (all.length ? Math.max(...all) : 1));
  const pad = (hi - lo) * 0.08 || 1;
  p.sy = (v) => p.y0 - ((v - (lo - pad)) / ((hi + pad) - (lo - pad))) * p.ph;
  const gw = p.pw / stats.length;
  const bw = Math.min(70, gw * 0.5);

  drawAxes(p, {
    yTicks: niceTicks(lo - pad, hi + pad, 6),
    xTicks: stats.map((g, i) => ({ x: p.x0 + gw * (i + 0.5), label: g.name })),
    yLabel: opts.yLabel, xLabel: opts.xLabel,
    yFmt: opts.yFmt || ((v) => fmt(v, (hi - lo) < 12 ? 1 : 0)),
  });

  const g = svgEl('g');
  stats.forEach((grp, i) => {
    const cx = p.x0 + gw * (i + 0.5);
    const s = grp.s;
    const col = grp.color || palette(i);
    // bigotes
    g.appendChild(svgEl('line', { x1: cx, x2: cx, y1: p.sy(s.whiskerLo), y2: p.sy(s.whiskerHi), stroke: 'var(--axis)', 'stroke-width': 1.5 }));
    g.appendChild(svgEl('line', { x1: cx - bw / 4, x2: cx + bw / 4, y1: p.sy(s.whiskerLo), y2: p.sy(s.whiskerLo), stroke: 'var(--axis)', 'stroke-width': 1.5 }));
    g.appendChild(svgEl('line', { x1: cx - bw / 4, x2: cx + bw / 4, y1: p.sy(s.whiskerHi), y2: p.sy(s.whiskerHi), stroke: 'var(--axis)', 'stroke-width': 1.5 }));
    // caja
    g.appendChild(svgEl('rect', {
      x: cx - bw / 2, y: p.sy(s.q3), width: bw, height: Math.max(1, p.sy(s.q1) - p.sy(s.q3)),
      fill: col, 'fill-opacity': 0.32, stroke: col, 'stroke-width': 1.8, rx: 2,
      'aria-label': `${grp.name}: caja de ${fmt(s.q1, 1)} a ${fmt(s.q3, 1)}`,
    }));
    // mediana
    g.appendChild(svgEl('line', {
      x1: cx - bw / 2, x2: cx + bw / 2, y1: p.sy(s.median), y2: p.sy(s.median),
      stroke: col, 'stroke-width': 3.2,
    }));
    // media (rombo) opcional
    if (opts.showMean) {
      const m = grp.values.reduce((a, b) => a + b, 0) / grp.values.length;
      g.appendChild(svgEl('path', {
        d: `M ${cx} ${p.sy(m) - 5} L ${cx + 5} ${p.sy(m)} L ${cx} ${p.sy(m) + 5} L ${cx - 5} ${p.sy(m)} Z`,
        fill: 'var(--ink)', 'aria-label': `media ${fmt(m, 1)}`,
      }));
    }
    // atípicos
    s.outliers.forEach((o) => {
      g.appendChild(svgEl('circle', {
        cx, cy: p.sy(o), r: 3.4, fill: 'none', stroke: 'var(--bad)', 'stroke-width': 1.6,
        'aria-label': `atípico ${fmt(o, 1)}`,
      }));
    });
  });
  p.svg.appendChild(g);
  return p.svg;
}

/* ======================================================== diagrama de disp. */

export function scatter(points, opts = {}) {
  const p = canvas({
    title: opts.title,
    desc: opts.desc || `Diagrama de dispersión con ${points.length} puntos.`,
    ...opts,
  });
  const xs = points.map((d) => d.x).filter(Number.isFinite);
  const ys = points.map((d) => d.y).filter(Number.isFinite);
  const [xlo, xhi] = safeRange(opts.xMin ?? (xs.length ? Math.min(...xs) : 0),
                               opts.xMax ?? (xs.length ? Math.max(...xs) : 1));
  const [ylo, yhi] = safeRange(opts.yMin ?? (ys.length ? Math.min(...ys) : 0),
                               opts.yMax ?? (ys.length ? Math.max(...ys) : 1));
  const px = (xhi - xlo) * 0.06 || 1, py = (yhi - ylo) * 0.08 || 1;
  p.sx = (v) => p.x0 + ((v - (xlo - px)) / ((xhi + px) - (xlo - px))) * p.pw;
  p.sy = (v) => p.y0 - ((v - (ylo - py)) / ((yhi + py) - (ylo - py))) * p.ph;
  p.ix = (px2) => (xlo - px) + ((px2 - p.x0) / p.pw) * ((xhi + px) - (xlo - px));
  p.iy = (py2) => (ylo - py) + ((p.y0 - py2) / p.ph) * ((yhi + py) - (ylo - py));

  drawAxes(p, {
    xTicks: niceTicks(xlo - px, xhi + px, 6),
    yTicks: niceTicks(ylo - py, yhi + py, 6),
    xLabel: opts.xLabel, yLabel: opts.yLabel,
    xFmt: opts.xFmt || ((v) => fmt(v, (xhi - xlo) < 12 ? 1 : 0)),
    yFmt: opts.yFmt || ((v) => fmt(v, (yhi - ylo) < 12 ? 1 : 0)),
  });

  // Recta de regresión / recta arbitraria
  if (opts.line) {
    const { intercept, slope, color = 'var(--data-2)', dash = null, label: lbl } = opts.line;
    const xa = xlo - px, xb = xhi + px;
    p.svg.appendChild(svgEl('line', {
      x1: p.sx(xa), y1: p.sy(intercept + slope * xa),
      x2: p.sx(xb), y2: p.sy(intercept + slope * xb),
      stroke: color, 'stroke-width': 2.4, 'stroke-dasharray': dash,
      'aria-label': lbl || 'recta ajustada',
    }));
  }
  // Segmentos de residuo
  if (opts.residualsTo) {
    const { intercept, slope } = opts.residualsTo;
    const g = svgEl('g', { 'stroke-width': 1.2, stroke: 'var(--data-6)', 'stroke-dasharray': '3 2', opacity: 0.85 });
    points.forEach((d) => {
      g.appendChild(svgEl('line', { x1: p.sx(d.x), x2: p.sx(d.x), y1: p.sy(d.y), y2: p.sy(intercept + slope * d.x) }));
    });
    p.svg.appendChild(g);
  }

  const g = svgEl('g');
  points.forEach((d, i) => {
    g.appendChild(svgEl('circle', {
      cx: p.sx(d.x), cy: p.sy(d.y), r: d.r || opts.r || 4.5,
      fill: d.color || opts.color || 'var(--data-1)',
      'fill-opacity': d.highlight ? 1 : 0.78,
      stroke: d.highlight ? 'var(--ink)' : 'var(--surface)', 'stroke-width': d.highlight ? 2 : 1,
      class: opts.draggable ? 'draggable' : null,
      'data-i': i,
      'aria-label': `punto ${i + 1}: x ${fmt(d.x, 1)}, y ${fmt(d.y, 1)}`,
    }));
  });
  p.svg.appendChild(g);
  p.svg.__plot = p;               // el laboratorio necesita las escalas inversas
  return p.svg;
}

/* ================================================ curva / función continua */

export function lineChart(seriesList, opts = {}) {
  const p = canvas({ title: opts.title, desc: opts.desc, ...opts });
  const allX = seriesList.flatMap((s) => s.points.map((q) => q.x)).filter(Number.isFinite);
  const allY = seriesList.flatMap((s) => s.points.map((q) => q.y)).filter(Number.isFinite);
  const [xlo, xhi] = safeRange(opts.xMin ?? (allX.length ? Math.min(...allX) : 0),
                               opts.xMax ?? (allX.length ? Math.max(...allX) : 1));
  const [ylo, yhi] = safeRange(opts.yMin ?? Math.min(0, ...(allY.length ? allY : [0])),
                               opts.yMax ?? (allY.length ? Math.max(...allY) * 1.08 : 1));
  p.sx = (v) => p.x0 + ((v - xlo) / (xhi - xlo)) * p.pw;
  p.sy = (v) => p.y0 - ((v - ylo) / (yhi - ylo)) * p.ph;

  drawAxes(p, {
    xTicks: opts.xTicks || niceTicks(xlo, xhi, 6),
    yTicks: opts.yTicks || niceTicks(ylo, yhi, 5),
    xLabel: opts.xLabel, yLabel: opts.yLabel,
    xFmt: opts.xFmt, yFmt: opts.yFmt || ((v) => fmt(v, 3)),
  });

  // Áreas sombreadas (colas, intervalos…)
  (opts.shade || []).forEach((sh) => {
    const pts = sh.points.map((q) => `${p.sx(q.x).toFixed(1)},${p.sy(q.y).toFixed(1)}`);
    p.svg.appendChild(svgEl('polygon', {
      points: `${p.sx(sh.points[0].x).toFixed(1)},${p.sy(0).toFixed(1)} ${pts.join(' ')} ${p.sx(sh.points[sh.points.length - 1].x).toFixed(1)},${p.sy(0).toFixed(1)}`,
      fill: sh.color || 'var(--data-4)', 'fill-opacity': sh.opacity ?? 0.3,
      'aria-label': sh.label || 'área sombreada',
    }));
  });

  seriesList.forEach((s, i) => {
    p.svg.appendChild(svgEl('polyline', {
      points: s.points.map((q) => `${p.sx(q.x).toFixed(1)},${p.sy(q.y).toFixed(1)}`).join(' '),
      fill: 'none', stroke: s.color || palette(i), 'stroke-width': s.width || 2.4,
      'stroke-dasharray': s.dash || null, 'aria-label': s.name,
    }));
  });

  (opts.vLines || []).forEach((v) => {
    p.svg.appendChild(svgEl('line', {
      x1: p.sx(v.x), x2: p.sx(v.x), y1: p.y0, y2: p.y1,
      stroke: v.color || 'var(--ink-3)', 'stroke-width': 1.6, 'stroke-dasharray': v.dash || '4 3',
    }));
    if (v.label) {
      p.svg.appendChild(label(v.label, p.sx(v.x), p.y1 + (v.labelOffset || 11),
        { fill: v.color || 'var(--ink-2)', 'font-weight': 700, 'font-size': 10 }));
    }
  });
  return p.svg;
}

/* ================================================================== ROC ---- */

export function rocChart(roc, opts = {}) {
  const p = canvas({
    title: opts.title || 'Curva ROC', w: 380, h: 380, ml: 52, mb: 50,
    desc: `Curva ROC con AUC = ${fmt(roc.auc, 3)}.`,
  });
  p.sx = (v) => p.x0 + v * p.pw;
  p.sy = (v) => p.y0 - v * p.ph;
  drawAxes(p, {
    xTicks: [0, 0.25, 0.5, 0.75, 1], yTicks: [0, 0.25, 0.5, 0.75, 1],
    xLabel: '1 − especificidad (falsos positivos)', yLabel: 'Sensibilidad',
    xFmt: (v) => fmt(v, 2), yFmt: (v) => fmt(v, 2),
  });
  p.svg.appendChild(svgEl('line', {
    x1: p.sx(0), y1: p.sy(0), x2: p.sx(1), y2: p.sy(1),
    stroke: 'var(--ink-3)', 'stroke-dasharray': '5 4', 'stroke-width': 1.4,
    'aria-label': 'diagonal de no discriminación',
  }));
  p.svg.appendChild(svgEl('polyline', {
    points: roc.points.map((q) => `${p.sx(q.fpr).toFixed(1)},${p.sy(q.tpr).toFixed(1)}`).join(' '),
    fill: 'var(--data-1)', 'fill-opacity': 0.14, stroke: 'var(--data-1)', 'stroke-width': 2.4,
  }));
  if (roc.bestCutoff && Number.isFinite(roc.bestCutoff.threshold)) {
    const c = roc.bestCutoff;
    p.svg.appendChild(svgEl('circle', {
      cx: p.sx(1 - c.specificity), cy: p.sy(c.sensitivity), r: 5.5,
      fill: 'var(--data-3)', stroke: 'var(--ink)', 'stroke-width': 1.6,
      'aria-label': `punto de Youden: sensibilidad ${fmt(c.sensitivity, 2)}, especificidad ${fmt(c.specificity, 2)}`,
    }));
  }
  p.svg.appendChild(label(`AUC = ${fmt(roc.auc, 3)}`, p.x1 - 6, p.y0 - 8,
    { 'text-anchor': 'end', 'font-weight': 700, 'font-size': 13, fill: 'var(--ink)' }));
  return p.svg;
}

/* ============================================ población de puntos (Bayes) --- */

/**
 * Retícula de personas: la herramienta más eficaz para que el VPP se vea.
 * `groups` = [{n, color, label}] en orden de pintado.
 */
export function pictogram(groups, opts = {}) {
  const total = groups.reduce((s, g) => s + g.n, 0);
  const cols = opts.cols || Math.ceil(Math.sqrt(total * 1.6));
  const rows = Math.ceil(total / cols);
  const cell = opts.cell || 13;
  const w = cols * cell + 8, h = rows * cell + 8;
  const svg = svgEl('svg', {
    viewBox: `0 0 ${w} ${h}`, role: 'img',
    'aria-label': opts.title || 'Retícula de población',
    style: 'width:100%;height:auto',
  });
  svg.appendChild(svgEl('desc', {
    text: groups.map((g) => `${g.label}: ${g.n} de ${total}`).join('; ') + '.',
  }));
  let i = 0;
  const g = svgEl('g');
  for (const grp of groups) {
    for (let k = 0; k < grp.n; k++, i++) {
      const cx = 4 + (i % cols) * cell + cell / 2;
      const cy = 4 + Math.floor(i / cols) * cell + cell / 2;
      g.appendChild(svgEl('circle', {
        cx, cy, r: cell * 0.36, fill: grp.color,
        stroke: grp.stroke || 'none', 'stroke-width': grp.stroke ? 1.4 : 0,
      }));
    }
  }
  svg.appendChild(g);
  return svg;
}

/* ================================================= dotplot / puntos 1D ----- */

export function dotplot(values, opts = {}) {
  const p = canvas({ title: opts.title, h: opts.h || 170, mb: 44, mt: 14, desc: opts.desc, ...opts });
  const clean = values.filter(Number.isFinite);
  const [lo, hi] = safeRange(opts.xMin ?? (clean.length ? Math.min(...clean) : 0),
                             opts.xMax ?? (clean.length ? Math.max(...clean) : 1));
  const pad = (hi - lo) * 0.06 || 1;
  p.sx = (v) => p.x0 + ((v - (lo - pad)) / ((hi + pad) - (lo - pad))) * p.pw;
  p.sy = () => p.y0;
  drawAxes(p, { xTicks: niceTicks(lo - pad, hi + pad, 6), yTicks: [], xLabel: opts.xLabel, xFmt: opts.xFmt });

  // apilado por proximidad
  const r = 4.2;
  const placed = [];
  const g = svgEl('g');
  values.slice().sort((a, b) => a - b).forEach((v) => {
    const x = p.sx(v);
    let level = 0;
    while (placed.some((q) => Math.abs(q.x - x) < r * 2 - 0.5 && q.level === level)) level++;
    placed.push({ x, level });
    g.appendChild(svgEl('circle', {
      cx: x, cy: p.y0 - 6 - level * (r * 2 + 1), r,
      fill: opts.color || 'var(--data-1)', 'fill-opacity': 0.85, stroke: 'var(--surface)',
    }));
  });
  p.svg.appendChild(g);

  (opts.marks || []).forEach((m) => {
    p.svg.appendChild(svgEl('line', {
      x1: p.sx(m.x), x2: p.sx(m.x), y1: p.y0 + 3, y2: p.y1,
      stroke: m.color || 'var(--data-6)', 'stroke-width': 2, 'stroke-dasharray': '4 3',
    }));
    p.svg.appendChild(label(m.label, p.sx(m.x), p.y1 + 10, { fill: m.color || 'var(--data-6)', 'font-weight': 700, 'font-size': 10 }));
  });
  return p.svg;
}

/* ================================================= barra apilada 100 % ---- */

export function stackedBar(segments, opts = {}) {
  const w = 520, h = opts.h || 54;
  const svg = svgEl('svg', {
    viewBox: `0 0 ${w} ${h}`, role: 'img',
    'aria-label': opts.title || 'Barra apilada',
    style: 'width:100%;height:auto',
  });
  const total = segments.reduce((s, d) => s + d.value, 0) || 1;
  svg.appendChild(svgEl('desc', { text: segments.map((s) => `${s.label} ${((s.value / total) * 100).toFixed(1)} %`).join('; ') }));
  let x = 0;
  segments.forEach((s, i) => {
    const sw = (s.value / total) * w;
    svg.appendChild(svgEl('rect', {
      x, y: 8, width: Math.max(0, sw - 1), height: h - 30, rx: 3,
      fill: s.color || palette(i), 'aria-label': `${s.label}: ${fmtInt(s.value)}`,
    }));
    if (sw > 44) {
      svg.appendChild(svgEl('text', {
        x: x + sw / 2, y: h - 30 + 2, 'text-anchor': 'middle', 'font-size': 11, 'font-weight': 700,
        fill: '#fff', text: `${Math.round((s.value / total) * 100)} %`,
      }));
    }
    x += sw;
  });
  return svg;
}

/* ========================================== distribución de una prueba ---- */

/**
 * Dibuja la distribución del estadístico bajo H0 con la región crítica y el
 * valor observado. Es el gráfico central del Mundo 9.
 */
export function testDistributionChart({ pdf, statistic, critical, xRange, tail = 'two-sided', label: statLabel = 't' }) {
  const [lo, hi] = xRange;
  const pts = [];
  for (let i = 0; i <= 240; i++) {
    const x = lo + ((hi - lo) * i) / 240;
    pts.push({ x, y: pdf(x) });
  }
  const shade = [];
  if (tail === 'two-sided' || tail === 'greater') {
    shade.push({ points: pts.filter((q) => q.x >= critical), color: 'var(--data-6)', label: 'región de rechazo derecha', opacity: 0.35 });
  }
  if (tail === 'two-sided' || tail === 'less') {
    shade.push({ points: pts.filter((q) => q.x <= -Math.abs(critical)), color: 'var(--data-6)', label: 'región de rechazo izquierda', opacity: 0.35 });
  }
  return lineChart([{ name: `Distribución de ${statLabel} bajo H₀`, points: pts, color: 'var(--data-1)' }], {
    shade,
    vLines: [{ x: statistic, color: 'var(--data-4)', label: `${statLabel} observado = ${fmt(statistic, 2)}`, dash: null }],
    yLabel: 'densidad', xLabel: statLabel,
    title: `Distribución de ${statLabel} bajo la hipótesis nula`,
    yFmt: (v) => fmt(v, 2),
  });
}

/** Leyenda accesible (texto + muestra de color). */
export function legend(items) {
  const wrap = document.createElement('div');
  wrap.className = 'legend';
  for (const it of items) {
    const span = document.createElement('span');
    span.className = 'legend__item';
    const sw = document.createElement('span');
    sw.className = 'legend__swatch';
    sw.style.background = it.color;
    span.appendChild(sw);
    span.appendChild(document.createTextNode(it.label));
    wrap.appendChild(span);
  }
  return wrap;
}
