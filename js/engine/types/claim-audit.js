/**
 * Tipo de actividad: auditoría de afirmaciones (correcto / incorrecto).
 * Cada afirmación se juzga por separado con crédito parcial, y al corregir se
 * muestra la razón de cada una. Es el formato más eficaz para atacar errores
 * conceptuales, porque obliga a comprometerse con un juicio.
 */
import { el } from '../../dom.js';
import { claimAuditScore } from '../../scoring.js';

export function mount(host, item, ctx = {}) {
  const claims = item.claims || [];
  const answers = {};
  const rows = new Map();

  const wrap = el('div', { class: 'stack' });

  claims.forEach((c, i) => {
    const name = `claim-${item.id || 'x'}-${c.id}`;
    const mkBtn = (value, label) => el('button', {
      type: 'button', class: 'btn btn--sm', 'data-val': String(value),
      'aria-pressed': 'false', text: label,
      onClick: () => {
        answers[c.id] = value;
        row.querySelectorAll('button[data-val]').forEach((b) => {
          b.setAttribute('aria-pressed', String(b.dataset.val === String(value)));
          b.classList.toggle('btn--primary', b.dataset.val === String(value));
        });
        ctx.onChange?.();
      },
    });

    const yes = mkBtn(true, 'Correcta');
    const no = mkBtn(false, 'Incorrecta');
    const row = el('div', {
      class: 'panel', role: 'group', 'aria-label': `Afirmación ${i + 1}`, id: name,
    }, [
      el('p', { class: 'mb-0', style: { marginBottom: 'var(--s-3)' } }, [
        el('b', { text: `${i + 1}. ` }), c.text,
      ]),
      el('div', { class: 'row' }, [yes, no]),
      el('div', { class: 'claim-why' }),
    ]);
    rows.set(c.id, row);
    wrap.appendChild(row);
  });

  host.appendChild(wrap);
  host.appendChild(el('p', { class: 'xsmall muted', text: 'Juzga cada afirmación por separado. Se puntúa cada una.' }));

  return {
    read: () => ({ ...answers }),
    hasAnswer: () => claims.every((c) => c.id in answers),
    grade(answer) {
      return { score: claimAuditScore(answer, claims), chosen: answer };
    },
    mark(answer) {
      claims.forEach((c) => {
        const row = rows.get(c.id);
        const ok = answer[c.id] === c.correct;
        row.style.borderLeft = `4px solid ${ok ? 'var(--ok)' : 'var(--bad)'}`;
        row.querySelector('.claim-why').replaceChildren(
          el('p', { class: 'small mb-0', style: { marginTop: 'var(--s-2)' } }, [
            el('b', { text: ok ? '✓ ' : '✕ ' }),
            el('b', { text: `Es ${c.correct ? 'CORRECTA' : 'INCORRECTA'}. ` }),
            c.why,
          ]),
        );
      });
    },
    lock() { host.querySelectorAll('button[data-val]').forEach((b) => { b.disabled = true; }); },
    reset() {
      for (const k of Object.keys(answers)) delete answers[k];
      rows.forEach((row) => {
        row.style.borderLeft = '';
        row.querySelector('.claim-why').replaceChildren();
        row.querySelectorAll('button[data-val]').forEach((b) => {
          b.disabled = false;
          b.setAttribute('aria-pressed', 'false');
          b.classList.remove('btn--primary');
        });
      });
    },
    describeAnswer(answer) {
      return claims.map((c, i) => `${i + 1}: ${answer[c.id] === undefined ? '—' : answer[c.id] ? 'correcta' : 'incorrecta'}`).join(' · ');
    },
    describeCorrect() {
      return claims.map((c, i) => `${i + 1}: ${c.correct ? 'correcta' : 'incorrecta'}`).join(' · ');
    },
  };
}
