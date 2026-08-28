/**
 * STATLAB — render de gráficos declarados en JSON
 * ---------------------------------------------------------------------------
 * Permite que una actividad describa un gráfico en el propio contenido
 * (`"chart": { "kind": "bar", ... }`) sin escribir código. Es lo que hace
 * posible el minijuego «Hospital de gráficos», donde hay que construir
 * gráficos deliberadamente defectuosos.
 */

import { el } from '../dom.js';
import * as viz from '../viz.js';

/** Dibuja un gráfico a partir de su especificación. Devuelve un nodo. */
export function renderChart(spec, extraOpts = {}) {
  if (!spec) return null;
  const opts = { ...(spec.opts || {}), ...extraOpts };
  let svg = null;
  try {
    switch (spec.kind) {
      case 'bar': svg = viz.barChart(spec.data, opts); break;
      case 'groupedBar': svg = viz.groupedBarChart(spec.categories, spec.series, opts); break;
      case 'pie': svg = viz.pieChart(spec.data, opts); break;
      case 'histogram': svg = viz.histogram(spec.values, opts); break;
      case 'boxplot': svg = viz.boxplot(spec.groups || spec.values, opts); break;
      case 'scatter': svg = viz.scatter(spec.points, opts); break;
      case 'line': svg = viz.lineChart(spec.series, opts); break;
      case 'dotplot': svg = viz.dotplot(spec.values, opts); break;
      case 'stackedBar': svg = viz.stackedBar(spec.segments, opts); break;
      case 'pictogram': svg = viz.pictogram(spec.groups, opts); break;
      case 'roc': svg = viz.rocChart(spec.roc, opts); break;
      default:
        return el('p', { class: 'muted small', text: `Tipo de gráfico no soportado: ${spec.kind}` });
    }
  } catch (err) {
    console.error('[chart-spec] error dibujando', spec.kind, err);
    return el('p', { class: 'muted small', text: 'No se ha podido dibujar el gráfico.' });
  }

  const box = el('div', { class: 'chartbox' }, [svg]);
  if (spec.legend) box.appendChild(viz.legend(spec.legend));
  if (spec.note) box.appendChild(el('p', { class: 'chart-note', text: spec.note }));
  return box;
}

/** Tarjeta con etiqueta, para las opciones de «elige el gráfico». */
export function chartOptionCard(option, { selected = false, onSelect, marked = null, keyLabel = '' }) {
  const card = el('button', {
    type: 'button',
    class: `option${selected ? '' : ''}`,
    'aria-pressed': String(selected),
    'data-id': option.id,
    style: { flexDirection: 'column', alignItems: 'stretch', gap: 'var(--s-2)' },
    onClick: () => onSelect?.(option.id),
  }, [
    el('span', { class: 'row', style: { gap: 'var(--s-2)' } }, [
      el('span', { class: 'option__key', 'aria-hidden': 'true', text: keyLabel }),
      el('span', { class: 'strong', text: option.label }),
      marked !== null ? el('span', { class: 'option__mark', text: marked ? '✓' : '✕' }) : null,
    ]),
    renderChart(option.chart, { w: 420, h: 240 }),
    marked !== null && option.why ? el('span', { class: 'option__why', text: option.why }) : null,
  ]);
  if (marked === true) card.classList.add('option--correct');
  if (marked === false) card.classList.add('option--wrong');
  return card;
}
