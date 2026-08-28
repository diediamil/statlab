/**
 * Vista: MI PROGRESO
 * ---------------------------------------------------------------------------
 * Todo lo que la plataforma sabe del estudiante, mostrado de forma
 * transparente: XP, nivel, mastery por concepto y por mundo, historial y la
 * fórmula exacta con la que se calcula el mastery.
 */

import { el, replace, focusMain } from '../dom.js';
import { t, tp } from '../i18n.js';
import { db } from '../data/store.js';
import { fmt, fmtInt, fmtDurationLong, fmtDateTime } from '../utils.js';
import { getWorlds, getConceptIndex, getActivities, getAchievements } from '../content.js';
import { levelFromXp, worldStates, streakCalendar } from '../progress.js';
import { averageMastery, masteryLevel } from '../mastery.js';
import { meter } from './student.js';
import { barChart } from '../viz.js';

export default async function progressView({ main }) {
  const [worlds, progress, masteryMap, attempts, achievements, mine] = await Promise.all([
    getWorlds(), db.getProgress(), db.getMastery(),
    db.listAttempts({ limit: 800 }), getAchievements(), db.listStudentAchievements(),
  ]);
  const conceptIdx = await getConceptIndex();
  const counts = await Promise.all(worlds.map(async (w) => (await getActivities(w.id)).length));
  const withCounts = worlds.map((w, i) => ({ ...w, activityCount: counts[i] }));
  const states = worldStates(withCounts, {
    activityResults: attempts.map((a) => ({ ...a, world: a.world_id })), masteryMap,
  });

  const lvl = levelFromXp(progress.xp || 0);
  const firstTry = attempts.length
    ? attempts.filter((a) => a.correct && a.attempt_number === 1).length / attempts.length : 0;

  const conceptRows = Array.from(masteryMap.entries())
    .map(([id, m]) => ({ id, ...m, label: conceptIdx.get(id)?.label || id, world: conceptIdx.get(id)?.worldNum }))
    .sort((a, b) => b.value - a.value);

  const strong = conceptRows.filter((c) => c.value >= 70).slice(0, 8);
  const weak = conceptRows.filter((c) => c.value < 50).slice(-8).reverse();

  // Actividad por semana (últimas 8)
  const weeks = weeklyActivity(attempts, 8);

  const activeDates = Array.from(new Set(attempts.map((a) => a.created_at.slice(0, 10))));

  replace(main, [el('div', { class: 'wrap' }, [
    el('div', { class: 'page-head' }, [
      el('div', {}, [
        el('h1', { text: t('progress.title') }),
        el('p', { class: 'page-head__sub', text: 'Todo lo que STATLAB Loyola sabe de tu aprendizaje, y cómo lo calcula.' }),
      ]),
      el('a', { class: 'btn btn--sm', href: '#/student', text: t('common.back') }),
    ]),

    el('div', { class: 'stats', style: { marginBottom: 'var(--s-5)' } }, [
      stat(t('student.level'), String(lvl.level), `${fmtInt(lvl.xpIntoLevel)} / ${fmtInt(lvl.xpNextLevel - lvl.xpAtLevel)} XP`, lvl.progress),
      stat(t('student.xp'), fmtInt(progress.xp || 0), ''),
      stat(t('student.mastery'), fmt(averageMastery(masteryMap), 0), `${masteryMap.size} conceptos`),
      stat(t('progress.firstTryAccuracy'), `${fmt(firstTry * 100, 0)} %`, `${attempts.length} actividades`),
      stat(t('progress.totalTime'), fmtDurationLong(progress.total_time_seconds || 0), ''),
      stat(t('student.streak'), tp('student.streakDays', progress.streak_days || 0), `Máx. ${progress.longest_streak || 0}`),
    ]),

    el('div', { class: 'grid grid--sidebar' }, [
      el('div', { class: 'stack-lg' }, [
        el('div', { class: 'card' }, [
          el('h2', { text: t('progress.byWorld') }),
          el('div', { class: 'bar-list' }, withCounts.map((w) => {
            const st = states.get(w.id);
            return el('div', { class: 'bar-list__row' }, [
              el('span', { class: 'bar-list__label', text: `${w.num}. ${w.title}` }),
              meter(st.progress || 0),
              el('span', { class: 'bar-list__val', text: st.total ? `${st.done}/${st.total}` : '—' }),
            ]);
          })),
        ]),

        el('div', { class: 'card' }, [
          el('h2', { text: 'Actividad por semana' }),
          el('div', { class: 'chartbox' }, [barChart(weeks, {
            yLabel: 'Actividades', xLabel: 'Semana', rotateX: true, showValues: true, h: 260,
          })]),
        ]),

        el('div', { class: 'card' }, [
          el('h2', { text: t('progress.activityHistory') }),
          el('div', { class: 'table-wrap' }, [
            el('table', {}, [
              el('thead', {}, [el('tr', {}, [
                el('th', { text: t('progress.date') }), el('th', { text: t('progress.concept') }),
                el('th', { text: t('progress.result') }), el('th', { text: t('progress.attempts') }),
                el('th', { text: 'Pistas' }), el('th', { text: 'XP' }),
              ])]),
              el('tbody', {}, attempts.slice(0, 30).map((a) => el('tr', {}, [
                el('td', { class: 'xsmall', text: fmtDateTime(a.created_at) }),
                el('td', { text: conceptIdx.get(a.concept_id)?.label || a.concept_id || '—' }),
                el('td', {}, [el('span', {
                  class: `badge ${a.correct ? 'badge--ok' : a.score > 0 ? 'badge--warn' : 'badge--bad'}`,
                  text: a.correct ? 'Correcto' : a.score > 0 ? `${Math.round(a.score * 100)} %` : 'Fallo',
                })]),
                el('td', { class: 'tabnum', text: String(a.attempt_number) }),
                el('td', { class: 'tabnum', text: String(a.hints_used) }),
                el('td', { class: 'tabnum', text: String(a.xp_earned) }),
              ]))),
            ]),
          ]),
        ]),
      ]),

      el('div', { class: 'stack-lg' }, [
        el('div', { class: 'card' }, [
          el('h2', { text: t('student.streak') }),
          el('div', { class: 'streak', style: { marginBottom: 'var(--s-2)' } },
            streakCalendar(activeDates, 14).map((d) => el('span', {
              class: `streak__day${d.active ? ' streak__day--on' : ''}${d.isToday ? ' streak__day--today' : ''}`,
              title: d.date,
            }))),
          el('p', { class: 'xsmall muted', text: 'Últimos 14 días. La racha no resta nada si se rompe: simplemente vuelve a empezar.' }),
        ]),

        el('div', { class: 'card' }, [
          el('h2', { text: t('progress.conceptsStrong') }),
          strong.length ? el('div', { class: 'bar-list' }, strong.map(conceptRow)) : el('p', { class: 'small muted', text: t('progress.noData') }),
        ]),

        el('div', { class: 'card' }, [
          el('h2', { text: t('progress.conceptsWeak') }),
          weak.length ? el('div', { class: 'bar-list' }, weak.map(conceptRow)) : el('p', { class: 'small muted', text: 'Nada por debajo de 50.' }),
          el('a', { class: 'btn btn--sm btn--block', href: '#/mistakes', text: t('mistakes.practiceConcept'), style: { marginTop: 'var(--s-3)' } }),
        ]),

        el('div', { class: 'card' }, [
          el('h2', { text: t('student.achievements') }),
          el('div', { class: 'achievements' }, achievements.map((a) => {
            const got = mine.find((x) => x.achievement_code === a.code);
            return el('div', { class: `ach${got ? '' : ' ach--locked'}` }, [
              el('span', { class: 'ach__icon', 'aria-hidden': 'true', text: a.icon }),
              el('span', { class: 'ach__text' }, [
                el('span', { class: 'ach__name', text: a.name }),
                el('span', { class: 'ach__desc', text: a.description }),
              ]),
            ]);
          })),
        ]),

        // Las fórmulas viven en su propia pantalla, a ancho completo: una
        // fracción con sumatorios no cabe en esta columna lateral.
        el('div', { class: 'card' }, [
          el('h2', { text: t('metrics.title') }),
          el('p', { class: 'small muted', text: t('metrics.cardLead') }),
          el('a', { class: 'btn btn--sm btn--block', href: '#/metrics', text: t('metrics.cardCta') }),
        ]),
      ]),
    ]),
  ])]);
  focusMain();
}

