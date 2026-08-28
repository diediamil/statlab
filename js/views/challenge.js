/**
 * Vista: RETO DE LA SEMANA
 * ---------------------------------------------------------------------------
 * Tres pantallas en un mismo módulo:
 *   1. HUB     — lista de retos de la clase con su estado.
 *   2. RUNNER  — briefing → cronómetro → pasos → resultado con desglose.
 *   3. REVIEW  — solución desbloqueada: tu respuesta frente a la correcta.
 *
 * Detalles que importan:
 *   · el cronómetro mide TIEMPO ACTIVO (se detiene con la inactividad);
 *   · el feedback por paso NO se muestra durante el reto (política por defecto
 *     «solución al cerrar»): así el reto evalúa de verdad;
 *   · la corrección la hace el servidor cuando hay Supabase, de modo que las
 *     respuestas no están en el navegador;
 *   · antes de empezar se avisa con claridad de si el intento cuenta para el
 *     ranking.
 */

import { el, replace, clear, focusMain, toast, announce, confirmDialog } from '../dom.js';
import { t, tp } from '../i18n.js';
import { db } from '../data/store.js';
import { navigate } from '../router.js';
import { fmt, fmtInt, fmtDateTime, fmtDuration, fmtDurationLong, fmtRelative } from '../utils.js';
import { mountActivity } from '../engine/activity.js';
import { renderChart } from '../engine/chart-spec.js';
import { ActiveTimer, challengeState, solutionAvailable, mergeStep, POLICY_LABELS, totalHints } from '../challenges.js';
import { DEFAULT_SCORING, scoringExplanation } from '../scoring.js';
import { buildDataset } from '../generators.js';
import { boxplot } from '../viz.js';

/* ================================================================== hub == */

export async function challengeHubView({ main }) {
  const challenges = await db.listMyChallenges();

  if (!challenges.length) {
    replace(main, [el('div', { class: 'wrap' }, [
      el('div', { class: 'page-head' }, [el('h1', { text: t('challenge.title') })]),
      el('div', { class: 'card' }, [el('div', { class: 'empty' }, [
        el('div', { class: 'empty__icon', 'aria-hidden': 'true', text: '🏆' }),
        el('h2', { text: t('challenge.noChallenge') }),
        el('p', { text: t('challenge.noChallengeText') }),
        el('a', { class: 'btn btn--primary', href: '#/student', text: t('common.back') }),
      ])]),
    ])]);
    return;
  }

  const cards = [];
  for (const ch of challenges) {
    const state = challengeState(ch);
    const mine = await db.myChallengeAttempts(ch.id);
    const best = mine.filter((a) => a.completed).sort((a, b) => b.challenge_points - a.challenge_points)[0] || null;
    cards.push(el('div', { class: 'card', style: { borderLeft: `4px solid ${state === 'open' ? 'var(--brand-5)' : 'var(--line-strong)'}` } }, [
      el('div', { class: 'row row--between' }, [
        el('div', {}, [
          el('div', { class: 'challenge-hero__kicker', text: `${ch.number ? t('challenge.number', { n: ch.number }) : ''} · ${t(`challenge.types.${ch.challenge_type}`)}` }),
          el('h2', { class: 'mb-0', text: ch.title }),
        ]),
        el('span', {
          class: `badge ${state === 'open' ? 'badge--ok' : state === 'upcoming' ? 'badge--warn' : ''}`,
          text: state === 'open' ? `Cierra ${fmtRelative(ch.closes_at)}` : state === 'upcoming' ? `Abre ${fmtRelative(ch.opens_at)}` : 'Cerrado',
        }),
      ]),
      el('p', { class: 'small muted', style: { marginTop: 'var(--s-2)' }, text: ch.description || '' }),
      el('div', { class: 'challenge-window' }, [
        el('div', {}, [el('b', { text: t('challenge.opens') }), fmtDateTime(ch.opens_at)]),
        el('div', {}, [el('b', { text: t('challenge.closes') }), fmtDateTime(ch.closes_at)]),
        el('div', {}, [el('b', { text: 'Tiempo de referencia' }), `${Math.round(ch.recommended_seconds / 60)} min`]),
        el('div', {}, [el('b', { text: 'Intento competitivo' }), POLICY_LABELS[ch.competitive_attempts] || '—']),
      ]),
      best ? el('p', { class: 'small', style: { marginTop: 'var(--s-3)' } }, [
        el('span', { class: 'badge badge--challenge', text: `${fmtInt(best.challenge_points)} / 1000 CP` }),
        ` · ${fmtDurationLong(best.active_time_seconds)} · ${best.errors} errores`,
      ]) : null,
      el('div', { class: 'row', style: { marginTop: 'var(--s-4)' } }, [
        state !== 'upcoming'
          ? el('a', { class: 'btn btn--primary', href: `#/challenge/${ch.id}`, text: state === 'open' ? (best ? t('challenge.resume') : t('challenge.start')) : 'Abrir' })
          : el('span', { class: 'muted small', text: t('challenge.notOpenYet') }),
        best ? el('a', { class: 'btn', href: `#/challenge/${ch.id}/review`, text: t('challenge.reviewAttempt') }) : null,
        ch.show_ranking ? el('a', { class: 'btn btn--ghost', href: `#/ranking?challenge=${ch.id}`, text: t('ranking.weekly') }) : null,
      ]),
    ]));
  }

  replace(main, [el('div', { class: 'wrap' }, [
    el('div', { class: 'page-head' }, [
      el('div', {}, [
        el('h1', { text: t('challenge.title') }),
        el('p', { class: 'page-head__sub', text: t('modes.challengeDesc') }),
      ]),
      el('a', { class: 'btn btn--sm', href: '#/student', text: t('common.back') }),
    ]),
    el('div', { class: 'stack' }, cards),
    scoringCard(),
  ])]);
  focusMain();
}

