/**
 * Tipo de actividad: respuesta numérica con tolerancia.
 * Acepta coma o punto decimal (en España se escribe con coma).
 * `misconceptionFeedback` permite responder a errores concretos: si el alumno
 * escribe el valor típico del error habitual, recibe una explicación dirigida.
 */
import { el } from '../../dom.js';
import { t } from '../../i18n.js';
import { fmt, parseNum } from '../../utils.js';
import { numericScore } from '../../scoring.js';

export function mount(host, item, ctx = {}) {
  const tol = item.tolerance ?? 0;
  const input = el('input', {
    class: 'input input--num', type: 'text', inputmode: 'decimal',
    autocomplete: 'off', 'aria-label': item.prompt || 'Respuesta numérica',
    id: `num-${item.id || 'x'}`,
    onInput: () => ctx.onChange?.(),
    onKeydown: (e) => { if (e.key === 'Enter') { e.preventDefault(); ctx.onSubmit?.(); } },
  });

  const wrap = el('div', { class: 'row' }, [
    input,
    item.unit ? el('span', { class: 'muted', text: item.unit }) : null,
  ]);

  host.appendChild(wrap);
  host.appendChild(el('p', { class: 'xsmall muted' }, [
    t('activity.typeNumber'),
    tol ? ' ' + t('activity.tolerance', { tol: fmt(tol, 2) }) : '',
  ]));

  const feedbackHost = el('div');
  host.appendChild(feedbackHost);

  return {
    read: () => parseNum(input.value),
    hasAnswer: () => input.value.trim() !== '' && Number.isFinite(parseNum(input.value)),
    grade(answer) {
      const score = numericScore(answer, item.answer, tol);
      let targeted = null;
      if (!score && item.misconceptionFeedback) {
        for (const [k, msg] of Object.entries(item.misconceptionFeedback)) {
          if (Math.abs(answer - Number(k)) <= Math.max(tol, Math.abs(Number(k)) * 0.005)) { targeted = msg; break; }
        }
      }
      return { score, chosen: answer, targeted };
    },
    mark(answer, grade) {
      input.setAttribute('aria-invalid', String(!grade.score));
      input.style.borderColor = grade.score ? 'var(--ok)' : 'var(--bad)';
      if (grade.targeted) {
        feedbackHost.appendChild(el('div', { class: 'callout callout--warn', style: { marginTop: 'var(--s-3)' } }, [
          el('span', { class: 'callout__title', text: 'Ojo con este razonamiento' }),
          grade.targeted,
        ]));
      }
    },
    focus() { input.focus(); },
    lock() { input.disabled = true; },
    reset() {
      input.value = '';
      input.disabled = false;
      input.style.borderColor = '';
      input.removeAttribute('aria-invalid');
      feedbackHost.replaceChildren();
    },
    describeAnswer: (answer) => (Number.isFinite(answer) ? `${fmt(answer, 3)}${item.unit ? ' ' + item.unit : ''}` : '—'),
    describeCorrect: () => `${fmt(item.answer, 3)}${item.unit ? ' ' + item.unit : ''}`,
  };
}
