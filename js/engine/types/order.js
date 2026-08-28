/**
 * Tipo de actividad: ordenar elementos.
 * Crédito parcial por pares en orden relativo correcto (concordancia tipo
 * Kendall), de modo que casi acertar el orden no puntúa como fallo total.
 * Los controles son botones «subir/bajar»: funcionan con teclado y en móvil,
 * a diferencia del arrastre puro.
 */
import { el, announce } from '../../dom.js';
import { orderScore } from '../../scoring.js';

export function mount(host, item, ctx = {}) {
  const items = item.items || [];
  // Orden inicial: mezclado de forma determinista (invertido y rotado) para
  // que nunca aparezca ya resuelto pero sea reproducible.
  let order = items.map((i) => i.id).slice().reverse();
  if (order.length > 2) order = [...order.slice(1), order[0]];

  const list = el('ol', { class: 'orderlist', 'aria-label': item.prompt || 'Ordena los elementos' });
  host.appendChild(list);
  host.appendChild(el('p', { class: 'xsmall muted', text: 'Usa las flechas para mover cada elemento arriba o abajo.' }));

  function move(id, dir) {
    const i = order.indexOf(id);
    const j = i + dir;
    if (j < 0 || j >= order.length) return;
    [order[i], order[j]] = [order[j], order[i]];
    paint();
    announce(`Movido a la posición ${j + 1}.`);
    ctx.onChange?.();
  }

  let locked = false;
  let marks = null;

  function paint() {
    list.replaceChildren();
    order.forEach((id, idx) => {
      const it = items.find((x) => x.id === id);
      const mark = marks ? marks[id] : null;
      list.appendChild(el('li', {
        class: mark === true ? 'token--correct' : mark === false ? 'token--wrong' : '',
      }, [
        el('span', { class: 'orderlist__n', 'aria-hidden': 'true', text: `${idx + 1}.` }),
        el('span', { class: 'grow', text: it.text }),
        mark !== null && mark !== undefined
          ? el('span', { class: 'token__mark', text: mark ? '✓' : `→ ${it.pos}` })
          : el('span', { class: 'orderlist__ctrl' }, [
            el('button', {
              type: 'button', class: 'btn btn--sm btn--ghost', disabled: locked || idx === 0,
              'aria-label': `Subir ${it.text}`, html: '<span aria-hidden="true">▲</span>',
              onClick: () => move(id, -1),
            }),
            el('button', {
              type: 'button', class: 'btn btn--sm btn--ghost', disabled: locked || idx === order.length - 1,
              'aria-label': `Bajar ${it.text}`, html: '<span aria-hidden="true">▼</span>',
              onClick: () => move(id, 1),
            }),
          ]),
      ]));
    });
  }
  paint();

  return {
    read: () => order.slice(),
    hasAnswer: () => true,
    grade(answer) {
      return { score: orderScore(answer, items), chosen: answer };
    },
    mark(answer) {
      marks = {};
      answer.forEach((id, idx) => {
        const it = items.find((x) => x.id === id);
        marks[id] = it.pos === idx + 1;
      });
      paint();
    },
    lock() { locked = true; paint(); },
    reset() {
      marks = null; locked = false;
      order = items.map((i) => i.id).slice().reverse();
      if (order.length > 2) order = [...order.slice(1), order[0]];
      paint();
    },
    describeAnswer(answer) {
      return answer.map((id, i) => `${i + 1}. ${items.find((x) => x.id === id)?.text}`).join(' · ');
    },
    describeCorrect() {
      return items.slice().sort((a, b) => a.pos - b.pos).map((it, i) => `${i + 1}. ${it.text}`).join(' · ');
    },
  };
}
