/**
 * Tipo de actividad: elección única (mcq).
 * Cada opción lleva su propio `why`, que se muestra al corregir. Así el alumno
 * no solo sabe qué falló: sabe por qué cada distractor era un distractor.
 */
import { el, $$ } from '../../dom.js';
import { t } from '../../i18n.js';

const KEYS = 'ABCDEFGH';

export function mount(host, item, ctx = {}) {
  let selected = null;
  const options = item.options || [];
  const buttons = [];

  const list = el('div', { class: 'options', role: 'radiogroup', 'aria-label': item.prompt || t('activity.selectOne') });

  options.forEach((o, i) => {
    const btn = el('button', {
      type: 'button', class: 'option', 'aria-pressed': 'false', 'data-id': o.id,
      onClick: () => {
        selected = o.id;
        buttons.forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.id === o.id)));
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
  host.appendChild(el('p', { class: 'xsmall muted', text: t('activity.selectOne') }));

  return {
    read: () => selected,
    hasAnswer: () => selected !== null,
    grade(answer) {
      return { score: answer === item.answer ? 1 : 0, chosen: answer };
    },
    mark(answer) {
      buttons.forEach((b) => {
        const id = b.dataset.id;
        const o = options.find((x) => x.id === id);
        const isCorrect = id === item.answer;
        const isChosen = id === answer;
        if (isCorrect) b.classList.add('option--correct');
        if (isChosen && !isCorrect) b.classList.add('option--wrong');
        if (isChosen || isCorrect) {
          b.appendChild(el('span', {
            class: 'option__mark', 'aria-hidden': 'true',
            text: isCorrect ? '✓' : '✕',
          }));
        }
        if (o?.why && (isChosen || isCorrect)) {
          b.querySelector('.option__text').appendChild(el('span', { class: 'option__why', text: o.why }));
        }
      });
    },
    lock() { $$('.option', host).forEach((b) => { b.disabled = true; }); },
    reset() {
      selected = null;
      buttons.forEach((b) => {
        b.setAttribute('aria-pressed', 'false');
        b.classList.remove('option--correct', 'option--wrong');
        b.disabled = false;
        b.querySelector('.option__mark')?.remove();
        b.querySelector('.option__why')?.remove();
      });
    },
    describeAnswer(answer) {
      const o = options.find((x) => x.id === answer);
      return o ? o.text : '—';
    },
    describeCorrect() {
      const o = options.find((x) => x.id === item.answer);
      return o ? o.text : '—';
    },
  };
}
