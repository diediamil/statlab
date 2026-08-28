/**
 * Tipo de actividad: selección múltiple con crédito parcial.
 * La puntuación penaliza los falsos positivos para que «marcarlo todo» no sea
 * una estrategia rentable (ver scoring.multiSelectScore).
 */
import { el, $$ } from '../../dom.js';
import { t } from '../../i18n.js';
import { multiSelectScore } from '../../scoring.js';

const KEYS = 'ABCDEFGH';

export function mount(host, item, ctx = {}) {
  const options = item.options || [];
  const correctIds = item.answer || options.filter((o) => o.correct).map((o) => o.id);
  const selected = new Set();
  const buttons = [];

  const list = el('div', { class: 'options' });
  options.forEach((o, i) => {
    const btn = el('button', {
      type: 'button', class: 'option', 'aria-pressed': 'false', 'data-id': o.id,
      onClick: () => {
        if (selected.has(o.id)) selected.delete(o.id); else selected.add(o.id);
        btn.setAttribute('aria-pressed', String(selected.has(o.id)));
        ctx.onChange?.();
      },
    }, [
      el('span', { class: 'option__key', 'aria-hidden': 'true', text: KEYS[i] || String(i + 1) }),
      el('span', { class: 'option__text', text: o.text }),
    ]);
    buttons.push(btn);
    list.appendChild(btn);
  });

  host.appendChild(list);
  host.appendChild(el('p', { class: 'xsmall muted', text: t('activity.selectAll') }));

  return {
    read: () => Array.from(selected),
    hasAnswer: () => selected.size > 0,
    grade(answer) {
      const score = multiSelectScore(answer, correctIds, options.map((o) => o.id));
      return { score, chosen: answer, correctIds };
    },
    mark(answer) {
      const sel = new Set(answer);
      buttons.forEach((b) => {
        const id = b.dataset.id;
        const o = options.find((x) => x.id === id);
        const isCorrect = correctIds.includes(id);
        if (isCorrect) b.classList.add('option--correct');
        else if (sel.has(id)) b.classList.add('option--wrong');
        if (isCorrect || sel.has(id)) {
          b.appendChild(el('span', {
            class: 'option__mark', 'aria-hidden': 'true',
            text: isCorrect ? (sel.has(id) ? '✓' : '·') : '✕',
          }));
          if (o?.why) b.querySelector('.option__text').appendChild(el('span', { class: 'option__why', text: o.why }));
        }
      });
    },
    lock() { $$('.option', host).forEach((b) => { b.disabled = true; }); },
    reset() {
      selected.clear();
      buttons.forEach((b) => {
        b.setAttribute('aria-pressed', 'false');
        b.classList.remove('option--correct', 'option--wrong');
        b.disabled = false;
        b.querySelector('.option__mark')?.remove();
        b.querySelector('.option__why')?.remove();
      });
    },
    describeAnswer(answer) {
      return (answer || []).map((id) => options.find((o) => o.id === id)?.text).filter(Boolean).join(' · ') || '—';
    },
    describeCorrect() {
      return correctIds.map((id) => options.find((o) => o.id === id)?.text).filter(Boolean).join(' · ');
    },
  };
}
