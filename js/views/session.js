/**
 * Ejecutor de SESIONES DE PRÁCTICA
 * ---------------------------------------------------------------------------
 * Una sesión es una secuencia de actividades. Lo usan la Campaña, la Partida
 * rápida, Mis errores y las actividades asignadas por el profesor, así que la
 * lógica está aquí una sola vez.
 *
 * Responsabilidades:
 *   · encadenar actividades y llevar la cuenta;
 *   · registrar cada intento en la capa de datos (XP, mastery, racha);
 *   · aplicar dificultad adaptativa entre actividades;
 *   · avisar de los logros conseguidos;
 *   · dejar al alumno en un resumen con qué le ha salido y qué repasar.
 */

import { el, replace, clear, toast, announce, focusMain } from '../dom.js';
import { t } from '../i18n.js';
import { db } from '../data/store.js';
import { navigate } from '../router.js';
import { fmt, fmtDurationLong } from '../utils.js';
import { getConcept } from '../content.js';
import { mountActivity, progressDots } from '../engine/activity.js';
import { nextDifficulty, adaptivePlan } from '../mastery.js';
import { mountGame } from '../../games/index.js';

/**
 * @param {object} opts
 *   main       contenedor
 *   title      título de la sesión
 *   crumbs     migas (texto corto)
 *   items      array de actividades
 *   backHref   destino al terminar
 *   source     'campaign' | 'practice' | 'quick' | 'assignment'
 *   assignmentId
 *   adaptive   true → reordena por dificultad según el mastery
 */
