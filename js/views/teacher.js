/**
 * Vista: PANEL DEL PROFESOR
 * ---------------------------------------------------------------------------
 * Diez pestañas, una sola pregunta de fondo:
 *   «¿qué ha entendido realmente la clase y qué tengo que volver a explicar?»
 *
 * La pantalla clave es «Reto semanal → ¿Dónde falló la clase?», que traduce
 * los resultados en decisiones docentes concretas.
 */

import { el, replace, clear, focusMain, toast, modal, confirmDialog } from '../dom.js';
import { t } from '../i18n.js';
import { db, isDemo } from '../data/store.js';
import { user } from '../auth.js';
import { fmt, fmtInt, fmtDateTime, fmtDurationLong, fmtRelative, todayKey } from '../utils.js';
import { getWorlds, getConceptIndex, getBuiltInChallenges } from '../content.js';
import { splitChallenge, CHALLENGE_TEMPLATES, challengeState, POLICY_LABELS } from '../challenges.js';
import { barChart } from '../viz.js';
import { meter } from './student.js';
import { buildExportBundle, downloadCsv, downloadZip } from '../export.js';

const TABS = ['overview', 'classes', 'students', 'progress', 'content', 'difficulties', 'assignments', 'challenge', 'rankings', 'export'];

export default async function teacherView({ main, query }) {
  const me = user();
  const classes = await db.listMyClasses();
  const tab = TABS.includes(query.get('tab')) ? query.get('tab') : 'overview';
  const classId = query.get('class') || classes[0]?.id || null;
  const cls = classes.find((c) => c.id === classId) || null;

  const nav = el('div', { class: 'tabs', role: 'tablist' }, TABS.map((id) => el('button', {
    class: 'tab', role: 'tab', 'aria-selected': String(id === tab), type: 'button',
    text: t(`teacher.tabs.${id}`),
    onClick: () => { location.hash = `#/teacher?tab=${id}${classId ? `&class=${classId}` : ''}`; },
  })));

  const classSelect = classes.length > 1 ? el('select', {
    class: 'select', 'aria-label': t('teacher.selectClass'),
    onChange: (e) => { location.hash = `#/teacher?tab=${tab}&class=${e.target.value}`; },
  }, classes.map((c) => el('option', { value: c.id, selected: c.id === classId, text: c.class_name }))) : null;

  const body = el('div', { style: { marginTop: 'var(--s-5)' } });

  replace(main, [el('div', { class: 'wrap' }, [
    el('div', { class: 'page-head' }, [
      el('div', {}, [
        el('h1', { text: t('teacher.title') }),
        el('p', { class: 'page-head__sub', text: `${me?.first_name || ''} ${me?.last_name || ''} · ${cls ? cls.class_name : 'sin clase seleccionada'}` }),
      ]),
      el('div', { class: 'row' }, [
        classSelect,
        el('button', { class: 'btn btn--sm btn--primary', type: 'button', text: t('teacher.createClass'), onClick: () => createClassDialog() }),
      ]),
    ]),
    nav,
    body,
  ])]);

  if (!classes.length) {
    replace(body, [el('div', { class: 'card' }, [
      el('div', { class: 'empty' }, [
        el('div', { class: 'empty__icon', 'aria-hidden': 'true', text: '🏫' }),
        el('h2', { text: t('teacher.noClasses') }),
        el('p', { text: 'Crea tu primera clase y comparte el código con tu alumnado.' }),
        el('button', { class: 'btn btn--primary', type: 'button', text: t('teacher.createClass'), onClick: () => createClassDialog() }),
      ]),
    ])]);
    return;
  }

  replace(body, [el('div', { class: 'loading' }, [el('span', { class: 'spinner' }), t('app.loading')])]);

  try {
    switch (tab) {
      case 'overview': await renderOverview(); break;
      case 'classes': await renderClasses(); break;
      case 'students': await renderStudents(); break;
      case 'progress': await renderProgress(); break;
      case 'content': await renderContent(); break;
      case 'difficulties': await renderDifficulties(); break;
      case 'assignments': await renderAssignments(); break;
      case 'challenge': await renderChallenges(); break;
      case 'rankings': await renderRankings(); break;
      case 'export': await renderExport(); break;
      default: await renderOverview();
    }
  } catch (err) {
    console.error('[teacher]', err);
    replace(body, [el('div', { class: 'callout callout--bad', text: t('errors.loadFailed') + ' ' + err.message })]);
  }
  focusMain();

  /* ======================================================== 1. RESUMEN == */

  async function renderOverview() {
    const [summary, alerts, members, challenges] = await Promise.all([
      db.classSummary(classId), db.pedagogicalAlerts(classId),
      db.listClassMembers(classId), db.listChallenges({ classId }),
    ]);
    const lastChallenge = challenges.filter((c) => c.published)[0] || null;
    const difficulty = await db.conceptDifficulty(classId);
    const conceptIdx = await getConceptIndex();

    replace(body, [
      el('div', { class: 'stats', style: { marginBottom: 'var(--s-5)' } }, [
        kpi(t('teacher.students'), String(summary?.students ?? members.length)),
        kpi(t('teacher.activeStudents'), String(summary?.active_7d ?? 0)),
        kpi(t('teacher.avgMastery'), fmt(summary?.mean_mastery ?? 0, 0)),
        kpi(t('teacher.avgAccuracy'), `${fmt(summary?.mean_accuracy_pct ?? 0, 0)} %`),
        kpi('Tiempo total', fmtDurationLong(summary?.total_time_seconds ?? 0)),
        kpi('Retos publicados', String(challenges.filter((c) => c.published).length)),
      ]),

      el('div', { class: 'grid grid--sidebar' }, [
        el('div', { class: 'stack-lg' }, [
          el('div', { class: 'card' }, [
            el('h2', { text: t('teacher.conceptDifficulty') }),
            el('p', { class: 'small muted', text: 'Los cinco conceptos con menor porcentaje de acierto en la clase. Aquí es donde hay que volver.' }),
            difficulty.length ? el('div', { class: 'bar-list' }, difficulty.slice(0, 8).map((d) => el('div', { class: 'bar-list__row' }, [
              el('span', { class: 'bar-list__label', text: conceptIdx.get(d.concept_id)?.label || d.concept_id }),
              meter(d.correct_pct / 100, d.correct_pct < 50 ? 'low' : d.correct_pct < 70 ? 'mid' : ''),
              el('span', { class: 'bar-list__val', text: `${fmt(d.correct_pct, 0)} %` }),
            ]))) : el('p', { class: 'muted', text: t('progress.noData') }),
          ]),

          lastChallenge ? el('div', { class: 'card' }, [
            el('div', { class: 'row row--between' }, [
              el('h2', { class: 'mb-0', text: `Último reto: ${lastChallenge.title}` }),
              el('a', { class: 'btn btn--sm', href: `#/teacher?tab=challenge&class=${classId}`, text: 'Ver análisis' }),
            ]),
            el('p', { class: 'small muted', text: `${t(`challenge.types.${lastChallenge.challenge_type}`)} · cierra ${fmtRelative(lastChallenge.closes_at)}` }),
          ]) : null,
        ]),

        el('div', { class: 'card' }, [
          el('h2', { text: t('teacher.alerts') }),
          el('p', { class: 'xsmall muted', text: 'Avisos orientativos. No son diagnósticos ni etiquetas.' }),
          alerts.length ? el('div', { class: 'alerts' }, alerts.slice(0, 12).map((a) => el('div', {
            class: `alert-row alert-row--${a.kind}`,
          }, [
            el('div', { class: 'grow' }, [
              el('div', { class: 'strong', text: a.title }),
              el('div', { class: 'xsmall muted', text: `${a.alias} — ${a.detail}` }),
            ]),
            el('a', { class: 'btn btn--sm', href: `#/teacher/student/${a.student_id}`, text: t('teacher.viewStudent') }),
          ]))) : el('p', { class: 'muted', text: t('teacher.noAlerts') }),
        ]),
      ]),
    ]);
  }

  /* ========================================================= 2. CLASES == */

  async function renderClasses() {
    replace(body, [el('div', { class: 'stack' }, classes.map((c) => el('div', { class: 'card stack' }, [
      el('div', { class: 'row row--between' }, [
        el('h2', { class: 'mb-0', text: c.class_name }),
        el('span', { class: 'badge', text: c.academic_year }),
      ]),
      el('div', { class: 'row' }, [
        el('div', { class: 'panel', style: { fontFamily: 'var(--font-mono)', fontSize: 'var(--fs-xl)', letterSpacing: '.12em' }, text: c.class_code }),
        el('button', {
          class: 'btn btn--sm', type: 'button', text: t('common.copy'),
          onClick: async () => { await navigator.clipboard?.writeText(c.class_code); toast(t('teacher.codeCopied'), 'ok'); },
        }),
        el('button', {
          class: 'btn btn--sm', type: 'button', text: t('teacher.regenerateCode'),
          onClick: async () => {
            if (!await confirmDialog({ title: t('teacher.regenerateCode'), message: 'El código anterior dejará de funcionar. ¿Continuar?' })) return;
            await db.regenerateClassCode(c.id);
            toast(t('teacher.saved'), 'ok');
            location.reload();
          },
        }),
      ]),
      el('div', { class: 'grid grid--2' }, [
        toggleField(t('teacher.rankingEnabled'), c.ranking_enabled, async (v) => {
          await db.updateClass(c.id, { ranking_enabled: v }); toast(t('teacher.saved'), 'ok');
        }),
        numberField(t('teacher.seasonBestN'), c.season_best_n, 1, 30, async (v) => {
          await db.updateClass(c.id, { season_best_n: v }); toast(t('teacher.saved'), 'ok');
        }),
      ]),
      el('p', { class: 'xsmall muted', text: `Creada el ${fmtDateTime(c.created_at)}` }),
    ])))]);
  }

  /* ======================================================= 3. ALUMNOS == */

  async function renderStudents() {
    const members = await db.listClassMembers(classId);
    replace(body, [
      el('p', { class: 'small muted', text: 'El profesorado sí ve la correspondencia entre alias y persona. El alumnado, nunca.' }),
      el('div', { class: 'table-wrap' }, [
        el('table', {}, [
          el('thead', {}, [el('tr', {}, [
            el('th', { text: t('teacher.realName') }), el('th', { text: t('ranking.alias') }),
            el('th', { text: 'Grado' }), el('th', { text: 'Nivel' }), el('th', { text: 'XP' }),
            el('th', { text: t('teacher.avgMastery') }), el('th', { text: 'Acierto 1er intento' }),
            el('th', { text: 'Actividades' }), el('th', { text: t('teacher.lastActive') }),
            el('th', { text: t('common.actions') }),
          ])]),
          el('tbody', {}, members.map((m) => el('tr', {}, [
            el('td', { text: `${m.first_name} ${m.last_name}` }),
            el('td', {}, [el('span', { class: 'badge badge--brand', text: m.alias || '—' })]),
            el('td', { text: m.degree ? t(`degrees.${m.degree}`) : '—' }),
            el('td', { class: 'tabnum', text: String(m.progress?.level ?? 1) }),
            el('td', { class: 'tabnum', text: fmtInt(m.progress?.xp ?? 0) }),
            el('td', { class: 'tabnum', text: fmt(m.meanMastery, 0) }),
            el('td', { class: 'tabnum', text: `${fmt(m.firstTryAccuracy * 100, 0)} %` }),
            el('td', { class: 'tabnum', text: String(m.attempts) }),
            el('td', { class: 'xsmall', text: m.lastActive || 'nunca' }),
            el('td', {}, [el('a', { class: 'btn btn--sm', href: `#/teacher/student/${m.id}`, text: 'Ficha' })]),
          ]))),
        ]),
      ]),
    ]);
  }

  /* ====================================================== 4. PROGRESO == */

  async function renderProgress() {
    const members = await db.listClassMembers(classId);
    const worlds = await getWorlds();
    const attempts = await db.listClassAttempts(classId);

    const byWorld = worlds.map((w) => {
      const rows = attempts.filter((a) => a.world_id === w.id);
      return {
        label: `${w.num}`,
        value: rows.length ? Math.round(100 * rows.filter((a) => a.correct).length / rows.length) : 0,
        n: rows.length,
        title: w.title,
      };
    });

    replace(body, [
      el('div', { class: 'card' }, [
        el('h2', { text: 'Acierto por mundo' }),
        el('p', { class: 'small muted', text: 'Porcentaje de intentos correctos en cada mundo (toda la clase).' }),
        el('div', { class: 'chartbox' }, [barChart(byWorld.filter((w) => w.n > 0), {
          yLabel: '% de acierto', xLabel: 'Mundo', yMax: 100, h: 300,
        })]),
      ]),
      el('div', { class: 'card', style: { marginTop: 'var(--s-5)' } }, [
        el('h2', { text: 'Distribución del nivel' }),
        el('div', { class: 'bar-list' }, members.slice().sort((a, b) => (b.progress?.xp || 0) - (a.progress?.xp || 0)).map((m) => el('div', { class: 'bar-list__row' }, [
          el('span', { class: 'bar-list__label', text: m.alias || `${m.first_name}` }),
          meter(Math.min(1, (m.progress?.xp || 0) / 2000)),
          el('span', { class: 'bar-list__val', text: `Niv. ${m.progress?.level ?? 1}` }),
        ]))),
      ]),
    ]);
  }

  /* ===================================================== 5. CONTENIDOS == */

  async function renderContent() {
    const worlds = await getWorlds();
    const attempts = await db.listClassAttempts(classId);
    replace(body, [
      el('div', { class: 'card' }, [
        el('h2', { text: 'Contenidos disponibles' }),
        el('p', { class: 'small muted', text: 'Los mundos, conceptos y actividades viven en archivos JSON dentro de data/. Se pueden ampliar sin tocar código: consulta docs/contenido.md.' }),
        el('div', { class: 'table-wrap' }, [
          el('table', {}, [
            el('thead', {}, [el('tr', {}, [
              el('th', { text: 'Mundo' }), el('th', { text: 'Conceptos' }),
              el('th', { text: 'Laboratorios' }), el('th', { text: 'Intentos de la clase' }),
              el('th', { text: '% acierto' }),
            ])]),
            el('tbody', {}, worlds.map((w) => {
              const rows = attempts.filter((a) => a.world_id === w.id);
              return el('tr', {}, [
                el('td', { text: `${w.num}. ${w.title}` }),
                el('td', { class: 'tabnum', text: String(w.concepts.length) }),
                el('td', { class: 'tabnum', text: String((w.labs || []).length) }),
                el('td', { class: 'tabnum', text: String(rows.length) }),
                el('td', { class: 'tabnum', text: rows.length ? `${Math.round(100 * rows.filter((a) => a.correct).length / rows.length)} %` : '—' }),
              ]);
            })),
          ]),
        ]),
      ]),
    ]);
  }

  /* ==================================================== 6. DIFICULTADES = */

  async function renderDifficulties() {
    const [difficulty, conceptIdx] = await Promise.all([db.conceptDifficulty(classId), getConceptIndex()]);
    replace(body, [
      el('div', { class: 'card' }, [
        el('h2', { text: t('teacher.conceptDifficulty') }),
        el('p', { class: 'small muted', text: 'Ordenado de menor a mayor acierto. Un concepto por debajo del 60 % merece una explicación adicional en clase.' }),
        el('div', { class: 'table-wrap' }, [
          el('table', {}, [
            el('thead', {}, [el('tr', {}, [
              el('th', { text: t('common.concept') }), el('th', { text: t('common.world') }),
              el('th', { text: 'Intentos' }), el('th', { text: 'Alumnos' }),
              el('th', { text: '% acierto' }), el('th', { text: 'Puntuación media' }),
              el('th', { text: 'Pistas/intento' }),
            ])]),
            el('tbody', {}, difficulty.map((d) => {
              const c = conceptIdx.get(d.concept_id);
              return el('tr', {}, [
                el('td', {}, [
                  el('div', { class: 'strong', text: c?.label || d.concept_id }),
                  c?.misconception ? el('div', { class: 'xsmall muted', text: c.misconception }) : null,
                ]),
                el('td', { text: c ? `M${c.worldNum}` : '—' }),
                el('td', { class: 'tabnum', text: String(d.attempts) }),
                el('td', { class: 'tabnum', text: String(d.students) }),
                el('td', {}, [el('span', {
                  class: `badge ${d.correct_pct < 50 ? 'badge--bad' : d.correct_pct < 70 ? 'badge--warn' : 'badge--ok'}`,
                  text: `${fmt(d.correct_pct, 0)} %`,
                })]),
                el('td', { class: 'tabnum', text: `${fmt(d.mean_score_pct, 0)} %` }),
                el('td', { class: 'tabnum', text: fmt(d.mean_hints, 2) }),
              ]);
            })),
          ]),
        ]),
      ]),
    ]);
  }

  /* ==================================================== 7. ACTIVIDADES == */

  async function renderAssignments() {
    const assignments = await db.listAssignments({ classId });
    const worlds = await getWorlds();

    replace(body, [
      el('div', { class: 'teacher-toolbar' }, [
        el('button', { class: 'btn btn--primary', type: 'button', text: t('teacher.createAssignment'), onClick: () => assignmentDialog(null, worlds) }),
      ]),
      assignments.length ? el('div', { class: 'stack' }, assignments.map((a) => el('div', { class: 'card' }, [
        el('div', { class: 'row row--between' }, [
          el('div', {}, [
            el('h2', { class: 'mb-0', text: a.title }),
            el('p', { class: 'small muted', text: a.description || '' }),
          ]),
          el('span', { class: `badge ${a.published ? 'badge--ok' : 'badge--warn'}`, text: a.published ? t('teacher.published') : t('teacher.draft') }),
        ]),
        el('div', { class: 'challenge-window' }, [
          el('div', {}, [el('b', { text: 'Mundo' }), a.world_id || '—']),
          el('div', {}, [el('b', { text: 'Ejercicios' }), String(a.n_exercises)]),
          el('div', {}, [el('b', { text: 'Intentos' }), String(a.max_attempts)]),
          el('div', {}, [el('b', { text: 'Entrega' }), a.due_at ? fmtDateTime(a.due_at) : '—']),
        ]),
        el('div', { class: 'row', style: { marginTop: 'var(--s-3)' } }, [
          el('button', { class: 'btn btn--sm', type: 'button', text: t('common.edit'), onClick: () => assignmentDialog(a, worlds) }),
          el('button', {
            class: 'btn btn--sm', type: 'button', text: a.published ? t('teacher.unpublish') : t('teacher.publish'),
            onClick: async () => { await db.updateAssignment(a.id, { published: !a.published }); toast(t('teacher.saved'), 'ok'); rerender(); },
          }),
          el('button', {
            class: 'btn btn--sm btn--danger', type: 'button', text: t('common.delete'),
            onClick: async () => {
              if (!await confirmDialog({ title: t('common.delete'), message: `¿Eliminar «${a.title}»?`, danger: true })) return;
              await db.deleteAssignment(a.id); toast(t('teacher.deleted'), 'ok'); rerender();
            },
          }),
        ]),
      ]))) : el('div', { class: 'card' }, [el('p', { class: 'muted', text: 'Todavía no has creado actividades.' })]),
    ]);
  }

  /* ================================================== 8. RETO SEMANAL == */

  async function renderChallenges() {
    const challenges = await db.listChallenges({ classId });
    const selected = query.get('challengeId') || challenges[0]?.id || null;

    const list = el('div', { class: 'stack' }, challenges.map((c) => el('div', {
      class: 'card card--pad-sm', style: { borderLeft: `4px solid ${c.id === selected ? 'var(--brand-5)' : 'var(--line)'}` },
    }, [
      el('div', { class: 'row row--between' }, [
        el('div', {}, [
          el('div', { class: 'strong', text: `${c.number ? `#${c.number} · ` : ''}${c.title}` }),
          el('div', { class: 'xsmall muted', text: `${t(`challenge.types.${c.challenge_type}`)} · ${fmtDateTime(c.opens_at)} → ${fmtDateTime(c.closes_at)}` }),
        ]),
        el('span', { class: `badge ${c.published ? 'badge--ok' : 'badge--warn'}`, text: c.published ? t('teacher.published') : t('teacher.draft') }),
      ]),
      el('div', { class: 'row', style: { marginTop: 'var(--s-2)' } }, [
        el('a', { class: 'btn btn--sm', href: `#/teacher?tab=challenge&class=${classId}&challengeId=${c.id}`, text: t('challengeAdmin.dashboard') }),
        el('button', { class: 'btn btn--sm', type: 'button', text: t('common.edit'), onClick: () => challengeDialog(c) }),
        el('button', {
          class: 'btn btn--sm', type: 'button', text: c.published ? t('teacher.unpublish') : t('teacher.publish'),
          onClick: async () => { await db.updateChallenge(c.id, { published: !c.published }); toast(t('teacher.saved'), 'ok'); rerender(); },
        }),
        el('a', { class: 'btn btn--sm btn--ghost', href: `#/challenge/${c.id}`, text: t('teacher.preview') }),
      ]),
    ])));

    const analytics = el('div');
    replace(body, [
      el('div', { class: 'teacher-toolbar' }, [
        el('button', { class: 'btn btn--primary', type: 'button', text: t('challengeAdmin.create'), onClick: () => challengeDialog(null) }),
      ]),
      el('div', { class: 'grid grid--sidebar' }, [analytics, el('div', {}, [el('h2', { text: 'Retos de la clase' }), list])]),
    ]);

    if (!selected) {
      replace(analytics, [el('div', { class: 'card' }, [el('p', { class: 'muted', text: 'Crea un reto para ver su análisis.' })])]);
      return;
    }

    replace(analytics, [el('div', { class: 'loading' }, [el('span', { class: 'spinner' }), t('app.loading')])]);
    const a = await db.challengeAnalytics(selected);
    if (!a) { replace(analytics, [el('div', { class: 'card' }, [el('p', { text: 'Sin datos.' })])]); return; }

    const conceptIdx = await getConceptIndex();

    replace(analytics, [
      el('div', { class: 'card stack' }, [
        el('div', { class: 'row row--between' }, [
          el('h2', { class: 'mb-0', text: a.challenge.title }),
          el('div', { class: 'row' }, [
            el('span', { class: 'badge', text: POLICY_LABELS[a.challenge.competitive_attempts] }),
            challengeState(a.challenge) === 'closed' && a.challenge.solution_policy === 'manual'
              ? el('button', {
                class: 'btn btn--sm btn--primary', type: 'button', text: t('challengeAdmin.publishSolution'),
                onClick: async () => { await db.publishSolution(a.challenge.id); toast(t('challengeAdmin.solutionPublished'), 'ok'); },
              }) : null,
          ]),
        ]),

        el('div', { class: 'stats' }, [
          kpi(t('challengeAdmin.participants'), `${a.participants}/${a.classSize}`),
          kpi(t('challengeAdmin.completed'), String(a.completed)),
          kpi(t('challengeAdmin.meanScore'), fmtInt(a.meanScore)),
          kpi(t('challengeAdmin.medianScore'), fmtInt(a.medianScore)),
          kpi(t('challengeAdmin.meanTime'), fmtDurationLong(a.meanTime)),
          kpi(t('challengeAdmin.perfectRuns'), `${a.perfectRuns} (${fmt(a.perfectRunPct, 0)} %)`),
          kpi(t('challengeAdmin.meanErrors'), fmt(a.meanErrors, 1)),
          kpi(t('challengeAdmin.hintsTotal'), String(a.hintsTotal)),
        ]),

        el('h3', { text: t('challengeAdmin.scoreDistribution') }),
        el('div', { class: 'chartbox' }, [barChart(a.distribution.map((b) => ({ label: b.label, value: b.count })), {
          yLabel: 'Estudiantes', xLabel: 'Challenge Points', h: 240,
        })]),
      ]),

      el('div', { class: 'card stack', style: { marginTop: 'var(--s-5)' } }, [
        el('h2', { text: t('teacher.classFailedWhere') }),
        el('p', { class: 'small muted', text: 'Porcentaje de la clase que resolvió correctamente cada paso. Los pasos por debajo del 60 % son los que hay que retomar en la próxima sesión.' }),
        el('div', { class: 'bar-list' }, a.steps.map((s, i) => el('div', { class: 'bar-list__row' }, [
          el('span', { class: 'bar-list__label', title: s.prompt, text: `${i + 1}. ${conceptIdx.get(s.concept_id)?.label || s.concept_id || 'paso'}` }),
          meter((s.correct_pct ?? 0) / 100, (s.correct_pct ?? 0) < 50 ? 'low' : (s.correct_pct ?? 0) < 70 ? 'mid' : ''),
          el('span', { class: 'bar-list__val', text: s.correct_pct === null ? '—' : `${fmt(s.correct_pct, 0)} %` }),
        ]))),

        el('h3', { style: { marginTop: 'var(--s-5)' }, text: t('challengeAdmin.worstConcepts') }),
        el('ul', { class: 'small' }, a.worstConcepts.map((s) => el('li', {}, [
          el('b', { text: `${conceptIdx.get(s.concept_id)?.label || s.concept_id}: ` }),
          `${fmt(s.correct_pct, 0)} % de acierto. `,
          conceptIdx.get(s.concept_id)?.misconception || '',
        ]))),

        a.nonParticipants ? el('div', { class: 'callout callout--warn' }, [
          el('span', { class: 'callout__title', text: `${a.nonParticipants} sin participar` }),
          (a.nonParticipantAliases || []).filter(Boolean).join(' · '),
        ]) : null,
      ]),
    ]);
  }

  /* ====================================================== 9. RANKINGS == */

  async function renderRankings() {
    const challenges = (await db.listChallenges({ classId })).filter((c) => c.published);
    const selected = query.get('challengeId') || challenges[0]?.id;
    const [weekly, seasonal, improved] = await Promise.all([
      selected ? db.weeklyRanking(selected) : [],
      db.seasonalRanking(classId),
      db.mostImproved(classId),
    ]);
    const members = await db.listClassMembers(classId);
    const nameOf = (id) => {
      const m = members.find((x) => x.id === id);
      return m ? `${m.first_name} ${m.last_name}` : '—';
    };

    replace(body, [
      el('div', { class: 'callout', style: { marginBottom: 'var(--s-4)' } }, [
        el('span', { class: 'callout__title', text: 'Vista docente' }),
        'Solo tú ves la correspondencia entre alias y persona. El alumnado ve exclusivamente el alias.',
      ]),
      el('div', { class: 'card' }, [
        el('div', { class: 'row row--between' }, [
          el('h2', { class: 'mb-0', text: t('ranking.weekly') }),
          challenges.length > 1 ? el('select', {
            class: 'select', style: { maxWidth: '18rem' },
            onChange: (e) => { location.hash = `#/teacher?tab=rankings&class=${classId}&challengeId=${e.target.value}`; },
          }, challenges.map((c) => el('option', { value: c.id, selected: c.id === selected, text: c.title }))) : null,
        ]),
        weekly.length ? el('div', { class: 'table-wrap', style: { marginTop: 'var(--s-3)' } }, [
          el('table', {}, [
            el('thead', {}, [el('tr', {}, ['#', 'Alias', 'Nombre real', 'CP', 'Tiempo activo', 'Errores', 'Pistas', 'Perfect'].map((h) => el('th', { text: h })))]),
            el('tbody', {}, weekly.map((r) => el('tr', {}, [
              el('td', { class: 'tabnum strong', text: String(r.position) }),
              el('td', {}, [el('span', { class: 'badge badge--brand', text: r.alias })]),
              el('td', { text: nameOf(r.student_id) }),
              el('td', { class: 'tabnum', text: fmtInt(r.challenge_points) }),
              el('td', { text: fmtDurationLong(r.active_time_seconds) }),
              el('td', { class: 'tabnum', text: String(r.errors) }),
              el('td', { class: 'tabnum', text: String(r.hints_used) }),
              el('td', { text: r.perfect_run ? '💠' : '' }),
            ]))),
          ]),
        ]) : el('p', { class: 'muted', text: t('ranking.empty') }),
      ]),

      el('div', { class: 'card', style: { marginTop: 'var(--s-5)' } }, [
        el('h2', { text: t('ranking.seasonal') }),
        el('p', { class: 'small muted', text: t('ranking.bestN', { n: cls.season_best_n }) }),
        el('div', { class: 'table-wrap' }, [
          el('table', {}, [
            el('thead', {}, [el('tr', {}, ['#', 'Alias', 'Nombre real', 'Puntos', 'Contados', 'Realizados', 'Media'].map((h) => el('th', { text: h })))]),
            el('tbody', {}, seasonal.map((r) => el('tr', {}, [
              el('td', { class: 'tabnum strong', text: String(r.position) }),
              el('td', {}, [el('span', { class: 'badge badge--brand', text: r.alias })]),
              el('td', { text: nameOf(r.student_id) }),
              el('td', { class: 'tabnum', text: fmtInt(r.total_points) }),
              el('td', { class: 'tabnum', text: String(r.challenges_counted) }),
              el('td', { class: 'tabnum', text: String(r.challenges_done) }),
              el('td', { class: 'tabnum', text: fmtInt(r.avg_points) }),
            ]))),
          ]),
        ]),
      ]),

      improved.length ? el('div', { class: 'card', style: { marginTop: 'var(--s-5)' } }, [
        el('h2', { text: t('ranking.mostImproved') }),
        el('ul', { class: 'list' }, improved.slice(0, 6).map((r) => el('li', {}, [
          el('div', { class: 'itemrow' }, [
            el('span', { 'aria-hidden': 'true', text: '📈' }),
            el('div', { class: 'itemrow__main' }, [
              el('div', { class: 'itemrow__title', text: `${r.alias} — ${nameOf(r.student_id)}` }),
              el('div', { class: 'itemrow__meta', text: `+${fmtInt(r.improvement)} puntos sobre su media anterior (${fmtInt(r.previous_average)})` }),
            ]),
          ]),
        ]))),
      ]) : null,
    ]);
  }

  /* ==================================================== 10. EXPORTAR === */

  async function renderExport() {
    const build = async (pseudonymised) => {
      toast('Preparando la exportación…');
      const tables = await db.exportTables(classId, { pseudonymised });
      return { tables, files: buildExportBundle(tables, { className: cls.class_name, pseudonymised }) };
    };

    replace(body, [
      el('div', { class: 'grid grid--2' }, [
        el('div', { class: 'card stack' }, [
          el('h2', { text: t('teacher.exportIdentified') }),
          el('p', { class: 'small muted', text: t('teacher.exportIdentifiedDesc') }),
          el('div', { class: 'callout callout--warn' }, [
            el('span', { class: 'callout__title', text: 'Datos personales' }),
            'Incluye nombre, apellidos y correo. Guárdalo en soporte cifrado y bórralo cuando ya no lo necesites.',
          ]),
          el('button', {
            class: 'btn btn--primary', type: 'button', text: `${t('teacher.exportAll')} (ZIP)`,
            onClick: async () => {
              const { files } = await build(false);
              await downloadZip(`statlab-${slugify(cls.class_name)}-identificada-${todayKey()}.zip`, files);
              toast('Exportación descargada', 'ok');
            },
          }),
        ]),
        el('div', { class: 'card stack' }, [
          el('h2', { text: t('teacher.exportPseudo') }),
          el('p', { class: 'small muted', text: t('teacher.exportPseudoDesc') }),
          el('div', { class: 'callout callout--ok' }, [
            el('span', { class: 'callout__title', text: 'Para análisis e investigación' }),
            'Identidad sustituida por un UUID estable. Permite seguimiento longitudinal sin identificar.',
          ]),
          el('button', {
            class: 'btn btn--primary', type: 'button', text: `${t('teacher.exportAll')} (ZIP)`,
            onClick: async () => {
              const { files } = await build(true);
              await downloadZip(`statlab-${slugify(cls.class_name)}-pseudonimizada-${todayKey()}.zip`, files);
              toast('Exportación descargada', 'ok');
            },
          }),
        ]),
      ]),

      el('div', { class: 'card', style: { marginTop: 'var(--s-5)' } }, [
        el('h2', { text: 'Descargar tablas sueltas' }),
        el('p', { class: 'small muted', text: t('teacher.exportNote') }),
        el('div', { class: 'lab-actions' }, [
          'students.csv', 'attempts.csv', 'progress.csv', 'challenge_attempts.csv',
          'challenge_steps.csv', 'weekly_rankings.csv', 'seasonal_rankings.csv',
          'concept_mastery.csv', 'class_summary.csv', 'concept_difficulty.csv',
        ].map((name) => el('button', {
          class: 'btn btn--sm', type: 'button', text: name,
          onClick: async () => {
            const { tables } = await build(false);
            downloadCsv(name, tables[name] || []);
          },
        }))),
      ]),
    ]);
  }

  /* ===================================================== diálogos ===== */

  function createClassDialog() {
    const name = el('input', { class: 'input', id: 'clsName', value: 'Bioestadística 1º' });
    const year = el('input', { class: 'input', id: 'clsYear', value: '2025-2026' });
    const close = modal({
      title: t('teacher.createClass'),
      body: el('div', {}, [
        labeled(t('teacher.className'), name),
        labeled(t('teacher.academicYear'), year),
      ]),
      footer: [
        el('button', { class: 'btn', type: 'button', text: t('common.cancel'), onClick: () => close() }),
        el('button', {
          class: 'btn btn--primary', type: 'button', text: t('common.create'),
          onClick: async () => {
            const c = await db.createClass({ className: name.value, academicYear: year.value });
            close();
            toast(`Clase creada. Código: ${c.class_code}`, 'ok');
            location.hash = `#/teacher?tab=classes&class=${c.id}`;
            location.reload();
          },
        }),
      ],
    });
  }

  function assignmentDialog(existing, worlds) {
    const f = {
      title: el('input', { class: 'input', value: existing?.title || '' }),
      description: el('textarea', { class: 'textarea', text: existing?.description || '' }),
      world: el('select', { class: 'select' }, [el('option', { value: '', text: '— Cualquiera —' }),
        ...worlds.map((w) => el('option', { value: w.id, selected: existing?.world_id === w.id, text: `${w.num}. ${w.title}` }))]),
      difficulty: el('select', { class: 'select' }, [
        el('option', { value: '', text: 'Adaptativa' }),
        el('option', { value: '1', selected: existing?.difficulty === 1, text: t('common.easy') }),
        el('option', { value: '2', selected: existing?.difficulty === 2, text: t('common.medium') }),
        el('option', { value: '3', selected: existing?.difficulty === 3, text: t('common.hard') }),
      ]),
      n: el('input', { class: 'input', type: 'number', min: '1', max: '30', value: String(existing?.n_exercises || 8) }),
      attempts: el('input', { class: 'input', type: 'number', min: '1', max: '10', value: String(existing?.max_attempts || 3) }),
      feedback: el('select', { class: 'select' }, [
        el('option', { value: 'immediate', selected: existing?.feedback_mode !== 'after', text: t('teacher.feedbackImmediate') }),
        el('option', { value: 'after', selected: existing?.feedback_mode === 'after', text: t('teacher.feedbackAfter') }),
      ]),
      due: el('input', { class: 'input', type: 'datetime-local', value: toLocal(existing?.due_at) }),
      opens: el('input', { class: 'input', type: 'datetime-local', value: toLocal(existing?.opens_at) }),
    };

    const save = async (publish) => {
      const payload = {
        class_id: classId,
        title: f.title.value.trim() || 'Actividad sin título',
        description: f.description.value.trim(),
        world_id: f.world.value || null,
        difficulty: f.difficulty.value ? Number(f.difficulty.value) : null,
        n_exercises: Number(f.n.value) || 8,
        max_attempts: Number(f.attempts.value) || 3,
        feedback_mode: f.feedback.value,
        opens_at: f.opens.value ? new Date(f.opens.value).toISOString() : null,
        due_at: f.due.value ? new Date(f.due.value).toISOString() : null,
        published: publish,
      };
      if (existing) await db.updateAssignment(existing.id, payload);
      else await db.createAssignment(payload);
      close();
      toast(t('teacher.saved'), 'ok');
      rerender();
    };

    const close = modal({
      title: existing ? t('common.edit') : t('teacher.createAssignment'),
      body: el('div', {}, [
        labeled(t('teacher.assignmentTitle'), f.title),
        labeled('Descripción', f.description),
        el('div', { class: 'grid grid--2' }, [labeled(t('common.world'), f.world), labeled(t('common.difficulty'), f.difficulty)]),
        el('div', { class: 'grid grid--2' }, [labeled(t('teacher.exercises'), f.n), labeled(t('teacher.maxAttempts'), f.attempts)]),
        labeled(t('teacher.feedbackMode'), f.feedback),
        el('div', { class: 'grid grid--2' }, [labeled('Disponible desde', f.opens), labeled(t('teacher.dueDate'), f.due)]),
      ]),
      footer: [
        el('button', { class: 'btn', type: 'button', text: t('teacher.saveDraft'), onClick: () => save(false) }),
        el('button', { class: 'btn btn--primary', type: 'button', text: t('teacher.publish'), onClick: () => save(true) }),
      ],
    });
  }

  async function challengeDialog(existing) {
    const templates = await getBuiltInChallenges();
    const f = {
      title: el('input', { class: 'input', value: existing?.title || '' }),
      description: el('textarea', { class: 'textarea', text: existing?.description || '' }),
      template: el('select', { class: 'select' }, [
        el('option', { value: '', text: '— Reto en blanco (configurar por JSON) —' }),
        ...templates.map((tpl) => el('option', { value: tpl.id, selected: existing?.builtin_template === tpl.id, text: `${tpl.title} (${tpl.steps.length} pasos)` })),
      ]),
      type: el('select', { class: 'select' }, CHALLENGE_TEMPLATES.map((x) => el('option', {
        value: x.id, selected: existing?.challenge_type === x.id, text: x.label,
      }))),
      number: el('input', { class: 'input', type: 'number', min: '1', value: String(existing?.number || 1) }),
      difficulty: el('select', { class: 'select' }, [1, 2, 3].map((d) => el('option', {
        value: String(d), selected: (existing?.difficulty || 2) === d,
        text: t(`common.${d === 1 ? 'easy' : d === 2 ? 'medium' : 'hard'}`),
      }))),
      opens: el('input', { class: 'input', type: 'datetime-local', value: toLocal(existing?.opens_at) || toLocal(new Date().toISOString()) }),
      closes: el('input', { class: 'input', type: 'datetime-local', value: toLocal(existing?.closes_at) || toLocal(new Date(Date.now() + 7 * 86400000).toISOString()) }),
      minutes: el('input', { class: 'input', type: 'number', min: '1', max: '120', value: String(Math.round((existing?.recommended_seconds || 900) / 60)) }),
      maxAttempts: el('input', { class: 'input', type: 'number', min: '1', max: '10', value: String(existing?.max_attempts || 3) }),
      policy: el('select', { class: 'select' }, Object.entries(POLICY_LABELS).map(([k, v]) => el('option', {
        value: k, selected: (existing?.competitive_attempts || 'first') === k, text: v,
      }))),
      hints: checkbox(existing ? existing.allow_hints : true),
      solution: el('select', { class: 'select' }, [
        ['immediate', t('challengeAdmin.solutionImmediate')],
        ['on_close', t('challengeAdmin.solutionOnClose')],
        ['manual', t('challengeAdmin.solutionManual')],
      ].map(([k, v]) => el('option', { value: k, selected: (existing?.solution_policy || 'on_close') === k, text: v }))),
      ranking: checkbox(existing ? existing.show_ranking : true),
      season: checkbox(existing ? existing.counts_for_season : true),
    };

    const save = async (publish) => {
      const tpl = templates.find((x) => x.id === f.template.value);
      const split = tpl ? splitChallenge(tpl) : { configuration: existing?.configuration || { steps: [] }, solution: existing?.solution || { steps: [] } };
      const payload = {
        class_id: classId,
        number: Number(f.number.value) || 1,
        title: f.title.value.trim() || tpl?.title || 'Reto sin título',
        description: f.description.value.trim() || tpl?.description || '',
        challenge_type: f.type.value,
        world_id: tpl?.world || existing?.world_id || null,
        concepts: tpl?.concepts || existing?.concepts || [],
        difficulty: Number(f.difficulty.value),
        configuration: split.configuration,
        solution: split.solution,
        builtin_template: tpl?.id || existing?.builtin_template || null,
        opens_at: new Date(f.opens.value).toISOString(),
        closes_at: new Date(f.closes.value).toISOString(),
        recommended_seconds: Math.max(60, Number(f.minutes.value) * 60),
        max_attempts: Number(f.maxAttempts.value) || 3,
        competitive_attempts: f.policy.value,
        allow_hints: f.hints.checked,
        solution_policy: f.solution.value,
        show_ranking: f.ranking.checked,
        counts_for_season: f.season.checked,
        published: publish,
      };
      if (existing) await db.updateChallenge(existing.id, payload);
      else await db.createChallenge(payload);
      close();
      toast(t('teacher.saved'), 'ok');
      rerender();
    };

    const close = modal({
      title: existing ? t('challengeAdmin.edit') : t('challengeAdmin.create'),
      body: el('div', {}, [
        labeled(t('challengeAdmin.template'), f.template),
        el('p', { class: 'xsmall muted', text: 'Al elegir una plantilla se copian sus pasos y su solución. La solución nunca se envía al navegador del alumnado hasta que se libera.' }),
        el('div', { class: 'grid grid--2' }, [labeled('Número', f.number), labeled('Tipo', f.type)]),
        labeled('Título', f.title),
        labeled('Descripción', f.description),
        el('div', { class: 'grid grid--2' }, [labeled(t('challengeAdmin.opensAt'), f.opens), labeled(t('challengeAdmin.closesAt'), f.closes)]),
        el('div', { class: 'grid grid--2' }, [
          labeled(t('challengeAdmin.recommendedTime'), f.minutes),
          labeled(t('common.difficulty'), f.difficulty),
        ]),
        el('p', { class: 'xsmall muted', text: t('challengeAdmin.recommendedTimeHint') }),
        el('div', { class: 'grid grid--2' }, [
          labeled('Intentos máximos', f.maxAttempts),
          labeled(t('challengeAdmin.competitivePolicy'), f.policy),
        ]),
        labeled(t('challengeAdmin.solutionPolicy'), f.solution),
        el('div', { class: 'stack' }, [
          checkRow(t('challengeAdmin.allowHints'), f.hints),
          checkRow(t('challengeAdmin.showRanking'), f.ranking),
          checkRow(t('challengeAdmin.countsForSeason'), f.season),
        ]),
      ]),
      footer: [
        el('button', { class: 'btn', type: 'button', text: t('teacher.saveDraft'), onClick: () => save(false) }),
        el('button', { class: 'btn btn--primary', type: 'button', text: t('teacher.publish'), onClick: () => save(true) }),
      ],
    });
  }

  function rerender() { location.reload(); }

  void isDemo; void clear;
}

/* ================================================= ficha del estudiante == */

export async function teacherStudentView({ main, params }) {
  const detail = await db.studentDetail(params.id);
  if (!detail?.profile) { replace(main, [el('div', { class: 'wrap' }, [el('h1', { text: t('errors.pageNotFound') })])]); return; }
  const conceptIdx = await getConceptIndex();
  const p = detail.profile;
  const pr = detail.progress;

  const masteryRows = Array.from(detail.mastery.entries())
    .map(([id, m]) => ({ id, ...m, label: conceptIdx.get(id)?.label || id }))
    .sort((a, b) => a.value - b.value);

  replace(main, [el('div', { class: 'wrap' }, [
    el('div', { class: 'page-head' }, [
      el('div', {}, [
        el('h1', { text: `${p.first_name} ${p.last_name}` }),
        el('p', { class: 'page-head__sub' }, [
          el('span', { class: 'badge badge--brand', text: p.alias || '—' }),
          ` · ${p.degree ? t(`degrees.${p.degree}`) : ''} · ${p.email}`,
        ]),
      ]),
      el('a', { class: 'btn btn--sm', href: '#/teacher?tab=students', text: t('common.back') }),
    ]),

    el('div', { class: 'stats', style: { marginBottom: 'var(--s-5)' } }, [
      kpi('Nivel', String(pr.level ?? 1)),
      kpi('XP', fmtInt(pr.xp ?? 0)),
      kpi('Racha', String(pr.streak_days ?? 0)),
      kpi('Actividades', String(detail.attempts.length)),
      kpi('Retos', String(detail.challenges.filter((c) => c.completed).length)),
      kpi('Tiempo', fmtDurationLong(pr.total_time_seconds ?? 0)),
    ]),

    el('div', { class: 'grid grid--sidebar' }, [
      el('div', { class: 'stack-lg' }, [
        el('div', { class: 'card' }, [
          el('h2', { text: 'Conceptos a reforzar' }),
          detail.review.length ? el('div', { class: 'bar-list' }, detail.review.map((r) => el('div', { class: 'bar-list__row' }, [
            el('span', { class: 'bar-list__label', text: conceptIdx.get(r.concept)?.label || r.concept }),
            meter(r.mastery / 100, r.mastery < 40 ? 'low' : 'mid'),
            el('span', { class: 'bar-list__val', text: `${fmt(r.mastery, 0)} · ${r.errors} err.` }),
          ]))) : el('p', { class: 'muted', text: 'Sin conceptos pendientes.' }),
        ]),
        el('div', { class: 'card' }, [
          el('h2', { text: 'Últimas actividades' }),
          el('div', { class: 'table-wrap' }, [
            el('table', {}, [
              el('thead', {}, [el('tr', {}, ['Fecha', 'Concepto', 'Resultado', 'Intentos', 'Pistas'].map((h) => el('th', { text: h })))]),
              el('tbody', {}, detail.attempts.slice(0, 25).map((a) => el('tr', {}, [
                el('td', { class: 'xsmall', text: fmtDateTime(a.created_at) }),
                el('td', { text: conceptIdx.get(a.concept_id)?.label || a.concept_id || '—' }),
                el('td', {}, [el('span', { class: `badge ${a.correct ? 'badge--ok' : 'badge--bad'}`, text: a.correct ? '✓' : '✕' })]),
                el('td', { class: 'tabnum', text: String(a.attempt_number) }),
                el('td', { class: 'tabnum', text: String(a.hints_used) }),
              ]))),
            ]),
          ]),
        ]),
      ]),
      el('div', { class: 'card' }, [
        el('h2', { text: 'Mastery por concepto' }),
        el('div', { class: 'bar-list' }, masteryRows.map((m) => el('div', { class: 'bar-list__row' }, [
          el('span', { class: 'bar-list__label', text: m.label }),
          meter(m.value / 100, m.value < 40 ? 'low' : m.value < 70 ? 'mid' : ''),
          el('span', { class: 'bar-list__val', text: fmt(m.value, 0) }),
        ]))),
      ]),
    ]),
  ])]);
  focusMain();
}

/* -------------------------------------------------------------- helpers -- */

function kpi(label, value) {
  return el('div', { class: 'stat' }, [
    el('div', { class: 'stat__label', text: label }),
    el('div', { class: 'stat__value', text: value }),
  ]);
}

function labeled(label, input) {
  return el('label', { class: 'field' }, [el('span', { class: 'field__label', text: label }), input]);
}

function checkbox(checked) {
  return el('input', { type: 'checkbox', checked: checked ? true : null });
}

function checkRow(label, input) {
  return el('label', { class: 'check' }, [input, el('span', { class: 'check__text', text: label })]);
}

function toggleField(label, value, onChange) {
  const input = el('input', { type: 'checkbox', checked: value ? true : null, onChange: (e) => onChange(e.target.checked) });
  return el('label', { class: 'check' }, [input, el('span', { class: 'check__text', text: label })]);
}

function numberField(label, value, min, max, onChange) {
  const input = el('input', {
    class: 'input', type: 'number', min: String(min), max: String(max), value: String(value),
    onChange: (e) => onChange(Number(e.target.value)),
  });
  return labeled(label, input);
}

function toLocal(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

const slugify = (s) => String(s).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  .replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
