/**
 * Tipo de actividad: diagnosticar un gráfico.
 * Se muestra un gráfico (a menudo con defectos deliberados) y una lista de
 * posibles problemas. Selección múltiple con crédito parcial: hay que
 * encontrar los defectos reales SIN marcar los inventados, que es exactamente
 * la competencia crítica que se busca.
 */
import { el } from '../../dom.js';
import { multiSelectScore } from '../../scoring.js';
import { renderChart } from '../chart-spec.js';

export function mount(host, item, ctx = {}) {
  const options = item.options || [];
  const correctIds = item.answer || options.filter((o) => o.correct).map((o) => o.id);
  const selected = new Set();
  const buttons = [];

  if (item.chart) host.appendChild(el('div', { style: { marginBottom: 'var(--s-4)' } }, [renderChart(item.chart)]));

  const list = el('div', { class: 'options' });
  options.forEach((o) => {
    const btn = el('button', {
      type: 'button', class: 'option', 'aria-pressed': 'false', 'data-id': o.id,
      onClick: () => {
        if (selected.has(o.id)) selected.delete(o.id); else selected.add(o.id);
        btn.setAttribute('aria-pressed', String(selected.has(o.id)));
        ctx.onChange?.();
      },
    }, [
      el('span', { class: 'option__key', 'aria-hidden': 'true', text: '□' }),
      el('span', { class: 'option__text', text: o.text }),
    ]);
    buttons.push(btn);
    list.appendChild(btn);
  });
  host.appendChild(list);
  host.appendChild(el('p', { class: 'xsmall muted', text: 'Marca solo los problemas reales. Marcar problemas inexistentes resta.' }));

  return {
    read: () => Array.from(selected),
    hasAnswer: () => selected.size > 0,
    grade(answer) {
      return { score: multiSelectScore(answer, correctIds, options.map((o) => o.id)), chosen: answer };
    },
    mark(answer) {
      const sel = new Set(answer);
      buttons.forEach((b) => {
        const id = b.dataset.id;
        const o = options.find((x) => x.id === id);
        const isCorrect = correctIds.includes(id);
        if (isCorrect) b.classList.add('option--correct');
        else if (sel.has(id)) b.classList.add('option--wrong');
        b.querySelector('.option__key').textContent = isCorrect ? '☑' : sel.has(id) ? '☒' : '□';
        if (o?.why && (isCorrect || sel.has(id))) {
          b.querySelector('.option__text').appendChild(el('span', { class: 'option__why', text: o.why }));
        }
      });
    },
    lock() { buttons.forEach((b) => { b.disabled = true; }); },
    reset() {
      selected.clear();
      buttons.forEach((b) => {
        b.disabled = false;
        b.setAttribute('aria-pressed', 'false');
        b.classList.remove('option--correct', 'option--wrong');
        b.querySelector('.option__key').textContent = '□';
        b.querySelector('.option__why')?.remove();
      });
    },
    describeAnswer: (answer) => (answer || []).map((id) => options.find((o) => o.id === id)?.text).join(' · ') || '—',
    describeCorrect: () => correctIds.map((id) => options.find((o) => o.id === id)?.text).join(' · '),
  };
}
