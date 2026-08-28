/**
 * Vista: PANEL DEL ESTUDIANTE
 * ---------------------------------------------------------------------------
 * Es la pantalla principal. Responde de un vistazo a cuatro preguntas:
 *   ¿dónde estoy? (nivel, XP, mastery, racha)
 *   ¿qué hago ahora? (continuar, reto de la semana, actividades pendientes)
 *   ¿qué me está costando? (conceptos a repasar)
 *   ¿cómo voy respecto a la clase? (posición semanal y de temporada)
 */

import { el, replace, modal, toast, announce } from '../dom.js';
import { t, tp } from '../i18n.js';
import { db } from '../data/store.js';
import { user } from '../auth.js';
import { navigate } from '../router.js';
import { fmt, fmtInt, fmtDurationLong, fmtRelative, fmtDateTime } from '../utils.js';
import { getWorlds, getConcept, getAchievements } from '../content.js';
import { levelFromXp, streakCalendar, worldStates } from '../progress.js';
import { averageMastery, conceptsToReview } from '../mastery.js';
import { challengeState, solutionAvailable } from '../challenges.js';

const MODES = [
  { id: 'campaign', href: '#/campaign', icon: '🗺️', accent: 'var(--brand-1)' },
  { id: 'lab', href: '#/lab', icon: '🧪', accent: 'var(--brand-2)' },
  { id: 'quick', href: '#/quick', icon: '⚡', accent: 'var(--brand-3)' },
  { id: 'challenge', href: '#/challenge', icon: '🏆', accent: 'var(--brand-5)' },
  { id: 'assignments', href: '#/assignments', icon: '📋', accent: 'var(--info)' },
  { id: 'progress', href: '#/progress', icon: '📈', accent: 'var(--brand-2)' },
  { id: 'mistakes', href: '#/mistakes', icon: '🔧', accent: 'var(--brand-4)' },
  { id: 'metrics', href: '#/metrics', icon: '📐', accent: 'var(--ink-3)' },
];