/* =============================================================== runner == */

export async function challengeRunView({ main, params }) {
  const ch = await db.getChallenge(params.id);
  if (!ch) { replace(main, [el('div', { class: 'wrap' }, [el('h1', { text: t('errors.pageNotFound') })])]); return; }

  const state = challengeState(ch);
  const mine = await db.myChallengeAttempts(ch.id);
  const completedMine = mine.filter((a) => a.completed);
  const attemptsLeft = (ch.max_attempts || 3) - mine.length;
  const cfg = ch.configuration || {};
  const dataset = cfg.dataset ? buildDataset(cfg.dataset) : null;

  let timer = null;
  let session = null;

  renderBriefing();

  /* ------------------------------------------------------------ briefing */
  function renderBriefing() {
    const canStart = state !== 'upcoming' && attemptsLeft > 0;
    const willBeRanked = state === 'open'
      && (ch.competitive_attempts === 'best' || ch.competitive_attempts === 'all' || mine.length === 0);

    replace(main, [el('div', { class: 'wrap' }, [
      el('div', { class: 'challenge-hero' }, [
        el('div', { class: 'challenge-hero__kicker', text: `${ch.number ? t('challenge.number', { n: ch.number }) : t('challenge.title')} · ${t(`challenge.types.${ch.challenge_type}`)}` }),
        el('h1', { text: ch.title }),
        el('p', { text: ch.description || '' }),
        el('div', { class: 'challenge-window' }, [
          el('div', {}, [el('b', { text: t('challenge.opens') }), fmtDateTime(ch.opens_at)]),
          el('div', {}, [el('b', { text: t('challenge.closes') }), fmtDateTime(ch.closes_at)]),
          el('div', {}, [el('b', { text: 'Pasos' }), String((cfg.steps || []).length)]),
          el('div', {}, [el('b', { text: 'Tiempo de referencia' }), `${Math.round(ch.recommended_seconds / 60)} min`]),
        ]),
      ]),

      state === 'upcoming' ? el('div', { class: 'callout callout--warn', text: t('challenge.notOpenYet') }) : null,
      state === 'closed' ? el('div', { class: 'callout callout--warn', text: t('challenge.closedButPractice') }) : null,

      el('div', { class: 'grid grid--sidebar' }, [
        el('div', { class: 'stack-lg' }, [
          cfg.briefing ? el('div', { class: 'card' }, [
            el('h2', { text: t('challenge.beforeStart') }),
            el('p', { text: cfg.briefing }),
          ]) : null,

          cfg.context ? contextCard(cfg.context) : null,
          dataset ? datasetCard(dataset) : null,

          el('div', { class: 'card' }, [
            el('h2', { text: 'Antes de empezar' }),
            el('div', { class: 'callout callout--warn' }, [
              el('span', { class: 'callout__title', text: '⏱ Cronómetro' }),
              t('challenge.timerWarning', { pause: 90 }),
            ]),
            el('div', { class: `callout ${willBeRanked ? 'callout--ok' : ''}`, style: { marginTop: 'var(--s-3)' } }, [
              el('span', { class: 'callout__title', text: willBeRanked ? t('challenge.rankEligible') : t('challenge.notRankEligible') }),
              t('challenge.competitiveNote', { policy: POLICY_LABELS[ch.competitive_attempts] }),
            ]),
            el('p', { class: 'small', style: { marginTop: 'var(--s-3)' } }, [
              attemptsLeft > 0 ? tp('challenge.attemptsLeft', attemptsLeft) : t('challenge.noAttemptsLeft'),
              ch.allow_hints ? ' · Las pistas están permitidas y restan puntuación.' : ' · Este reto no ofrece pistas.',
            ]),
            el('div', { class: 'row', style: { marginTop: 'var(--s-4)' } }, [
              el('button', {
                class: 'btn btn--primary btn--lg', type: 'button', disabled: !canStart,
                text: state === 'closed' ? 'Practicar (sin ranking)' : t('challenge.start'),
                onClick: () => start(),
              }),
              el('a', { class: 'btn', href: '#/challenge', text: t('common.back') }),
              completedMine.length ? el('a', { class: 'btn btn--outline', href: `#/challenge/${ch.id}/review`, text: t('challenge.reviewAttempt') }) : null,
            ]),
          ]),
        ]),

        el('div', { class: 'stack-lg' }, [
          scoringCard(),
          el('div', { class: 'card' }, [
            el('h2', { text: t('challenge.solutionLocked') }),
            el('p', { class: 'small muted', text: solutionAvailable(ch) ? t('challenge.solutionUnlocked') : (ch.solution_policy === 'manual' ? t('challenge.solutionLockedManual') : t('challenge.solutionLocked')) }),
          ]),
        ]),
      ]),
    ])]);
    focusMain();
  }

  /* --------------------------------------------------------------- start */
  async function start() {
    let started;
    try {
      started = await db.startChallengeAttempt(ch.id);
    } catch (err) {
      toast(err.message || t('errors.saveFailed'), 'bad');
      return;
    }

    session = {
      attemptId: started.attempt_id,
      steps: (started.configuration?.steps || cfg.steps || []),
      index: 0,
      results: [],
      rankEligible: started.rank_eligible,
      practice: started.practice_mode,
      hintsAvailableTotal: totalHints(cfg.steps || []),
    };

    timer = new ActiveTimer({
      idleAfter: 90,
      onTick: (secs, paused, changed) => {
        const node = document.getElementById('chTimer');
        if (node) {
          node.textContent = fmtDuration(secs);
          node.parentElement.classList.toggle('timer--paused', paused);
        }
        if (changed && paused) announce(t('challenge.pauseNotice'));
      },
    }).start();

    renderStep();
  }

  /* ---------------------------------------------------------------- paso */
  function renderStep() {
    const step = session.steps[session.index];
    if (!step) return finish();

    const rail = el('div', { class: 'steps-rail' }, session.steps.map((s, i) => {
      const r = session.results[i];
      const cls = r ? (r.score >= 0.999 ? 'steps-rail__step--done' : r.score > 0 ? 'steps-rail__step--partial' : '')
        : i === session.index ? 'steps-rail__step--now' : '';
      return el('span', { class: `steps-rail__step ${cls}`, text: `${i + 1}` });
    }));

    const body = el('div');
    const card = el('div', { class: 'activity' }, [
      el('div', { class: 'activity__head' }, [
        el('div', {}, [
          el('div', { class: 'activity__crumbs', text: `${ch.title}` }),
          el('div', { class: 'small muted', text: t('challenge.step', { i: session.index + 1, n: session.steps.length }) }),
        ]),
        el('div', { class: 'row' }, [
          session.practice ? el('span', { class: 'badge badge--warn', text: t('challenge.practiceMode') }) : null,
          !session.rankEligible && !session.practice ? el('span', { class: 'badge', text: 'Sin ranking' }) : null,
          el('span', { class: 'timer' }, [
            el('span', { class: 'timer__dot', 'aria-hidden': 'true' }),
            el('span', { id: 'chTimer', text: '0:00' }),
          ]),
        ]),
      ]),
      body,
    ]);

    replace(main, [el('div', { class: 'wrap wrap--mid' }, [
      rail,
      card,
      cfg.context || dataset
        ? el('details', { class: 'disclose', style: { marginTop: 'var(--s-4)' } }, [
          el('summary', { text: t('challenge.showDataset') }),
          el('div', {}, [cfg.context ? contextTable(cfg.context) : null, dataset ? datasetSummary(dataset) : null]),
        ])
        : null,
    ])]);

    mountActivity(body, { ...step, id: step.id, xp: 0 }, {
      mode: 'challenge',
      allowHints: ch.allow_hints !== false,
      immediateFeedback: false,          // el reto evalúa: nada de feedback inmediato
      maxAttempts: 1,
      nextLabel: session.index === session.steps.length - 1 ? t('challenge.finishChallenge') : t('challenge.submitStep'),
      grader: async (answer, item, st) => {
        const res = await db.submitChallengeStep(session.attemptId, step.id, answer, {
          errors: 0, hints: st.hintsUsed, seconds: st.attempts ? 0 : 0,
        });
        return res;
      },
      onComplete: (result) => {
        session.results[session.index] = {
          ...result,
          weight: step.weight ?? 1,
          score: result.score,
        };
        session.index++;
        renderStep();
      },
    });
    focusMain();
  }

  /* ------------------------------------------------------------ resultado */
  async function finish() {
    const activeSeconds = timer ? timer.stop() : 0;
    replace(main, [el('div', { class: 'wrap' }, [el('div', { class: 'loading' }, [el('span', { class: 'spinner' }), 'Calculando tu puntuación…'])])]);

    let scored;
    try {
      scored = await db.finishChallengeAttempt(session.attemptId, activeSeconds);
    } catch (err) {
      toast(err.message || t('errors.saveFailed'), 'bad');
      navigate('/challenge');
      return;
    }

    const comp = scored.components || scored;
    const total = scored.total ?? comp.total ?? 0;
    const newly = await db.syncAchievements().catch(() => []);

    const canSeeSolution = solutionAvailable(ch);

    replace(main, [el('div', { class: 'wrap wrap--mid' }, [
      el('div', { class: 'card stack' }, [
        el('div', { class: 'row row--between' }, [
          el('div', {}, [
            el('div', { class: 'challenge-hero__kicker', text: t('challenge.finished') }),
            el('h1', { class: 'mb-0', text: ch.title }),
          ]),
          el('div', { class: 'right' }, [
            el('div', { class: 'score-total' }, [String(total), el('small', { text: ' / 1000' })]),
            el('div', { class: 'xsmall muted', text: t('challenge.challengePoints') }),
          ]),
        ]),

        session.practice
          ? el('div', { class: 'callout callout--warn', text: t('challenge.practiceMode') + ': este intento no cuenta para el ranking.' })
          : el('div', { class: `callout ${session.rankEligible ? 'callout--ok' : ''}`, text: session.rankEligible ? t('challenge.rankEligible') : t('challenge.notRankEligible') }),

        el('h2', { text: t('challenge.breakdown') }),
        el('div', { class: 'scorecard' }, [
          scoreLine(t('challenge.accuracy'), comp.accuracy),
          scoreLine(t('challenge.efficiency'), comp.efficiency, `${comp.efficiency?.errors ?? 0} errores`),
          scoreLine(t('challenge.time'), comp.time, `${fmtDurationLong(comp.time?.activeSeconds ?? activeSeconds)} de ${fmtDurationLong(comp.time?.referenceSeconds ?? ch.recommended_seconds)}`),
          scoreLine(t('challenge.hints'), comp.hints, `${comp.hints?.used ?? 0} de ${comp.hints?.available ?? 0}`),
        ]),

        comp.perfectRun ? el('div', { class: 'callout callout--ok' }, [
          el('span', { class: 'callout__title', text: '💠 ' + t('challenge.perfectRun') }),
        ]) : null,

        newly.length ? el('div', { class: 'callout callout--ok' }, [
          el('span', { class: 'callout__title', text: 'Logros conseguidos' }),
          newly.map((a) => `${a.icon} ${a.name}`).join(' · '),
        ]) : null,

        el('div', { class: 'row' }, [
          ch.show_ranking ? el('a', { class: 'btn btn--primary', href: `#/ranking?challenge=${ch.id}`, text: t('ranking.weekly') }) : null,
          canSeeSolution
            ? el('a', { class: 'btn', href: `#/challenge/${ch.id}/review`, text: t('challenge.viewSolution') })
            : el('span', { class: 'badge badge--warn', text: t('challenge.solutionLocked') }),
          el('a', { class: 'btn btn--ghost', href: '#/challenge', text: t('common.back') }),
        ]),
      ]),
      scoringCard(),
    ])]);
    focusMain();
    newly.forEach((a) => toast(`${a.icon} ${a.name}`, 'xp'));
  }

  return () => { if (timer) timer.stop(); };
}