export async function runSession({
  main, title, crumbs, items, backHref = '#/student',
  source = 'practice', assignmentId = null, adaptive = true, classId = null,
}) {
  if (!items.length) {
    replace(main, [el('div', { class: 'wrap' }, [
      el('div', { class: 'card' }, [
        el('h1', { text: title }),
        el('p', { class: 'muted', text: t('activity.emptyWorld') }),
        el('a', { class: 'btn btn--primary', href: backHref, text: t('common.back') }),
      ]),
    ])]);
    return;
  }

  const masteryMap = await db.getMastery();
  let queue = items.slice();

  if (adaptive) {
    // Se ordenan primero las actividades de conceptos con menos mastery y con
    // la dificultad que corresponde al nivel actual del alumno.
    queue = queue.map((a) => {
      const ms = (a.concepts || []).map((c) => masteryMap.get(c)?.value ?? 0);
      const m = ms.length ? Math.min(...ms) : 0;
      const target = nextDifficulty({ value: m });
      return { a, m, fit: Math.abs((a.difficulty ?? 1) - target) };
    }).sort((x, y) => x.fit - y.fit || x.m - y.m).map((x) => x.a);
  }

  const results = [];
  let index = 0;
  let xpTotal = 0;

  const wrap = el('div', { class: 'wrap wrap--mid' });
  replace(main, [wrap]);

  await renderCurrent();

  async function renderCurrent() {
    if (index >= queue.length) return renderSummary();
    const item = queue[index];

    // Las actividades de tipo `sim` abren su laboratorio.
    if (item.type === 'sim') return renderSim(item);

    const head = el('div', { class: 'activity__head' }, [
      el('div', {}, [
        el('div', { class: 'activity__crumbs', text: crumbs }),
        el('div', { class: 'small muted', text: t('activity.of', { i: index + 1, n: queue.length }) }),
      ]),
      el('div', { class: 'row' }, [
        el('span', { class: 'badge', text: t(`common.${item.difficulty === 3 ? 'hard' : item.difficulty === 2 ? 'medium' : 'easy'}`) }),
        el('div', { class: 'activity__progress', 'aria-hidden': 'true' }, progressDots(results, queue.length, index)),
      ]),
    ]);

    const body = el('div');
    const card = el('div', { class: 'activity' }, [head, body]);

    replace(wrap, [
      el('div', { class: 'page-head' }, [
        el('div', {}, [el('h1', { class: 'mb-0', text: title })]),
        el('a', { class: 'btn btn--sm', href: backHref, text: t('common.back') }),
      ]),
      card,
    ]);
    focusMain();

    mountActivity(body, item, {
      mode: 'practice',
      seed: `${item.id}-${Date.now()}`,
      nextLabel: index === queue.length - 1 ? t('activity.finish') : t('activity.next'),
      onComplete: async (result) => {
        results[index] = result;
        try {
          const saved = await db.recordAttempt({
            activityId: result.activityId,
            world: result.world,
            concept: result.concept,
            concepts: result.concepts,
            type: result.type,
            difficulty: result.difficulty,
            score: result.score,
            correct: result.correct,
            attempts: result.attempts,
            hintsUsed: result.hintsUsed,
            timeSeconds: result.timeSeconds,
            seed: result.seed,
            xpBase: item.xp ?? 10,
            source, assignmentId, classId,
          });
          xpTotal += saved.xpEarned;
          if (saved.streakBonus) toast(`+${saved.streakBonus} XP por racha de ${saved.streak} días`, 'xp');
        } catch (err) {
          console.error('[session] no se pudo guardar el intento', err);
          toast(t('errors.saveFailed'), 'bad');
        }

        // Dificultad adaptativa: si va mal, se intercala algo más guiado.
        const plan = adaptivePlan({
          correct: result.correct, attempts: result.attempts,
          hintsUsed: result.hintsUsed, mastery: masteryMap.get(result.concept),
        });
        if (plan.action === 'guided' && index + 1 < queue.length) {
          const easier = queue.slice(index + 1).find((x) => (x.difficulty ?? 1) <= 1
            && (x.concepts || []).some((c) => (result.concepts || []).includes(c)));
          if (easier) {
            queue = [...queue.slice(0, index + 1), easier, ...queue.slice(index + 1).filter((x) => x !== easier)];
          }
        }

        index++;
        await renderCurrent();
      },
    });
  }

  function renderSim(item) {
    const box = el('div', { class: 'card' });
    replace(wrap, [
      el('div', { class: 'page-head' }, [
        el('div', {}, [
          el('h1', { class: 'mb-0', text: t(`games.${item.game}`) }),
          el('p', { class: 'page-head__sub', text: item.prompt || '' }),
        ]),
        el('a', { class: 'btn btn--sm', href: backHref, text: t('common.back') }),
      ]),
      box,
    ]);

    const host = el('div');
    box.appendChild(host);
    const footer = el('div', { class: 'row row--end', style: { marginTop: 'var(--s-4)' } }, [
      el('button', {
        class: 'btn btn--success', type: 'button',
        text: index === queue.length - 1 ? t('activity.finish') : t('activity.next'),
        onClick: async () => {
          results[index] = { itemId: item.id, score: 1, correct: true, attempts: 1, hintsUsed: 0, timeSeconds: 0, concepts: item.concepts, xp: item.xp ?? 20 };
          index++;
          await renderCurrent();
        },
      }),
    ]);
    box.appendChild(footer);

    mountGame(item.game, host, item.config || {}, {
      onScore: (points) => db.recordGameScore(item.game, points).catch(() => {}),
      onFinish: async (res) => {
        if (res.score !== null && res.score !== undefined) {
          await db.recordAttempt({
            activityId: item.id, world: item.world, concept: item.concepts?.[0],
            concepts: item.concepts || [], type: 'sim', difficulty: item.difficulty ?? 2,
            score: res.score, correct: res.score >= 0.7, attempts: 1, hintsUsed: 0,
            timeSeconds: 0, xpBase: item.xp ?? 20, source: 'game', classId,
          }).catch(() => {});
        }
      },
    }).catch((err) => {
      console.error(err);
      replace(host, [el('div', { class: 'callout callout--bad', text: 'No se ha podido cargar el laboratorio.' })]);
    });
  }

  async function renderSummary() {
    const real = results.filter(Boolean);
    const firstTry = real.filter((r) => r.correct && r.attempts === 1).length;
    const partial = real.filter((r) => !r.correct && r.score > 0).length;
    const time = real.reduce((s, r) => s + (r.timeSeconds || 0), 0);

    let newAch = [];
    try { newAch = await db.syncAchievements(); } catch { /* sin conexión */ }

    const wrongConcepts = Array.from(new Set(
      real.filter((r) => !r.correct).flatMap((r) => r.concepts || []),
    ));
    const labels = await Promise.all(wrongConcepts.map(async (c) => (await getConcept(c)).label));

    replace(wrap, [
      el('div', { class: 'card stack' }, [
        el('h1', { text: t('activity.sessionDone') }),
        el('p', { text: t('activity.sessionSummary', { correct: firstTry, total: real.length }) }),
        el('div', { class: 'stats' }, [
          kpi(`+${xpTotal}`, 'XP conseguida'),
          kpi(`${firstTry}/${real.length}`, 'Aciertos a la primera'),
          kpi(String(partial), 'Parcialmente correctas'),
          kpi(fmtDurationLong(time), 'Tiempo'),
        ]),

        labels.length ? el('div', { class: 'callout callout--warn' }, [
          el('span', { class: 'callout__title', text: t('activity.conceptToReview') }),
          labels.join(' · '),
        ]) : el('div', { class: 'callout callout--ok' }, [
          el('span', { class: 'callout__title', text: 'Sin errores' }),
          'Todo correcto en esta sesión.',
        ]),

        newAch.length ? el('div', { class: 'callout callout--ok' }, [
          el('span', { class: 'callout__title', text: 'Logros conseguidos' }),
          newAch.map((a) => `${a.icon} ${a.name}`).join(' · '),
        ]) : null,

        el('div', { class: 'row' }, [
          el('a', { class: 'btn btn--primary', href: backHref, text: t('activity.backToWorld') }),
          el('a', { class: 'btn', href: '#/student', text: t('activity.backToDashboard') }),
          labels.length ? el('a', { class: 'btn btn--outline', href: '#/mistakes', text: 'Practicar los fallos' }) : null,
        ]),
      ]),
    ]);
    focusMain();
    announce(t('activity.sessionDone'));
    if (newAch.length) newAch.forEach((a) => toast(`${a.icon} ${a.name}`, 'xp'));
  }

  function kpi(value, label) {
    return el('div', { class: 'stat' }, [
      el('div', { class: 'stat__label', text: label }),
      el('div', { class: 'stat__value', text: value }),
    ]);
  }

  void clear; void fmt; void navigate;
}
