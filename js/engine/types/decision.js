/**
 * Tipo de actividad: DECISIÓN + JUSTIFICACIÓN.
 * Es el tipo más importante de STATLAB: no basta con elegir la prueba correcta,
 * hay que decir por qué. La puntuación es 70 % elección + 30 % justificación,
 * porque acertar por casualidad y acertar con criterio no pueden valer lo mismo.
 *
 * La justificación aparece SOLO después de elegir, para que el alumno se
 * comprometa primero con una decisión (evita ingeniería inversa desde las
 * razones).
 */
import { el, clear } from '../../dom.js';
import { t } from '../../i18n.js';
import { decisionScore, multiSelectScore } from '../../scoring.js';

const KEYS = 'ABCDEFGH';

export function mount(host, item, ctx = {}) {
  const options = item.options || [];
  const justify = item.justify || null;
  let chosen = null;
  const justSelected = new Set();
  const buttons = [];

  const testList = el('div', { class: 'options', role: 'radiogroup', 'aria-label': item.prompt });
  options.forEach((o, i) => {
    const btn = el('button', {
      type: 'button', class: 'option', 'aria-pressed': 'false', 'data-id': o.id,
      onClick: () => {
        chosen = o.id;
        buttons.forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.id === o.id)));
        renderJustify();
        ctx.onChange?.();
      },
    }, [
      el('span', { class: 'option__key', 'aria-hidden': 'true', text: KEYS[i] || String(i + 1) }),
      el('span', { class: 'option__text', text: o.text }),
    ]);
    buttons.push(btn);
    testList.appendChild(btn);
  });

  host.appendChild(testList);

  const justHost = el('div', { style: { marginTop: 'var(--s-5)' } });
  host.appendChild(justHost);

  const justButtons = [];

  function renderJustify() {
    if (!justify || !chosen) return;
    if (justHost.dataset.done === '1') return;
    justHost.dataset.done = '1';
    clear(justHost);
    justHost.appendChild(el('h3', { class: 'card__title', text: t('activity.justify') }));
    justHost.appendChild(el('p', { class: 'small muted', text: justify.prompt || t('activity.justifyHint') }));
    const list = el('div', { class: 'options' });
    (justify.options || []).forEach((o) => {
      const btn = el('button', {
        type: 'button', class: 'option', 'aria-pressed': 'false', 'data-id': o.id,
        onClick: () => {
          if (justSelected.has(o.id)) justSelected.delete(o.id); else justSelected.add(o.id);
          btn.setAttribute('aria-pressed', String(justSelected.has(o.id)));
          btn.querySelector('.option__key').textContent = justSelected.has(o.id) ? '☑' : '□';
          ctx.onChange?.();
        },
      }, [
        el('span', { class: 'option__key', 'aria-hidden': 'true', text: '□' }),
        el('span', { class: 'option__text', text: o.text }),
      ]);
      justButtons.push(btn);
      list.appendChild(btn);
    });
    justHost.appendChild(list);
    if (justify.min) {
      justHost.appendChild(el('p', { class: 'xsmall muted', text: `Marca al menos ${justify.min} razones.` }));
    }
  }

  return {
    read: () => ({ chosen, justification: Array.from(justSelected) }),
    hasAnswer: () => chosen !== null && (!justify || justSelected.size >= (justify.min || 1)),
    grade(answer) {
      const score = decisionScore(answer, item);
      const primaryOk = answer.chosen === item.answer;
      const acceptable = (item.acceptable || []).includes(answer.chosen);
      let justScore = null;
      if (justify) {
        const opts = justify.options || [];
        justScore = multiSelectScore(answer.justification || [], opts.filter((o) => o.correct).map((o) => o.id), opts.map((o) => o.id));
      }
      return { score, chosen: answer, primaryOk, acceptable, justScore };
    },
    mark(answer, grade) {
      buttons.forEach((b) => {
        const id = b.dataset.id;
        const o = options.find((x) => x.id === id);
        const isCorrect = id === item.answer;
        const isAcceptable = (item.acceptable || []).includes(id);
        if (isCorrect) b.classList.add('option--correct');
        else if (id === answer.chosen && !isAcceptable) b.classList.add('option--wrong');
        if (isCorrect || id === answer.chosen) {
          b.appendChild(el('span', { class: 'option__mark', text: isCorrect ? '✓' : isAcceptable ? '≈' : '✕' }));
          if (o?.why) b.querySelector('.option__text').appendChild(el('span', { class: 'option__why', text: o.why }));
        }
        b.disabled = true;
      });
      if (grade.acceptable && item.acceptableNote) {
        host.appendChild(el('div', { class: 'callout callout--warn', style: { marginTop: 'var(--s-3)' } }, [
          el('span', { class: 'callout__title', text: 'Elección parcialmente aceptable' }),
          item.acceptableNote,
        ]));
      }
      if (justify) {
        const sel = new Set(answer.justification || []);
        justButtons.forEach((b) => {
          const id = b.dataset.id;
          const o = (justify.options || []).find((x) => x.id === id);
          const ok = !!o?.correct;
          if (ok) b.classList.add('option--correct');
          else if (sel.has(id)) b.classList.add('option--wrong');
          b.querySelector('.option__key').textContent = ok ? '☑' : sel.has(id) ? '☒' : '□';
          b.disabled = true;
        });
      }
    },
    lock() {
      buttons.forEach((b) => { b.disabled = true; });
      justButtons.forEach((b) => { b.disabled = true; });
    },
    reset() {
      chosen = null;
      justSelected.clear();
      justButtons.length = 0;
      justHost.dataset.done = '';
      clear(justHost);
      buttons.forEach((b) => {
        b.disabled = false;
        b.setAttribute('aria-pressed', 'false');
        b.classList.remove('option--correct', 'option--wrong');
        b.querySelector('.option__mark')?.remove();
        b.querySelector('.option__why')?.remove();
      });
    },
    describeAnswer(answer) {
      const o = options.find((x) => x.id === answer?.chosen);
      const n = (answer?.justification || []).length;
      return o ? `${o.text} (${n} razones marcadas)` : '—';
    },
    describeCorrect() {
      return options.find((x) => x.id === item.answer)?.text || '—';
    },
  };
}