/* ============================================================== revisión = */

export async function challengeReviewView({ main, params }) {
  const ch = await db.getChallenge(params.id);
  if (!ch) { replace(main, [el('div', { class: 'wrap' }, [el('h1', { text: t('errors.pageNotFound') })])]); return; }

  const mine = (await db.myChallengeAttempts(ch.id)).filter((a) => a.completed);
  if (!mine.length) {
    replace(main, [el('div', { class: 'wrap' }, [el('div', { class: 'card' }, [
      el('h1', { text: t('challenge.reviewAttempt') }),
      el('p', { class: 'muted', text: 'Todavía no has completado este reto.' }),
      el('a', { class: 'btn btn--primary', href: `#/challenge/${ch.id}`, text: t('challenge.start') }),
    ])])]);
    return;
  }

  const attempt = mine.sort((a, b) => new Date(b.completed_at) - new Date(a.completed_at))[0];
  const steps = await db.listChallengeSteps(attempt.id);

  let solution = null;
  try { solution = await db.getChallengeSolution(ch.id); } catch { solution = null; }

  const cfgSteps = ch.configuration?.steps || [];
  const comp = attempt.points_breakdown || {};

  replace(main, [el('div', { class: 'wrap wrap--mid' }, [
    el('div', { class: 'page-head' }, [
      el('div', {}, [
        el('h1', { text: solution ? t('challenge.solutionUnlocked') : t('challenge.reviewAttempt') }),
        el('p', { class: 'page-head__sub', text: ch.title }),
      ]),
      el('a', { class: 'btn btn--sm', href: '#/challenge', text: t('common.back') }),
    ]),

    el('div', { class: 'card stack' }, [
      el('div', { class: 'row row--between' }, [
        el('div', { class: 'score-total' }, [String(attempt.challenge_points), el('small', { text: ' / 1000' })]),
        el('div', { class: 'small muted' }, [
          `${t('challenge.activeTime')}: ${fmtDurationLong(attempt.active_time_seconds)}`,
          el('br'),
          `${t('challenge.errors')}: ${attempt.errors} · ${t('challenge.hintsUsed')}: ${attempt.hints_used}`,
        ]),
      ]),
      el('div', { class: 'scorecard' }, [
        scoreLine(t('challenge.accuracy'), comp.accuracy),
        scoreLine(t('challenge.efficiency'), comp.efficiency),
        scoreLine(t('challenge.time'), comp.time),
        scoreLine(t('challenge.hints'), comp.hints),
      ]),
    ]),

    !solution ? el('div', { class: 'callout callout--warn', style: { marginTop: 'var(--s-5)' } }, [
      el('span', { class: 'callout__title', text: t('challenge.solutionLocked') }),
      ch.solution_policy === 'manual' ? t('challenge.solutionLockedManual')
        : `Se publicará al cerrar el reto: ${fmtDateTime(ch.closes_at)}.`,
    ]) : null,

    el('h2', { style: { marginTop: 'var(--s-6)' }, text: 'Paso a paso' }),
    el('div', {}, cfgSteps.map((pub, i) => {
      const sol = solution?.steps?.find((s) => s.id === pub.id) || null;
      const mineStep = steps.find((s) => s.step_id === pub.id) || null;
      const merged = sol ? mergeStep(pub, sol) : pub;
      const okClass = !mineStep ? '' : mineStep.score >= 0.999 ? 'var(--ok)' : mineStep.score > 0 ? 'var(--warn)' : 'var(--bad)';
      return el('div', { class: 'solution-step', style: { borderLeft: `4px solid ${okClass || 'var(--line)'}` } }, [
        el('div', { class: 'solution-step__head' }, [
          el('span', { class: 'badge', text: `Paso ${i + 1}` }),
          el('span', { class: 'grow', text: pub.prompt || pub.id }),
          mineStep ? el('span', {
            class: `badge ${mineStep.score >= 0.999 ? 'badge--ok' : mineStep.score > 0 ? 'badge--warn' : 'badge--bad'}`,
            text: `${Math.round(mineStep.score * 100)} %`,
          }) : el('span', { class: 'badge', text: 'sin responder' }),
        ]),
        el('div', { class: 'solution-step__body' }, [
          mineStep?.answer !== undefined && mineStep?.answer !== null
            ? el('div', { class: 'ans' }, [
              el('span', { class: 'ans__k', text: t('activity.yourAnswer') }),
              el('span', { text: describeAnswer(merged, mineStep.answer) }),
            ]) : null,
          sol ? el('div', { class: 'ans' }, [
            el('span', { class: 'ans__k', text: t('activity.correctAnswer') }),
            el('span', { text: describeCorrect(merged) }),
          ]) : null,
          sol?.explanation ? el('div', { class: 'ans' }, [
            el('span', { class: 'ans__k', text: 'Por qué' }),
            el('span', { text: sol.explanation }),
          ]) : null,
          mineStep ? el('div', { class: 'ans' }, [
            el('span', { class: 'ans__k', text: 'Datos' }),
            el('span', { text: `${mineStep.errors} errores · ${mineStep.hints_used} pistas · peso ${fmt(mineStep.weight, 1)}` }),
          ]) : null,
        ]),
      ]);
    })),

    solution?.wrapUp ? el('div', { class: 'callout callout--ok', style: { marginTop: 'var(--s-5)' } }, [
      el('span', { class: 'callout__title', text: 'Conclusión del reto' }), solution.wrapUp,
    ]) : null,
  ])]);
  focusMain();
}

