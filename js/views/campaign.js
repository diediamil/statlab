/**
 * Vistas: CAMPAÑA (mapa de progresión), MUNDO, PARTIDA RÁPIDA, MIS ERRORES
 * y ACTIVIDADES ASIGNADAS. Todas terminan delegando en `runSession()`.
 */

import { el, replace, focusMain } from '../dom.js';
import { t, tp } from '../i18n.js';
import { db } from '../data/store.js';
import { fmt } from '../utils.js';
import { getWorlds, getWorld, getActivities, getConcept, pickActivities, getFlow, GAMES } from '../content.js';
import { worldStates } from '../progress.js';
import { conceptsToReview } from '../mastery.js';
import { runSession } from './session.js';
import { meter } from './student.js';

/* ============================================================== campaña == */

export async function campaignView({ main }) {
  const [worlds, masteryMap, attempts, flow] = await Promise.all([
    getWorlds(), db.getMastery(), db.listAttempts({ limit: 500 }), getFlow(),
  ]);

  const counts = await Promise.all(worlds.map(async (w) => (await getActivities(w.id)).length));
  const withCounts = worlds.map((w, i) => ({ ...w, activityCount: counts[i] }));
  const states = worldStates(withCounts, {
    activityResults: attempts.map((a) => ({ ...a, world: a.world_id })),
    masteryMap,
  });

  const currentIdx = withCounts.findIndex((w) => ['available', 'started'].includes(states.get(w.id)?.state));

  replace(main, [el('div', { class: 'wrap' }, [
    el('div', { class: 'page-head' }, [
      el('div', {}, [
        el('h1', { text: t('worlds.title') }),
        el('p', { class: 'page-head__sub', text: t('worlds.subtitle') }),
      ]),
      el('a', { class: 'btn btn--sm', href: '#/student', text: t('activity.backToDashboard') }),
    ]),

    el('div', { class: 'map-flow' }, flow.flatMap((n, i, arr) => {
      const st = states.get(worlds[i]?.id)?.state;
      return [
        el('span', {
          class: `map-flow__node${st === 'completed' ? ' map-flow__node--done' : i === currentIdx ? ' map-flow__node--now' : ''}`,
          text: n,
        }),
        i < arr.length - 1 ? el('span', { class: 'map-flow__arrow', 'aria-hidden': 'true', text: '→' }) : null,
      ];
    })),

    el('div', { class: 'worldmap' }, withCounts.map((w) => {
      const st = states.get(w.id);
      const locked = st.state === 'locked';
      const prev = worlds.find((x) => x.id === w.requires);
      return el(locked ? 'div' : 'a', {
        class: `worldcard worldcard--${st.state}${locked ? ' worldcard--locked' : ''}`,
        href: locked ? null : `#/world/${w.id}`,
        'aria-disabled': locked ? 'true' : null,
        title: locked ? t('worlds.lockedHint', { world: `Mundo ${prev?.num}` }) : null,
      }, [
        el('div', { class: 'worldcard__num', 'aria-hidden': 'true', text: String(w.num) }),
        el('div', { class: 'worldcard__body' }, [
          el('div', { class: 'worldcard__title' }, [
            el('span', { 'aria-hidden': 'true', text: w.icon }),
            w.title,
          ]),
          el('div', { class: 'worldcard__concepts', text: w.subtitle }),
          el('div', { style: { marginTop: 'var(--s-3)' } }, [meter(st.progress || 0)]),
          el('div', { class: 'worldcard__concepts', style: { marginTop: 'var(--s-2)' } }, [
            tp('worlds.activities', w.activityCount),
            w.labs?.length ? ` · ${tp('worlds.labs', w.labs.length)}` : '',
            st.avgMastery ? ` · mastery ${fmt(st.avgMastery, 0)}` : '',
          ]),
        ]),
        el('span', {
          class: `badge worldcard__state ${st.state === 'completed' ? 'badge--ok' : st.state === 'started' ? 'badge--warn' : st.state === 'available' ? 'badge--brand' : ''}`,
          text: t(`worlds.${st.state}`),
        }),
      ]);
    })),
  ])]);
  focusMain();
}

/* ================================================================ mundo == */

