/**
 * STATLAB — motor de actividades
 * ---------------------------------------------------------------------------
 * Un único componente pinta CUALQUIER tipo de actividad y gestiona el ciclo
 * completo: enunciado → respuesta → comprobación → feedback → reintento o
 * siguiente. Los tipos concretos viven en `engine/types/*` y solo se ocupan de
 * su interacción y su puntuación.
 *
 * Feedback: nunca se muestra un «Incorrecto» pelado. Siempre se dice QUÉ falló,
 * POR QUÉ y QUÉ CONCEPTO revisar (requisito explícito del diseño).
 */

import { el, clear, announce } from '../dom.js';
import { t } from '../i18n.js';
import { fmt } from '../utils.js';
import { getConcept } from '../content.js';
import { renderChart } from './chart-spec.js';
import { instantiate } from '../generators.js';

import * as mcq from './types/mcq.js';
import * as multi from './types/multi.js';
import * as numeric from './types/numeric.js';
import * as classify from './types/classify.js';
import * as order from './types/order.js';
import * as claimAudit from './types/claim-audit.js';
import * as chartPick from './types/chart-pick.js';
import * as chartFix from './types/chart-fix.js';
import * as decision from './types/decision.js';
import * as table2x2 from './types/table2x2.js';

const TYPES = {
  mcq, multi, numeric, classify, order,
  'claim-audit': claimAudit,
  'chart-pick': chartPick,
  'chart-fix': chartFix,
  decision, table2x2,
};

export const SUPPORTED_TYPES = Object.keys(TYPES);

/**
 * Monta una actividad.
 * @param {HTMLElement} host
 * @param {object} activity  actividad o paso de reto
 * @param {object} opts
 *    mode: 'practice' | 'challenge'
 *    allowHints, immediateFeedback, maxAttempts
 *    seed: semilla para el generador procedural
 *    onAttempt(result), onComplete(result)
 *    nextLabel, showXp
 */