/* ------------------------------------------------------------- helpers --- */

function scoreLine(label, c, note = '') {
  const pts = c?.points ?? 0, max = c?.max ?? 0;
  return el('div', { class: 'scoreline' }, [
    el('span', {}, [el('b', { text: label }), note ? el('span', { class: 'xsmall muted', text: ` — ${note}` }) : null]),
    el('span', { class: 'tabnum strong', text: `${fmt(pts, 0)} / ${max}` }),
    el('div', { class: 'scoreline__bar' }, [
      el('div', { class: 'meter meter--thin' }, [
        el('div', { class: 'meter__track' }, [
          el('div', { class: 'meter__fill', style: { width: `${max ? (pts / max) * 100 : 0}%` } }),
        ]),
      ]),
    ]),
  ]);
}

function scoringCard() {
  return el('details', { class: 'disclose', style: { marginTop: 'var(--s-5)' } }, [
    el('summary', { text: t('challenge.scoringExplain') }),
    el('div', {}, [
      el('p', { class: 'small strong', text: t('scoring.total') }),
      el('ul', { class: 'small' }, scoringExplanation(DEFAULT_SCORING).map((c) => el('li', {}, [
        el('b', { text: `${t('challenge.' + c.key)} (hasta ${c.max}): ` }), `${c.formula}. ${c.note}`,
      ]))),
      el('p', { class: 'small' }, [el('b', { text: 'Principio: ' }), t('scoring.principle')]),
      el('p', { class: 'xsmall muted', text: t('scoring.notAGrade') }),
    ]),
  ]);
}

