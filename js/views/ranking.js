/**
 * Vista: RANKINGS
 * ---------------------------------------------------------------------------
 * Dos clasificaciones y un reconocimiento:
 *   · SEMANAL — por reto. Podio + tabla.
 *   · TEMPORADA — suma de los mejores N retos (protege de una semana mala).
 *   · MOST IMPROVED — reconocimiento separado, para que no gane siempre quien
 *     partía mejor.
 *
 * Solo se muestra el ALIAS. Nunca nombre, apellidos ni correo. El tono evita
 * la humillación: no hay «último de la clase», y la fila propia se resalta.
 */

import { el, replace, focusMain } from '../dom.js';
import { t } from '../i18n.js';
import { db } from '../data/store.js';
import { fmt, fmtInt, fmtDurationLong } from '../utils.js';
import { challengeState } from '../challenges.js';

export default async function rankingView({ main, query }) {
  const enrolments = await db.listMyEnrolments();
  const myClass = enrolments[0];

  if (!myClass) {
    replace(main, [el('div', { class: 'wrap' }, [el('div', { class: 'card' }, [
      el('h1', { text: t('ranking.title') }),
      el('p', { class: 'muted', text: t('student.noClassText') }),
      el('a', { class: 'btn btn--primary', href: '#/student', text: t('common.back') }),
    ])])]);
    return;
  }

  if (!myClass.ranking_enabled) {
    replace(main, [el('div', { class: 'wrap' }, [el('div', { class: 'card' }, [
      el('h1', { text: t('ranking.title') }),
      el('p', { class: 'muted', text: t('ranking.disabled') }),
      el('a', { class: 'btn', href: '#/student', text: t('common.back') }),
    ])])]);
    return;
  }

  const challenges = (await db.listMyChallenges()).filter((c) => c.show_ranking !== false);

  // Preferencia: el reto que pida la URL → el reto abierto → el más reciente.
  let selectedId = query.get('challenge')
    || challenges.find((c) => challengeState(c) === 'open')?.id
    || challenges[0]?.id;

  let weekly = selectedId ? await db.weeklyRanking(selectedId) : [];

  // Si el reto abierto aún no tiene resultados, se muestra el último que sí
  // los tenga: una tabla vacía no informa de nada.
  if (!weekly.length && !query.get('challenge')) {
    for (const c of challenges) {
      const rows = await db.weeklyRanking(c.id);
      if (rows.length) { selectedId = c.id; weekly = rows; break; }
    }
  }

  const [seasonal, improved] = await Promise.all([
    db.seasonalRanking(myClass.id),
    db.mostImproved(myClass.id),
  ]);

  const selector = el('select', {
    class: 'select', 'aria-label': 'Reto',
    onChange: (e) => { location.hash = `#/ranking?challenge=${e.target.value}`; },
  }, challenges.map((c) => el('option', {
    value: c.id, selected: c.id === selectedId,
    text: `${c.number ? `#${c.number} · ` : ''}${c.title}`,
  })));

  replace(main, [el('div', { class: 'wrap' }, [
    el('div', { class: 'page-head' }, [
      el('div', {}, [
        el('h1', { text: t('ranking.title') }),
        el('p', { class: 'page-head__sub', text: `${myClass.class_name} · ${t('ranking.aliasOnly')}` }),
      ]),
      el('a', { class: 'btn btn--sm', href: '#/student', text: t('common.back') }),
    ]),

    el('div', { class: 'grid grid--sidebar' }, [
      el('div', { class: 'stack-lg' }, [
        el('div', { class: 'card' }, [
          el('div', { class: 'row row--between' }, [
            el('h2', { class: 'mb-0', text: t('ranking.weekly') }),
            challenges.length ? el('div', { style: { minWidth: '14rem' } }, [selector]) : null,
          ]),
          weekly.length ? el('div', {}, [
            podium(weekly),
            table(weekly, [
              { key: 'position', label: t('ranking.position'), fmt: (r) => String(r.position) },
              { key: 'alias', label: t('ranking.alias'), fmt: (r) => r.alias },
              { key: 'points', label: t('ranking.points'), fmt: (r) => fmtInt(r.challenge_points) },
              { key: 'time', label: t('challenge.activeTime'), fmt: (r) => fmtDurationLong(r.active_time_seconds) },
              { key: 'errors', label: t('challenge.errors'), fmt: (r) => String(r.errors) },
              { key: 'perfect', label: 'Perfect', fmt: (r) => (r.perfect_run ? '💠' : '') },
            ]),
          ]) : el('p', { class: 'muted', text: t('ranking.empty') }),
        ]),

        el('div', { class: 'card' }, [
          el('h2', { text: t('ranking.seasonal') }),
          el('p', { class: 'small muted', text: t('ranking.bestN', { n: myClass.season_best_n || 10 }) }),
          seasonal.length ? table(seasonal, [
            { key: 'position', label: t('ranking.position'), fmt: (r) => String(r.position) },
            { key: 'alias', label: t('ranking.alias'), fmt: (r) => r.alias },
            { key: 'total', label: t('ranking.points'), fmt: (r) => fmtInt(r.total_points) },
            { key: 'counted', label: 'Retos contados', fmt: (r) => `${r.challenges_counted} de ${r.challenges_done}` },
            { key: 'avg', label: 'Media', fmt: (r) => fmtInt(r.avg_points) },
          ]) : el('p', { class: 'muted', text: t('ranking.empty') }),
        ]),
      ]),

      el('div', { class: 'stack-lg' }, [
        el('div', { class: 'card' }, [
          el('h2', { text: t('ranking.mostImproved') }),
          improved.length
            ? el('ul', { class: 'list' }, improved.slice(0, 5).map((r, i) => el('li', {}, [
              el('div', { class: 'itemrow' }, [
                el('span', { 'aria-hidden': 'true', text: i === 0 ? '📈' : '·' }),
                el('div', { class: 'itemrow__main' }, [
                  el('div', { class: 'itemrow__title', text: r.alias }),
                  el('div', { class: 'itemrow__meta', text: `+${fmtInt(r.improvement)} sobre su media de ${fmtInt(r.previous_average)}` }),
                ]),
              ]),
            ])))
            : el('p', { class: 'small muted', text: 'Aún no hay suficientes retos para comparar.' }),
          el('p', { class: 'xsmall muted', style: { marginTop: 'var(--s-2)' }, text: 'Este reconocimiento es independiente del ranking: premia la mejora, no el nivel de partida.' }),
        ]),

        el('div', { class: 'card' }, [
          el('h2', { text: 'Cómo funciona' }),
          el('ul', { class: 'small' }, [
            el('li', { text: 'La puntuación de un reto va de 0 a 1.000 Challenge Points: la exactitud pesa 700 y el tiempo solo 100.' }),
            el('li', { text: `La temporada suma tus ${myClass.season_best_n || 10} mejores retos, así que una semana mala no te hunde.` }),
            el('li', { text: 'Los XP miden tu progreso general y NO se usan para el ranking.' }),
            el('li', { text: 'Solo se muestra el alias. Tu profesor sí puede ver quién eres.' }),
            el('li', { text: 'Nada de esto es una calificación académica.' }),
          ]),
        ]),
      ]),
    ]),
  ])]);
  focusMain();
}