export function mountActivity(host, activity, opts = {}) {
  const {
    mode = 'practice',
    allowHints = true,
    immediateFeedback = true,
    maxAttempts = mode === 'challenge' ? 1 : 3,
    seed = null,
    onAttempt = null,
    onComplete = null,
    nextLabel = null,
    showXp = mode === 'practice',
    /**
     * Corrector externo. En los retos con Supabase el paso se corrige EN EL
     * SERVIDOR (`statlab_submit_challenge_step`), porque las respuestas
     * correctas no viajan al navegador. Si se pasa, sustituye a la corrección
     * local del tipo de actividad.
     *   grader(answer, item, state) → { score, correct, explanation? }
     */
    grader = null,
  } = opts;

  const item = instantiate(activity, seed);
  const impl = TYPES[item.type];
  clear(host);

  if (!impl) {
    host.appendChild(el('div', { class: 'callout callout--warn' }, [
      `Tipo de actividad no soportado: “${item.type}”. Revisa el contenido en data/activities.`,
    ]));
    return { destroy() {}, result: null };
  }

  /* ------------------------------------------------------------ estado -- */
  const state = {
    attempts: 0,
    hintsUsed: 0,
    hintsAvailable: (allowHints && item.hints?.length) || 0,
    startedAt: Date.now(),
    finished: false,
    bestScore: 0,
    lastAnswer: null,
  };

  /* ------------------------------------------------------------- vistas -- */

  const body = el('div', { class: 'activity__body' });
  const answerHost = el('div');
  const hintsHost = el('div', { class: 'hints' });
  const feedbackHost = el('div');

  if (item.quote) {
    body.appendChild(el('blockquote', {
      class: 'activity__stem',
      style: { fontStyle: 'italic', borderLeftColor: 'var(--brand-5)' },
      text: item.quote,
    }));
  }
  if (item.stem) {
    body.appendChild(el('div', { class: 'activity__stem' },
      String(item.stem).split('\n').map((line) => el('div', { text: line }))));
  }
  if (item.chart && item.type !== 'chart-fix') {
    body.appendChild(el('div', { style: { marginBottom: 'var(--s-4)' } }, [renderChart(item.chart)]));
  }
  body.appendChild(el('p', { class: 'activity__prompt', text: item.prompt || '' }));
  body.appendChild(answerHost);
  body.appendChild(hintsHost);
  body.appendChild(feedbackHost);

  /* ------------------------------------------------------------ botones -- */

  // Cuando no hay feedback inmediato (retos), NO tiene sentido pedir dos clics
  // («Comprobar» y luego «Siguiente»): la respuesta se confirma y se avanza en
  // un solo gesto. Con feedback inmediato (práctica) sí hacen falta dos, porque
  // entre medias hay algo que leer.
  const oneShot = !immediateFeedback;
  const checkBtn = el('button', {
    type: 'button', class: 'btn btn--primary',
    text: oneShot ? (nextLabel || t('activity.check')) : t('activity.check'),
    disabled: true, onClick: () => check(),
  });
  const hintBtn = el('button', {
    type: 'button', class: 'btn', text: t('activity.hint'),
    hidden: !state.hintsAvailable, onClick: () => useHint(),
  });
  const nextBtn = el('button', {
    type: 'button', class: 'btn btn--success', text: nextLabel || t('activity.next'), hidden: true,
    onClick: () => finish(),
  });
  const retryBtn = el('button', {
    type: 'button', class: 'btn', text: t('activity.retry'), hidden: true,
    onClick: () => retry(),
  });

  const hintCounter = el('span', { class: 'xsmall muted' });

  const foot = el('div', { class: 'activity__foot' }, [
    el('div', { class: 'row' }, [hintBtn, hintCounter]),
    el('div', { class: 'row' }, [retryBtn, checkBtn, nextBtn]),
  ]);

  host.appendChild(body);
  host.appendChild(foot);

  /* ------------------------------------------------------- interacción -- */

  let ctrl = impl.mount(answerHost, item, {
    onChange: () => { checkBtn.disabled = !ctrl.hasAnswer(); },
    onSubmit: () => { if (!checkBtn.disabled) check(); },
  });
  ctrl.focus?.();

  function useHint() {
    if (state.hintsUsed >= state.hintsAvailable) {
      announce(t('activity.noMoreHints'));
      return;
    }
    const idx = state.hintsUsed;
    state.hintsUsed++;
    hintsHost.appendChild(el('div', { class: 'hint' }, [
      el('span', { class: 'hint__n', 'aria-hidden': 'true', text: `${idx + 1}.` }),
      el('span', { text: item.hints[idx] }),
    ]));
    hintCounter.textContent = t('activity.hintsUsed', { n: state.hintsUsed })
      + (state.hintsUsed === 1 ? ' · ' + t('activity.hintCost') : '');
    if (state.hintsUsed >= state.hintsAvailable) hintBtn.disabled = true;
    announce(item.hints[idx]);
  }

  async function check() {
    const answer = ctrl.read();
    state.attempts++;
    state.lastAnswer = answer;
    checkBtn.disabled = true;
    let grade;
    if (grader) {
      try {
        const remote = await grader(answer, item, state);
        grade = { score: remote.score ?? 0, chosen: answer, remote };
      } catch (err) {
        console.error('[activity] el corrector remoto ha fallado', err);
        grade = ctrl.grade(answer);          // último recurso: corrección local
      }
    } else {
      grade = ctrl.grade(answer);
    }
    state.bestScore = Math.max(state.bestScore, grade.score);

    const result = buildResult(grade);
    onAttempt?.(result);

    checkBtn.hidden = true;
    hintBtn.disabled = true;

    const isCorrect = grade.score >= 0.999;
    const isPartial = grade.score > 0 && !isCorrect;
    const canRetry = !isCorrect && state.attempts < maxAttempts && mode === 'practice';

    if (immediateFeedback) {
      ctrl.mark(answer, grade);
      await renderFeedback(grade, { canRetry });
    }
    if (!immediateFeedback) ctrl.lock();

    if (canRetry) {
      retryBtn.hidden = false;
      retryBtn.focus();
    } else if (oneShot) {
      ctrl.lock();
      announce('Respuesta registrada.');
      finish();                       // un solo clic: confirmar y avanzar
      return;
    } else {
      ctrl.lock();
      nextBtn.hidden = false;
      nextBtn.focus();
    }
    announce(isCorrect ? t('activity.correct') : isPartial ? t('activity.partial') : t('activity.incorrect'));
  }

  function retry() {
    retryBtn.hidden = true;
    checkBtn.hidden = false;
    checkBtn.disabled = true;
    clear(feedbackHost);
    ctrl.reset();
    // El tipo se remonta para limpiar marcas visuales complejas.
    clear(answerHost);
    ctrl = impl.mount(answerHost, item, {
      onChange: () => { checkBtn.disabled = !ctrl.hasAnswer(); },
      onSubmit: () => { if (!checkBtn.disabled) check(); },
    });
    if (state.hintsUsed < state.hintsAvailable) hintBtn.disabled = false;
    ctrl.focus?.();
  }

  async function renderFeedback(grade, { canRetry }) {
    const isCorrect = grade.score >= 0.999;
    const isPartial = grade.score > 0 && !isCorrect;
    const kind = isCorrect ? 'ok' : isPartial ? 'partial' : 'bad';

    const concept = item.concept ? await getConcept(item.concept) : null;
    const box = el('div', { class: `feedback feedback--${kind}`, tabindex: '-1' });

    box.appendChild(el('div', { class: 'feedback__verdict' }, [
      el('span', { 'aria-hidden': 'true', text: isCorrect ? '✓' : isPartial ? '≈' : '✕' }),
      isCorrect ? t('activity.correct') : isPartial ? t('activity.partial') : t('activity.incorrect'),
      isPartial ? el('span', { class: 'badge badge--warn', text: `${Math.round(grade.score * 100)} %` }) : null,
    ]));

    // QUÉ falló
    if (!isCorrect) {
      box.appendChild(el('div', { class: 'feedback__what' }, [
        el('div', {}, [el('b', { text: t('activity.yourAnswer') + ': ' }), ctrl.describeAnswer(state.lastAnswer)]),
        el('div', {}, [el('b', { text: t('activity.correctAnswer') + ': ' }), ctrl.describeCorrect()]),
      ]));
    }

    // POR QUÉ (breve) + explicación completa desplegable
    const shortWhy = firstSentence(item.explanation);
    if (shortWhy) box.appendChild(el('p', { class: 'feedback__what', style: { marginTop: 'var(--s-2)' }, text: shortWhy }));

    if (item.explanation && item.explanation !== shortWhy) {
      box.appendChild(el('details', { class: 'disclose', style: { marginTop: 'var(--s-3)' } }, [
        el('summary', { text: t('activity.explain') }),
        el('div', {}, [el('p', { class: 'small', text: item.explanation })]),
      ]));
    }

    // QUÉ CONCEPTO revisar
    if (concept) {
      box.appendChild(el('p', { class: 'feedback__concept' }, [
        el('b', { text: t('activity.conceptToReview') + ': ' }),
        concept.label,
        concept.worldTitle ? ` · Mundo ${concept.worldNum}: ${concept.worldTitle}` : '',
      ]));
      if (!isCorrect && concept.misconception) {
        box.appendChild(el('p', { class: 'feedback__concept' }, [
          el('b', { text: 'Error frecuente: ' }), concept.misconception,
        ]));
      }
    }

    if (showXp && isCorrect) {
      box.appendChild(el('p', { class: 'feedback__concept' }, [
        el('span', { class: 'badge badge--brand', text: t('activity.xpEarned', { xp: estimateXp(grade) }) }),
      ]));
    }
    if (canRetry) {
      box.appendChild(el('p', { class: 'xsmall', style: { marginTop: 'var(--s-2)' }, text: 'Puedes volver a intentarlo. El intento cuenta en tu progreso.' }));
    }

    clear(feedbackHost);
    feedbackHost.appendChild(box);
    box.focus();
  }

  function estimateXp(grade) {
    const base = item.xp ?? 10;
    const hintFactor = Math.max(0.4, 1 - 0.2 * state.hintsUsed);
    const tryFactor = state.attempts === 1 ? 1 : state.attempts === 2 ? 0.7 : 0.5;
    return Math.round(base * grade.score * hintFactor * tryFactor);
  }

  function buildResult(grade) {
    return {
      itemId: item.id,
      activityId: activity.id,
      world: item.world || activity.world || null,
      concept: item.concept || null,
      concepts: item.concepts || (item.concept ? [item.concept] : []),
      difficulty: item.difficulty ?? 1,
      type: item.type,
      score: grade.score,
      correct: grade.score >= 0.999,
      partial: grade.score,
      attempts: state.attempts,
      errors: state.attempts - (grade.score >= 0.999 ? 1 : 0),
      hintsUsed: state.hintsUsed,
      hintsAvailable: state.hintsAvailable,
      timeSeconds: Math.round((Date.now() - state.startedAt) / 1000),
      answer: state.lastAnswer,
      answerText: ctrl.describeAnswer(state.lastAnswer),
      correctText: ctrl.describeCorrect(),
      seed: item.seed,
      xp: estimateXp(grade),
      weight: activity.weight ?? 1,
    };
  }

  function finish() {
    if (state.finished) return;
    state.finished = true;
    const grade = { score: state.bestScore };
    onComplete?.(buildResult(grade));
  }

  return {
    item,
    state,
    destroy() { clear(host); },
    forceFinish: finish,
  };
}