function contextCard(ctx) {
  return el('div', { class: 'card' }, [
    el('h2', { text: ctx.title || t('challenge.dataset') }),
    ctx.note ? el('p', { class: 'small muted', text: ctx.note }) : null,
    contextTable(ctx),
  ]);
}

function contextTable(ctx) {
  if (!ctx.columns) return null;
  return el('div', { class: 'table-wrap' }, [
    el('table', { class: 'dataset-table' }, [
      el('thead', {}, [el('tr', {}, ctx.columns.map((c) => el('th', { text: c })))]),
      el('tbody', {}, (ctx.rows || []).map((r) => el('tr', {}, r.map((v) => el('td', { text: String(v) }))))),
    ]),
  ]);
}

function datasetCard(ds) {
  return el('div', { class: 'card' }, [
    el('h2', { text: t('challenge.dataset') }),
    datasetSummary(ds),
  ]);
}

function datasetSummary(ds) {
  const names = ds.groupNames || Object.keys(ds.groups || {});
  const groups = names.map((n) => ({ name: n, values: ds.values[n] }));
  return el('div', { class: 'stack' }, [
    el('div', { class: 'table-wrap' }, [
      el('table', { class: 'dataset-table' }, [
        el('thead', {}, [el('tr', {}, ['Grupo', 'n', 'Media', 'DT', 'Mediana', 'Mín', 'Máx'].map((h) => el('th', { text: h })))]),
        el('tbody', {}, names.map((n) => {
          const g = ds.groups[n];
          return el('tr', {}, [
            el('td', { text: n }), el('td', { text: String(g.n) }),
            el('td', { text: fmt(g.mean, 2) }), el('td', { text: fmt(g.sd, 2) }),
            el('td', { text: fmt(g.median, 1) }), el('td', { text: fmt(g.min, 0) }), el('td', { text: fmt(g.max, 0) }),
          ]);
        })),
      ]),
    ]),
    el('div', { class: 'chartbox' }, [boxplot(groups, {
      yLabel: ds.outcome?.label || 'resultado', showMean: true,
      title: `Distribución de ${ds.outcome?.label || 'la variable resultado'} por grupo`,
    })]),
    el('details', { class: 'disclose' }, [
      el('summary', { text: `Ver las ${ds.rows.length} filas` }),
      el('div', { class: 'table-wrap' }, [
        el('table', { class: 'dataset-table' }, [
          el('thead', {}, [el('tr', {}, Object.keys(ds.rows[0]).map((k) => el('th', { text: k })))]),
          el('tbody', {}, ds.rows.map((r) => el('tr', {}, Object.values(r).map((v) => el('td', { text: String(v) }))))),
        ]),
      ]),
    ]),
  ]);
}