export default async function studentDashboard({ main }) {
  const me = user();
  replace(main, [el('div', { class: 'loading' }, [el('span', { class: 'spinner' }), t('app.loading')])]);

  const [worlds, progress, masteryMap, attempts, enrolments, achievements, myAchievements] = await Promise.all([
    getWorlds(), db.getProgress(), db.getMastery(),
    db.listAttempts({ limit: 400 }), db.listMyEnrolments(),
    getAchievements(), db.listStudentAchievements(),
  ]);

  const lvl = levelFromXp(progress.xp || 0);
  const worldsWithCounts = await Promise.all(worlds.map(async (w) => ({ ...w })));
  const states = worldStates(worldsWithCounts, {
    activityResults: attempts.map((a) => ({ ...a, world: a.world_id })),
    masteryMap,
  });

  const review = conceptsToReview(masteryMap, attempts, { limit: 5 });
  const reviewLabels = await Promise.all(review.map(async (r) => ({ ...r, label: (await getConcept(r.concept)).label })));

  const myClass = enrolments[0] || null;
  let challenges = [];
  let weekly = null, seasonal = null;
  if (myClass) {
    challenges = await db.listMyChallenges();
    const open = challenges.find((c) => challengeState(c) === 'open');
    if (open) {
      const rk = await db.weeklyRanking(open.id);
      weekly = { challenge: open, myRow: rk.find((r) => r.isMe) || null, total: rk.length };
    } else if (challenges.length) {
      const last = challenges[0];
      const rk = await db.weeklyRanking(last.id);
      weekly = { challenge: last, myRow: rk.find((r) => r.isMe) || null, total: rk.length };
    }
    const sr = await db.seasonalRanking(myClass.id);
    seasonal = { rows: sr, myRow: sr.find((r) => r.isMe) || null };
  }

  const assignments = myClass ? await db.listMyAssignments() : [];
  const pending = assignments.filter((a) => !a.myProgress?.completed_at
    && (!a.due_at || new Date(a.due_at).getTime() > Date.now() - 86400000));

  const nextChallenge = challenges.find((c) => challengeState(c) === 'open')
    || challenges.find((c) => challengeState(c) === 'upcoming');

  const activeDates = Array.from(new Set(attempts.map((a) => a.created_at.slice(0, 10))));
  const avgMastery = averageMastery(masteryMap);

  /* ------------------------------------------------------------ pintado -- */

  replace(main, [el('div', { class: 'wrap' }, [
    el('div', { class: 'page-head' }, [
      el('div', {}, [
        el('h1', { text: t('student.greeting', { name: me?.first_name || 'estudiante' }) }),
        el('p', { class: 'page-head__sub', text: t('student.greetingSub') }),
      ]),
      myClass
        ? el('div', { class: 'row' }, [
          el('span', { class: 'badge badge--brand', text: myClass.class_name }),
          el('button', {
            class: 'btn btn--sm', type: 'button', text: t('student.joinClass'),
            onClick: () => joinClassDialog(),
          }),
        ])
        : null,
    ]),

    // ---------- sin clase ----------
    !myClass ? el('div', { class: 'card', style: { borderLeft: '4px solid var(--brand-3)', marginBottom: 'var(--s-5)' } }, [
      el('h2', { text: t('student.noClass') }),
      el('p', { text: t('student.noClassText') }),
      el('button', { class: 'btn btn--primary', type: 'button', text: t('student.joinClass'), onClick: () => joinClassDialog() }),
    ]) : null,

    // ---------- KPIs ----------
    el('div', { class: 'stats', style: { marginBottom: 'var(--s-5)' } }, [
      statCard(t('student.level'), String(lvl.level), t('student.xpToNext', { xp: fmtInt(lvl.xpNeeded), level: lvl.level + 1 }), lvl.progress),
      statCard(t('student.xp'), fmtInt(progress.xp || 0), `${fmtInt(progress.activities_completed || 0)} actividades resueltas`),
      statCard(t('student.mastery'), `${fmt(avgMastery, 0)}/100`, `${masteryMap.size} conceptos con evidencia`, avgMastery / 100),
      statCard(t('student.streak'), tp('student.streakDays', progress.streak_days || 0),
        `Máximo: ${progress.longest_streak || 0}`),
      statCard(t('student.challengesDone'), String(progress.challenges_completed || 0),
        seasonal?.myRow ? `${fmtInt(seasonal.myRow.total_points)} puntos de temporada` : 'Sin retos aún'),
      statCard(t('progress.totalTime'), fmtDurationLong(progress.total_time_seconds || 0), ''),
    ]),

    // ---------- racha ----------
    el('div', { class: 'card card--pad-sm', style: { marginBottom: 'var(--s-5)' } }, [
      el('div', { class: 'row row--between' }, [
        el('div', {}, [
          el('div', { class: 'stat__label', text: t('student.streak') }),
          el('div', { class: 'small muted', text: 'Últimos 7 días' }),
        ]),
        el('div', { class: 'streak', role: 'img', 'aria-label': `Actividad de los últimos 7 días` },
          streakCalendar(activeDates).map((d) => el('span', {
            class: `streak__day${d.active ? ' streak__day--on' : ''}${d.isToday ? ' streak__day--today' : ''}`,
            title: d.date,
          }))),
      ]),
    ]),

    // ---------- modos ----------
    el('h2', { text: '¿Qué quieres hacer?' }),
    el('div', { class: 'modes', style: { marginBottom: 'var(--s-6)' } }, MODES.map((m) => el('a', {
      class: 'mode', href: m.href, style: { '--accent': m.accent },
    }, [
      el('span', { class: 'mode__icon', 'aria-hidden': 'true', text: m.icon }),
      el('span', { class: 'mode__title', text: t(`modes.${m.id}`) }),
      el('span', { class: 'mode__desc', text: t(`modes.${m.id}Desc`) }),
      m.id === 'challenge' && nextChallenge
        ? el('span', { class: 'badge badge--challenge mode__flag', text: challengeState(nextChallenge) === 'open' ? 'Abierto ahora' : 'Próximamente' })
        : null,
      m.id === 'assignments' && pending.length
        ? el('span', { class: 'badge badge--warn mode__flag', text: `${pending.length} pendientes` })
        : null,
      m.id === 'mistakes' && reviewLabels.length
        ? el('span', { class: 'badge badge--bad mode__flag', text: `${reviewLabels.length} conceptos` })
        : null,
    ]))),

    el('div', { class: 'grid grid--sidebar' }, [
      // -------- columna principal --------
      el('div', { class: 'stack-lg' }, [
        // continuar
        el('div', { class: 'card' }, [
          el('h2', { text: t('student.continueTitle') }),
          continueBlock(states, worlds, progress),
        ]),

        // reto
        nextChallenge ? challengeCard(nextChallenge, weekly) : null,

        // actividades pendientes
        el('div', { class: 'card' }, [
          el('div', { class: 'row row--between' }, [
            el('h2', { class: 'mb-0', text: t('student.pendingAssignments') }),
            pending.length ? el('a', { class: 'btn btn--sm', href: '#/assignments', text: 'Ver todas' }) : null,
          ]),
          pending.length
            ? el('ul', { class: 'list' }, pending.slice(0, 4).map((a) => el('li', {}, [
              el('div', { class: 'itemrow' }, [
                el('div', { class: 'itemrow__main' }, [
                  el('div', { class: 'itemrow__title', text: a.title }),
                  el('div', { class: 'itemrow__meta', text: a.due_at ? `Entrega ${fmtRelative(a.due_at)} · ${fmtDateTime(a.due_at)}` : 'Sin fecha límite' }),
                ]),
                el('a', { class: 'btn btn--sm btn--primary', href: `#/assignment/${a.id}`, text: 'Empezar' }),
              ]),
            ])))
            : el('p', { class: 'muted', text: t('student.noPending') }),
        ]),

        // errores
        el('div', { class: 'card' }, [
          el('div', { class: 'row row--between' }, [
            el('h2', { class: 'mb-0', text: t('student.frequentMistakes') }),
            el('a', { class: 'btn btn--sm', href: '#/mistakes', text: 'Practicar' }),
          ]),
          reviewLabels.length
            ? el('div', { class: 'bar-list', style: { marginTop: 'var(--s-3)' } }, reviewLabels.map((r) => el('div', { class: 'bar-list__row' }, [
              el('span', { class: 'bar-list__label', text: r.label }),
              meter(r.mastery / 100, r.mastery < 40 ? 'low' : r.mastery < 70 ? 'mid' : ''),
              el('span', { class: 'bar-list__val', text: `${fmt(r.mastery, 0)}` }),
            ])))
            : el('p', { class: 'muted', text: t('student.noMistakes') }),
        ]),
      ]),

      // -------- barra lateral --------
      el('div', { class: 'stack-lg' }, [
        // posiciones
        myClass && seasonal ? el('div', { class: 'card' }, [
          el('h2', { text: t('ranking.title') }),
          weekly?.myRow
            ? el('div', { class: 'readout readout--hl' }, [
              el('span', { class: 'readout__k', text: t('student.weeklyRank') }),
              el('span', { class: 'readout__v', text: `${weekly.myRow.position}/${weekly.total}` }),
            ])
            : el('p', { class: 'small muted', text: 'Aún no has participado en el reto activo.' }),
          seasonal.myRow
            ? el('div', { class: 'readout' }, [
              el('span', { class: 'readout__k', text: t('student.seasonRank') }),
              el('span', { class: 'readout__v', text: `${seasonal.myRow.position}/${seasonal.rows.length}` }),
            ])
            : null,
          seasonal.myRow
            ? el('div', { class: 'readout' }, [
              el('span', { class: 'readout__k', text: t('ranking.points') }),
              el('span', { class: 'readout__v', text: fmtInt(seasonal.myRow.total_points) }),
            ])
            : null,
          el('a', { class: 'btn btn--sm btn--block', href: '#/ranking', text: 'Ver rankings', style: { marginTop: 'var(--s-3)' } }),
          el('p', { class: 'xsmall muted', style: { marginTop: 'var(--s-2)' }, text: t('ranking.aliasOnly') }),
        ]) : null,

        // mapa de mundos resumido
        el('div', { class: 'card' }, [
          el('h2', { text: t('worlds.title') }),
          el('div', { class: 'bar-list' }, worlds.slice(0, 15).map((w) => {
            const st = states.get(w.id);
            return el('a', {
              class: 'bar-list__row', href: st.state === 'locked' ? '#/campaign' : `#/world/${w.id}`,
              style: { textDecoration: 'none', color: 'inherit', opacity: st.state === 'locked' ? 0.55 : 1 },
            }, [
              el('span', { class: 'bar-list__label' }, [
                el('span', { 'aria-hidden': 'true', text: `${w.icon} ` }), `${w.num}. ${w.title}`,
              ]),
              meter(st.progress || 0),
              el('span', { class: 'bar-list__val', text: stateIcon(st.state) }),
            ]);
          })),
          el('a', { class: 'btn btn--sm btn--block', href: '#/campaign', text: 'Abrir el mapa', style: { marginTop: 'var(--s-3)' } }),
        ]),

        // logros
        el('div', { class: 'card' }, [
          el('h2', { text: t('student.achievements') }),
          el('p', { class: 'small muted', text: t('student.achievementsUnlocked', { n: myAchievements.length, total: achievements.length }) }),
          el('div', { class: 'achievements' }, achievements.slice(0, 8).map((a) => {
            const got = myAchievements.some((x) => x.achievement_code === a.code);
            return el('div', { class: `ach${got ? '' : ' ach--locked'}`, title: a.description }, [
              el('span', { class: 'ach__icon', 'aria-hidden': 'true', text: a.icon }),
              el('span', { class: 'ach__text' }, [
                el('span', { class: 'ach__name', text: a.name }),
                el('span', { class: 'ach__desc', text: got ? 'Conseguido' : a.description }),
              ]),
            ]);
          })),
        ]),

        // Sin tarjeta de fórmulas: en esta pantalla ya está el modo «Cómo se
        // mide» en la rejilla de arriba, y repetir el mismo destino dos veces
        // solo alarga la columna.
      ]),
    ]),
  ])]);

  announce('Panel del estudiante cargado.');

  /* ------------------------------------------------------- subvistas ---- */

  function joinClassDialog() {
    const input = el('input', { class: 'input', id: 'joinCode', maxlength: '10', autocapitalize: 'characters', style: { textTransform: 'uppercase' } });
    const err = el('span', { class: 'field__error', hidden: true });
    const close = modal({
      title: t('student.joinClass'),
      body: el('div', {}, [
        el('label', { class: 'field', for: 'joinCode' }, [
          el('span', { class: 'field__label', text: t('student.joinCode') }),
          input,
          el('span', { class: 'field__hint', text: t('student.joinCodeHint') }),
          err,
        ]),
      ]),
      footer: [
        el('button', { class: 'btn', type: 'button', text: t('common.cancel'), onClick: () => close() }),
        el('button', {
          class: 'btn btn--primary', type: 'button', text: t('student.joinAction'),
          onClick: async () => {
            try {
              const c = await db.joinClassByCode(input.value);
              close();
              toast(t('student.joined', { name: c.class_name || c.className }), 'ok');
              navigate('/student');
              location.reload();
            } catch (e) {
              err.hidden = false;
              err.textContent = e.code === 'CODIGO_NO_VALIDO' ? t('student.joinNotFound') : e.message;
            }
          },
        }),
      ],
    });
  }
}