function firstSentence(text) {
  if (!text) return '';
  const m = String(text).match(/^[^.!?]{10,240}[.!?]/);
  return m ? m[0] : String(text).slice(0, 200);
}

/** Cabecera reutilizable de actividad (mundo, dificultad, progreso). */
export function activityHeader({ crumbs, index, total, dots = null, right = null }) {
  return el('div', { class: 'activity__head' }, [
    el('div', {}, [
      el('div', { class: 'activity__crumbs', text: crumbs }),
      total ? el('div', { class: 'small muted', text: t('activity.of', { i: index, n: total }) }) : null,
    ]),
    el('div', { class: 'row' }, [
      dots ? el('div', { class: 'activity__progress', 'aria-hidden': 'true' }, dots) : null,
      right,
    ]),
  ]);
}

/** Puntos de progreso de una sesión. */
export function progressDots(results, total, currentIndex) {
  const dots = [];
  for (let i = 0; i < total; i++) {
    const r = results[i];
    let cls = 'activity__dot';
    if (r) cls += r.score >= 0.999 ? ' activity__dot--done' : r.score > 0 ? ' activity__dot--partial' : '';
    else if (i === currentIndex) cls += ' activity__dot--now';
    dots.push(el('span', { class: cls }));
  }
  return dots;
}

/** Resumen de una sesión de práctica. */
export function sessionSummary(results, { xpTotal = 0 } = {}) {
  const correct = results.filter((r) => r.correct && r.attempts === 1).length;
  const partial = results.filter((r) => !r.correct && r.score > 0).length;
  return el('div', { class: 'card stack' }, [
    el('h2', { text: t('activity.sessionDone') }),
    el('p', { text: t('activity.sessionSummary', { correct, total: results.length }) }),
    el('div', { class: 'stats' }, [
      stat(t('activity.xpEarned', { xp: xpTotal }), ''),
      stat(`${correct}/${results.length}`, 'Aciertos a la primera'),
      stat(String(partial), 'Parcialmente correctas'),
      stat(fmt(results.reduce((s, r) => s + r.timeSeconds, 0) / 60, 1) + ' min', 'Tiempo'),
    ]),
  ]);
}

function stat(value, label) {
  return el('div', { class: 'stat' }, [
    el('div', { class: 'stat__label', text: label }),
    el('div', { class: 'stat__value', text: value }),
  ]);
}