/** Descripción textual de una respuesta guardada, para la revisión. */
function describeAnswer(step, answer) {
  if (answer === null || answer === undefined) return '—';
  switch (step.type) {
    case 'mcq': case 'chart-pick':
      return (step.options || []).find((o) => o.id === answer)?.text || String(answer);
    case 'multi': case 'chart-fix':
      return (answer || []).map((id) => (step.options || []).find((o) => o.id === id)?.text || id).join(' · ');
    case 'numeric':
      return fmt(Number(answer), 3);
    case 'classify':
      return (step.items || []).map((it) => `${it.text} → ${(step.bins || []).find((b) => b.id === answer[it.id])?.title || '—'}`).join(' · ');
    case 'claim-audit':
      return (step.claims || []).map((c, i) => `${i + 1}: ${answer[c.id] ? 'correcta' : 'incorrecta'}`).join(' · ');
    case 'order':
      return (answer || []).map((id, i) => `${i + 1}. ${(step.items || []).find((x) => x.id === id)?.text || id}`).join(' · ');
    case 'decision':
      return (step.options || []).find((o) => o.id === answer.chosen)?.text || String(answer.chosen);
    case 'table2x2':
      return ['tp', 'fp', 'fn', 'tn'].map((k) => `${k.toUpperCase()}=${answer?.cells?.[k] ?? '—'}`).join(' · ');
    default:
      return JSON.stringify(answer);
  }
}