/* ------------------------------------------------------------- helpers --- */

function statCard(label, value, sub, progress = null) {
  return el('div', { class: 'stat' }, [
    el('div', { class: 'stat__label', text: label }),
    el('div', { class: 'stat__value', text: value }),
    sub ? el('div', { class: 'stat__sub', text: sub }) : null,
    progress !== null ? meter(progress) : null,
  ]);
}

export function meter(fraction, variant = '') {
  const pct = Math.max(0, Math.min(100, (fraction || 0) * 100));
  return el('div', { class: `meter meter--thin${variant ? ' meter--' + variant : ''}` }, [
    el('div', { class: 'meter__track', role: 'progressbar', 'aria-valuenow': Math.round(pct), 'aria-valuemin': '0', 'aria-valuemax': '100' }, [
      el('div', { class: 'meter__fill', style: { width: `${pct}%` } }),
    ]),
  ]);
}

const stateIcon = (state) => ({ locked: '🔒', available: '▶', started: '◑', completed: '✓' }[state] || '');

function continueBlock(states, worlds, progress) {
  const current = worlds.find((w) => states.get(w.id)?.state === 'started')
    || worlds.find((w) => states.get(w.id)?.state === 'available')
    || worlds[0];
  const st = states.get(current.id);
  return el('div', {}, [
    el('div', { class: 'itemrow' }, [
      el('div', { class: 'worldcard__num', 'aria-hidden': 'true', text: String(current.num) }),
      el('div', { class: 'itemrow__main' }, [
        el('div', { class: 'itemrow__title', text: `${current.icon} Mundo ${current.num}: ${current.title}` }),
        el('div', { class: 'itemrow__meta', text: current.subtitle }),
        st?.avgMastery ? el('div', { class: 'itemrow__meta', text: `Mastery medio del mundo: ${fmt(st.avgMastery, 0)}/100` }) : null,
      ]),
      el('a', { class: 'btn btn--primary', href: `#/world/${current.id}`, text: t('student.continueAction') }),
    ]),
    progress.last_activity_id
      ? el('p', { class: 'xsmall muted', style: { marginTop: 'var(--s-3)' } , text: `Última actividad: ${progress.last_activity_id}` })
      : null,
  ]);
}