function conceptRow(c) {
  const lvl = masteryLevel(c.value);
  return el('div', { class: 'bar-list__row' }, [
    el('span', { class: 'bar-list__label', title: `Mundo ${c.world}`, text: c.label }),
    meter(c.value / 100, c.value < 40 ? 'low' : c.value < 70 ? 'mid' : ''),
    el('span', { class: 'bar-list__val', title: lvl.label, text: fmt(c.value, 0) }),
  ]);
}

function stat(label, value, sub, progress = null) {
  return el('div', { class: 'stat' }, [
    el('div', { class: 'stat__label', text: label }),
    el('div', { class: 'stat__value', text: value }),
    sub ? el('div', { class: 'stat__sub', text: sub }) : null,
    progress !== null ? meter(progress) : null,
  ]);
}

function weeklyActivity(attempts, nWeeks) {
  const out = [];
  const now = new Date();
  for (let i = nWeeks - 1; i >= 0; i--) {
    const end = new Date(now); end.setDate(end.getDate() - i * 7);
    const start = new Date(end); start.setDate(start.getDate() - 7);
    const count = attempts.filter((a) => {
      const d = new Date(a.created_at);
      return d > start && d <= end;
    }).length;
    out.push({ label: `${start.getDate()}/${start.getMonth() + 1}`, value: count });
  }
  return out;
}