export async function worldView({ main, params }) {
  const world = await getWorld(params.id);
  if (!world) { replace(main, [el('div', { class: 'wrap' }, [el('h1', { text: t('errors.pageNotFound') })])]); return; }

  const [activities, masteryMap] = await Promise.all([getActivities(world.id), db.getMastery()]);
  const attempts = await db.listAttempts({ limit: 500 });
  const doneIds = new Set(attempts.filter((a) => a.correct).map((a) => a.activity_id));

  const conceptRows = await Promise.all(world.concepts.map(async (c) => {
    const m = masteryMap.get(c.id);
    return { ...c, mastery: m?.value ?? 0, n: m?.n ?? 0 };
  }));

  replace(main, [el('div', { class: 'wrap' }, [
    el('div', { class: 'page-head' }, [
      el('div', {}, [
        el('h1', {}, [el('span', { 'aria-hidden': 'true', text: world.icon + ' ' }), `Mundo ${world.num}: ${world.title}`]),
        el('p', { class: 'page-head__sub', text: world.subtitle }),
      ]),
      el('a', { class: 'btn btn--sm', href: '#/campaign', text: t('common.back') }),
    ]),

    el('div', { class: 'grid grid--sidebar' }, [
      el('div', { class: 'stack-lg' }, [
        el('div', { class: 'card' }, [
          el('h2', { text: 'Practicar' }),
          el('p', { class: 'muted small', text: `Este mundo tiene ${activities.length} actividades. Se te ofrecerán en el orden que mejor encaje con tu nivel actual.` }),
          el('div', { class: 'row' }, [
            el('a', { class: 'btn btn--primary', href: `#/play/world/${world.id}`, text: t('worlds.enter') }),
            el('a', { class: 'btn', href: `#/play/world/${world.id}?n=3`, text: 'Sesión corta (3)' }),
          ]),
        ]),

        activities.length ? el('div', { class: 'card' }, [
          el('h2', { text: 'Actividades' }),
          el('ul', { class: 'list' }, activities.map((a) => el('li', {}, [
            el('div', { class: 'itemrow' }, [
              el('span', { class: 'badge', text: t(`common.${a.difficulty === 3 ? 'hard' : a.difficulty === 2 ? 'medium' : 'easy'}`) }),
              el('div', { class: 'itemrow__main' }, [
                el('div', { class: 'itemrow__title', text: a.prompt || a.id }),
                el('div', { class: 'itemrow__meta', text: `${a.type} · ${a.xp} XP` }),
              ]),
              doneIds.has(a.id) ? el('span', { class: 'badge badge--ok', text: '✓' }) : null,
            ]),
          ]))),
        ]) : el('div', { class: 'card' }, [el('p', { class: 'muted', text: t('activity.emptyWorld') })]),
      ]),

      el('div', { class: 'stack-lg' }, [
        el('div', { class: 'card' }, [
          el('h2', { text: t('worlds.concepts') }),
          el('div', { class: 'bar-list' }, conceptRows.map((c) => el('div', { class: 'bar-list__row' }, [
            el('span', { class: 'bar-list__label', text: c.label }),
            meter(c.mastery / 100, c.mastery < 40 ? 'low' : c.mastery < 70 ? 'mid' : ''),
            el('span', { class: 'bar-list__val', text: c.n ? fmt(c.mastery, 0) : '—' }),
          ]))),
          el('p', { class: 'xsmall muted', style: { marginTop: 'var(--s-2)' }, text: t('progress.masteryScale') }),
        ]),

        world.labs?.length ? el('div', { class: 'card' }, [
          el('h2', { text: t('labs.title') }),
          el('ul', { class: 'list' }, world.labs.map((g) => {
            const meta = GAMES.find((x) => x.id === g);
            return el('li', {}, [el('div', { class: 'itemrow' }, [
              el('span', { 'aria-hidden': 'true', text: meta?.icon || '🧪' }),
              el('div', { class: 'itemrow__main' }, [el('div', { class: 'itemrow__title', text: t(`games.${g}`) })]),
              el('a', { class: 'btn btn--sm', href: `#/lab/${g}`, text: t('labs.open') }),
            ])]);
          })),
        ]) : null,

        el('div', { class: 'card' }, [
          el('h2', { text: 'Errores frecuentes de este mundo' }),
          el('ul', { class: 'small' }, world.concepts.filter((c) => c.misconception).slice(0, 6)
            .map((c) => el('li', {}, [el('b', { text: c.label + ': ' }), c.misconception]))),
        ]),
      ]),
    ]),
  ])]);
  focusMain();
}

