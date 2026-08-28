/**
 * Tipo de actividad: clasificar por arrastre (drag & drop) con crédito parcial.
 *
 * ACCESIBILIDAD: el arrastre nunca es el único camino. Cada ficha es un botón
 * enfocable; con Espacio/Intro se «coge», y entonces se puede soltar en un
 * contenedor pulsándolo o eligiéndolo con las flechas. También funciona con
 * eventos de puntero (táctil incluido) además de la API HTML5 de arrastre.
 */
import { el, $$, announce } from '../../dom.js';
import { t } from '../../i18n.js';
import { classifyScore } from '../../scoring.js';

export function mount(host, item, ctx = {}) {
  const items = item.items || [];
  const bins = item.bins || [];
  /** id de ficha → id de contenedor (o null si está en el almacén) */
  const placement = Object.fromEntries(items.map((i) => [i.id, null]));
  let carried = null;                 // ficha «cogida» por teclado

  const pool = el('div', {
    class: 'dnd__pool', 'data-bin': '', role: 'group', 'aria-label': 'Elementos sin clasificar',
  });
  const binNodes = new Map();

  const binsWrap = el('div', { class: 'dnd__bins' });
  bins.forEach((b) => {
    const itemsBox = el('div', { class: 'dnd__items' });
    const node = el('div', {
      class: 'dnd__bin', 'data-bin': b.id, role: 'group', 'aria-label': b.title,
      tabindex: '0',
      onClick: () => { if (carried) drop(carried, b.id); },
      onKeydown: (e) => {
        if ((e.key === 'Enter' || e.key === ' ') && carried) { e.preventDefault(); drop(carried, b.id); }
      },
    }, [
      el('div', { class: 'dnd__bin-title', text: b.title }),
      b.desc ? el('div', { class: 'dnd__bin-desc', text: b.desc }) : null,
      itemsBox,
    ]);
    node.__items = itemsBox;
    binNodes.set(b.id, node);
    binsWrap.appendChild(node);
  });

  host.appendChild(el('div', { class: 'dnd' }, [
    pool,
    binsWrap,
    el('p', { class: 'dnd__help', text: t('activity.dragHelp') }),
    el('p', { class: 'dnd__help', text: t('activity.dragHelpKeyboard') }),
  ]));

  /* ---------------------------------------------------------- fichas ---- */

  const tokens = new Map();
  items.forEach((it) => {
    const token = el('button', {
      type: 'button', class: 'token', draggable: 'true', 'data-id': it.id,
      'aria-label': `${it.text}. Sin clasificar.`,
      onClick: (e) => {
        e.stopPropagation();
        if (carried === it.id) { setCarried(null); }
        else setCarried(it.id);
      },
      onKeydown: (e) => {
        if (e.key === ' ' || e.key === 'Enter') {
          e.preventDefault();
          if (carried === it.id) setCarried(null); else setCarried(it.id);
        }
        if (carried === it.id && /^[1-9]$/.test(e.key)) {
          const b = bins[Number(e.key) - 1];
          if (b) { e.preventDefault(); drop(it.id, b.id); }
        }
        if (e.key === 'Escape') setCarried(null);
      },
      onDragstart: (e) => {
        e.dataTransfer.setData('text/plain', it.id);
        e.dataTransfer.effectAllowed = 'move';
        token.classList.add('is-dragging');
      },
      onDragend: () => token.classList.remove('is-dragging'),
    }, [el('span', { text: it.text })]);
    tokens.set(it.id, token);
    pool.appendChild(token);
  });

  function setCarried(id) {
    carried = id;
    tokens.forEach((tk, key) => tk.classList.toggle('is-selected', key === id));
    if (id) announce(`${items.find((i) => i.id === id).text} seleccionado. Elige una categoría.`);
  }

  function drop(itemId, binId) {
    placement[itemId] = binId;
    const token = tokens.get(itemId);
    const target = binId ? binNodes.get(binId).__items : pool;
    target.appendChild(token);
    const binTitle = binId ? bins.find((b) => b.id === binId).title : 'Sin clasificar';
    token.setAttribute('aria-label', `${items.find((i) => i.id === itemId).text}. ${binTitle}.`);
    setCarried(null);
    announce(`Colocado en ${binTitle}.`);
    ctx.onChange?.();
  }

  /* --------------------------------------------- arrastre con puntero --- */

  [pool, ...binNodes.values()].forEach((zone) => {
    zone.addEventListener('dragover', (e) => { e.preventDefault(); zone.classList.add('is-over'); });
    zone.addEventListener('dragleave', () => zone.classList.remove('is-over'));
    zone.addEventListener('drop', (e) => {
      e.preventDefault();
      zone.classList.remove('is-over');
      const id = e.dataTransfer.getData('text/plain');
      if (id) drop(id, zone.dataset.bin || null);
    });
  });

  return {
    read: () => ({ ...placement }),
    hasAnswer: () => Object.values(placement).every((v) => v !== null),
    grade(answer) {
      return { score: classifyScore(answer, items), chosen: answer };
    },
    mark(answer) {
      items.forEach((it) => {
        const token = tokens.get(it.id);
        const ok = answer[it.id] === it.bin;
        token.classList.add(ok ? 'token--correct' : 'token--wrong');
        token.appendChild(el('span', { class: 'token__mark', 'aria-hidden': 'true', text: ok ? '✓' : '✕' }));
        if (!ok) {
          const right = bins.find((b) => b.id === it.bin);
          token.setAttribute('aria-label', `${it.text}. Incorrecto. Correcto: ${right?.title}.`);
          token.appendChild(el('span', { class: 'xsmall', text: ` → ${right?.title}` }));
        }
      });
    },
    lock() { $$('.token', host).forEach((b) => { b.disabled = true; b.draggable = false; }); },
    reset() {
      items.forEach((it) => {
        placement[it.id] = null;
        const tk = tokens.get(it.id);
        tk.classList.remove('token--correct', 'token--wrong', 'is-selected');
        tk.disabled = false;
        tk.draggable = true;
        tk.querySelector('.token__mark')?.remove();
        tk.querySelector('.xsmall')?.remove();
        pool.appendChild(tk);
      });
    },
    describeAnswer(answer) {
      return items.map((it) => {
        const b = bins.find((x) => x.id === answer[it.id]);
        return `${it.text} → ${b ? b.title : '—'}`;
      }).join(' · ');
    },
    describeCorrect() {
      return items.map((it) => `${it.text} → ${bins.find((b) => b.id === it.bin)?.title}`).join(' · ');
    },
  };
}