function describeCorrect(step) {
  switch (step.type) {
    case 'mcq': case 'chart-pick':
      return (step.options || []).find((o) => o.id === step.answer)?.text || String(step.answer);
    case 'multi': case 'chart-fix': {
      const ids = step.answer || (step.options || []).filter((o) => o.correct).map((o) => o.id);
      return ids.map((id) => (step.options || []).find((o) => o.id === id)?.text || id).join(' · ');
    }
    case 'numeric':
      return `${fmt(step.answer, 3)}${step.tolerance ? ` (±${fmt(step.tolerance, 3)})` : ''}`;
    case 'classify':
      return (step.items || []).map((it) => `${it.text} → ${(step.bins || []).find((b) => b.id === it.bin)?.title}`).join(' · ');
    case 'claim-audit':
      return (step.claims || []).map((c, i) => `${i + 1}: ${c.correct ? 'correcta' : 'incorrecta'}`).join(' · ');
    case 'order':
      return (step.items || []).slice().sort((a, b) => a.pos - b.pos).map((it, i) => `${i + 1}. ${it.text}`).join(' · ');
    case 'decision':
      return (step.options || []).find((o) => o.id === step.answer)?.text || String(step.answer);
    case 'table2x2':
      return ['tp', 'fp', 'fn', 'tn'].map((k) => `${k.toUpperCase()}=${step.answer?.[k]}`).join(' · ');
    default:
      return '—';
  }
}

void clear; void renderChart; void confirmDialog;