/* ==================================================== sesión de un mundo = */

export async function playWorldView({ main, params, query }) {
  const world = await getWorld(params.id);
  const n = Number(query.get('n')) || 6;
  const items = await pickActivities({ worldId: params.id, count: n });
  await runSession({
    main,
    title: `Mundo ${world.num}: ${world.title}`,
    crumbs: `${world.icon} ${world.title}`,
    items,
    backHref: `#/world/${params.id}`,
    source: 'campaign',
  });
}

/* ========================================================= partida rápida */

export async function quickView({ main, query }) {
  const conceptParam = query.get('concept');
  const worlds = await getWorlds();

  if (conceptParam) {
    const items = await pickActivities({ concepts: [conceptParam], count: 5 });
    const c = await getConcept(conceptParam);
    await runSession({
      main, title: `Práctica: ${c.label}`, crumbs: 'Partida rápida',
      items, backHref: '#/mistakes', source: 'quick',
    });
    return;
  }

  const masteryMap = await db.getMastery();
  const attempts = await db.listAttempts({ limit: 400 });
  const counts = await Promise.all(worlds.map(async (w) => (await getActivities(w.id)).length));
  const states = worldStates(worlds.map((w, i) => ({ ...w, activityCount: counts[i] })), {
    activityResults: attempts.map((a) => ({ ...a, world: a.world_id })), masteryMap,
  });
  const unlocked = worlds.filter((w) => states.get(w.id)?.state !== 'locked');

  const selected = new Set(unlocked.slice(0, 3).map((w) => w.id));
  const chips = unlocked.map((w) => el('button', {
    type: 'button', class: 'chip', 'aria-pressed': String(selected.has(w.id)),
    text: `${w.num}. ${w.title}`,
    onClick: (e) => {
      if (selected.has(w.id)) selected.delete(w.id); else selected.add(w.id);
      e.currentTarget.setAttribute('aria-pressed', String(selected.has(w.id)));
    },
  }));

  const nInput = el('input', { class: 'input input--num', type: 'number', value: '6', min: '3', max: '20' });

  replace(main, [el('div', { class: 'wrap wrap--mid' }, [
    el('div', { class: 'page-head' }, [
      el('div', {}, [
        el('h1', { text: t('modes.quick') }),
        el('p', { class: 'page-head__sub', text: t('modes.quickDesc') }),
      ]),
      el('a', { class: 'btn btn--sm', href: '#/student', text: t('common.back') }),
    ]),
    el('div', { class: 'card stack' }, [
      el('h2', { text: 'Elige los mundos' }),
      el('div', { class: 'row' }, chips),
      el('label', { class: 'field', style: { maxWidth: '12rem', marginTop: 'var(--s-4)' } }, [
        el('span', { class: 'field__label', text: 'Número de actividades' }),
        nInput,
      ]),
      el('button', {
        class: 'btn btn--primary btn--lg', type: 'button', text: 'Empezar',
        onClick: async () => {
          const ids = Array.from(selected);
          const pools = await Promise.all(ids.map((id) => getActivities(id)));
          const all = pools.flat();
          const count = Math.max(3, Math.min(20, Number(nInput.value) || 6));
          const shuffled = all.slice().sort(() => Math.random() - 0.5).slice(0, count);
          await runSession({
            main, title: t('modes.quick'), crumbs: 'Partida rápida',
            items: shuffled, backHref: '#/quick', source: 'quick',
          });
        },
      }),
    ]),
  ])]);
  focusMain();
}

/* ============================================================= mis errores */