/* -------------------------------------------------------------- helpers -- */

function podium(rows) {
  const top = rows.slice(0, 3);
  if (top.length < 3) return null;
  const medals = ['🥇', '🥈', '🥉'];
  return el('div', { class: 'podium', role: 'list', 'aria-label': 'Podio' }, top.map((r, i) => el('div', {
    class: `podium__slot podium__slot--${i + 1}`, role: 'listitem',
  }, [
    el('div', { class: 'podium__medal', 'aria-hidden': 'true', text: medals[i] }),
    el('div', { class: 'podium__alias', text: r.alias }),
    el('div', { class: 'podium__points', text: `${fmtInt(r.challenge_points)}` }),
    r.isMe ? el('span', { class: 'badge badge--brand', text: t('ranking.you') }) : null,
  ])));
}

function table(rows, cols) {
  return el('div', { class: 'table-wrap', style: { marginTop: 'var(--s-4)' } }, [
    el('table', {}, [
      el('thead', {}, [el('tr', {}, cols.map((c) => el('th', { text: c.label })))]),
      el('tbody', {}, rows.map((r) => el('tr', { class: r.isMe ? 'rank-me' : '' },
        cols.map((c) => el('td', { class: c.key === 'position' ? 'tabnum strong' : 'tabnum' }, [
          c.fmt(r),
          c.key === 'alias' && r.isMe ? el('span', { class: 'badge badge--brand', style: { marginLeft: '.4rem' }, text: t('ranking.you') }) : null,
        ])))),
      ),
    ]),
  ]);
}

void fmt;
