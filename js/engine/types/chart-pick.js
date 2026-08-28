/**
 * Tipo de actividad: elegir el gráfico adecuado.
 * Se dibujan de verdad los cuatro gráficos candidatos (no se describen con
 * palabras): la competencia que se entrena es MIRAR un gráfico y juzgarlo.
 */
import { el } from '../../dom.js';
import { chartOptionCard } from '../chart-spec.js';

const KEYS = 'ABCD';

export function mount(host, item, ctx = {}) {
  const options = item.options || [];
  let selected = null;
  const grid = el('div', { class: 'grid grid--2' });
  const cards = new Map();

  function paint(marked = false, answer = null) {
    grid.replaceChildren();
    cards.clear();
    options.forEach((o, i) => {
      const isCorrect = item.answer ? o.id === item.answer : !!o.correct;
      const card = chartOptionCard(o, {
        selected: selected === o.id,
        keyLabel: KEYS[i] || String(i + 1),
        marked: marked ? (isCorrect ? true : (answer === o.id ? false : null)) : null,
        onSelect: (id) => { selected = id; paint(); ctx.onChange?.(); },
      });
      if (marked) card.disabled = true;
      cards.set(o.id, card);
      grid.appendChild(card);
    });
  }
  paint();
  host.appendChild(grid);

  return {
    read: () => selected,
    hasAnswer: () => selected !== null,
    grade(answer) {
      const correctId = item.answer || options.find((o) => o.correct)?.id;
      return { score: answer === correctId ? 1 : 0, chosen: answer };
    },
    mark(answer) { paint(true, answer); },
    lock() { grid.querySelectorAll('button').forEach((b) => { b.disabled = true; }); },
    reset() { selected = null; paint(); },
    describeAnswer: (answer) => options.find((o) => o.id === answer)?.label || '—',
    describeCorrect: () => options.find((o) => o.id === (item.answer || options.find((x) => x.correct)?.id))?.label || '—',
  };
}