function challengeCard(ch, weekly) {
  const state = challengeState(ch);
  return el('div', { class: 'card', style: { borderLeft: '4px solid var(--brand-5)' } }, [
    el('div', { class: 'row row--between' }, [
      el('div', {}, [
        el('div', { class: 'challenge-hero__kicker', text: t('challenge.title') }),
        el('h2', { class: 'mb-0', text: ch.number ? `${t('challenge.number', { n: ch.number })} — ${ch.title}` : ch.title }),
      ]),
      el('span', {
        class: `badge ${state === 'open' ? 'badge--ok' : state === 'upcoming' ? 'badge--warn' : ''}`,
        text: state === 'open' ? 'Abierto' : state === 'upcoming' ? 'Próximamente' : 'Cerrado',
      }),
    ]),
    el('p', { class: 'small muted', style: { marginTop: 'var(--s-2)' }, text: ch.description || '' }),
    el('div', { class: 'challenge-window' }, [
      el('div', {}, [el('b', { text: t('challenge.opens') }), fmtDateTime(ch.opens_at)]),
      el('div', {}, [el('b', { text: t('challenge.closes') }), fmtDateTime(ch.closes_at)]),
    ]),
    weekly?.myRow
      ? el('p', { class: 'small', style: { marginTop: 'var(--s-3)' } }, [
        el('span', { class: 'badge badge--challenge', text: `${fmtInt(weekly.myRow.challenge_points)} CP` }),
        ` · posición ${weekly.myRow.position} de ${weekly.total}`,
      ])
      : null,
    el('div', { class: 'row', style: { marginTop: 'var(--s-4)' } }, [
      el('a', {
        class: 'btn btn--primary', href: `#/challenge/${ch.id}`,
        text: state === 'open' ? t('challenge.start') : state === 'closed' && solutionAvailable(ch) ? t('challenge.viewSolution') : 'Ver detalles',
      }),
      el('a', { class: 'btn', href: '#/ranking', text: t('ranking.weekly') }),
    ]),
  ]);
}