export async function mistakesView({ main }) {
  const [masteryMap, attempts] = await Promise.all([db.getMastery(), db.listAttempts({ limit: 500 })]);
  const review = conceptsToReview(masteryMap, attempts, { limit: 12 });
  const rows = await Promise.all(review.map(async (r) => {
    const c = await getConcept(r.concept);
    return { ...r, label: c.label, misconception: c.misconception, world: c.worldTitle, worldNum: c.worldNum };
  }));

  replace(main, [el('div', { class: 'wrap' }, [
    el('div', { class: 'page-head' }, [
      el('div', {}, [
        el('h1', { text: t('mistakes.title') }),
        el('p', { class: 'page-head__sub', text: t('mistakes.subtitle') }),
      ]),
      el('a', { class: 'btn btn--sm', href: '#/student', text: t('common.back') }),
    ]),

    rows.length ? el('div', { class: 'stack' }, rows.map((r) => el('div', { class: 'card card--pad-sm' }, [
      el('div', { class: 'itemrow' }, [
        el('div', { class: 'itemrow__main' }, [
          el('div', { class: 'itemrow__title', text: r.label }),
          el('div', { class: 'itemrow__meta' }, [
            r.world ? `Mundo ${r.worldNum}: ${r.world}` : '',
            r.errors ? ` · ${tp('mistakes.errorsCount', r.errors)}` : '',
            ` · mastery ${fmt(r.mastery, 0)}/100`,
          ]),
        ]),
        el('a', { class: 'btn btn--sm btn--primary', href: `#/quick?concept=${encodeURIComponent(r.concept)}`, text: t('mistakes.practiceConcept') }),
      ]),
      el('div', { style: { marginTop: 'var(--s-3)' } }, [meter(r.mastery / 100, r.mastery < 40 ? 'low' : 'mid')]),
      r.misconception ? el('p', { class: 'xsmall', style: { marginTop: 'var(--s-2)' } }, [
        el('b', { text: t('mistakes.misconception') + ': ' }), r.misconception,
      ]) : null,
    ]))) : el('div', { class: 'card' }, [
      el('div', { class: 'empty' }, [
        el('div', { class: 'empty__icon', 'aria-hidden': 'true', text: '✓' }),
        el('p', { text: t('mistakes.clean') }),
        el('a', { class: 'btn btn--primary', href: '#/campaign', text: 'Seguir avanzando' }),
      ]),
    ]),
  ])]);
  focusMain();
}

/* ======================================================== mis actividades */

export async function assignmentsView({ main }) {
  const assignments = await db.listMyAssignments();

  replace(main, [el('div', { class: 'wrap' }, [
    el('div', { class: 'page-head' }, [
      el('div', {}, [
        el('h1', { text: t('modes.assignments') }),
        el('p', { class: 'page-head__sub', text: t('modes.assignmentsDesc') }),
      ]),
      el('a', { class: 'btn btn--sm', href: '#/student', text: t('common.back') }),
    ]),
    assignments.length ? el('div', { class: 'stack' }, assignments.map((a) => {
      const done = a.myProgress?.completed_at;
      return el('div', { class: 'card' }, [
        el('div', { class: 'row row--between' }, [
          el('div', {}, [
            el('h2', { class: 'mb-0', text: a.title }),
            el('p', { class: 'small muted', text: a.description || '' }),
          ]),
          el('span', { class: `badge ${done ? 'badge--ok' : 'badge--warn'}`, text: done ? 'Completada' : 'Pendiente' }),
        ]),
        el('div', { class: 'challenge-window' }, [
          a.opens_at ? el('div', {}, [el('b', { text: 'Disponible' }), new Date(a.opens_at).toLocaleString('es-ES')]) : null,
          a.due_at ? el('div', {}, [el('b', { text: 'Entrega' }), new Date(a.due_at).toLocaleString('es-ES')]) : null,
          el('div', {}, [el('b', { text: 'Ejercicios' }), String(a.n_exercises)]),
          el('div', {}, [el('b', { text: 'Feedback' }), a.feedback_mode === 'immediate' ? 'Inmediato' : 'Al terminar']),
        ]),
        el('div', { class: 'row', style: { marginTop: 'var(--s-4)' } }, [
          el('a', { class: 'btn btn--primary', href: `#/assignment/${a.id}`, text: done ? 'Repetir' : 'Empezar' }),
        ]),
      ]);
    })) : el('div', { class: 'card' }, [el('p', { class: 'muted', text: t('student.noPending') })]),
  ])]);
  focusMain();
}

export async function assignmentPlayView({ main, params }) {
  const all = await db.listMyAssignments();
  const a = all.find((x) => x.id === params.id);
  if (!a) { replace(main, [el('div', { class: 'wrap' }, [el('h1', { text: t('errors.pageNotFound') })])]); return; }
  const items = await pickActivities({
    worldId: a.world_id || null,
    concepts: a.concepts?.length ? a.concepts : null,
    count: a.n_exercises,
    difficulty: a.difficulty || null,
  });
  await runSession({
    main, title: a.title, crumbs: 'Actividad asignada',
    items, backHref: '#/assignments', source: 'assignment',
    assignmentId: a.id, classId: a.class_id,
  });
}
