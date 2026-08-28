/**
 * Vistas: LABORATORIO (índice y anfitrión de minijuegos)
 * ---------------------------------------------------------------------------
 * El laboratorio es zona libre: se puede jugar sin puntuación y sin presión.
 * Los resultados se registran igualmente para los logros («Testigo del TCL»,
 * «Cirujano de gráficos»…), pero no penaliza nada.
 */

import { el, replace, focusMain, toast } from '../dom.js';
import { t } from '../i18n.js';
import { db } from '../data/store.js';
import { GAMES, getWorld, getConcept } from '../content.js';
import { mountGame, gameMeta } from '../../games/index.js';

export async function labIndexView({ main }) {
  const best = await db.getGameBest().catch(() => new Map());
  const rows = await Promise.all(GAMES.map(async (g) => ({
    ...g, world: await getWorld(g.world),
  })));

  replace(main, [el('div', { class: 'wrap' }, [
    el('div', { class: 'page-head' }, [
      el('div', {}, [
        el('h1', { text: t('labs.title') }),
        el('p', { class: 'page-head__sub', text: t('labs.subtitle') }),
      ]),
      el('a', { class: 'btn btn--sm', href: '#/student', text: t('common.back') }),
    ]),

    el('div', { class: 'modes' }, rows.map((g) => el('a', {
      class: 'mode', href: `#/lab/${g.id}`, style: { '--accent': 'var(--brand-2)' },
    }, [
      el('span', { class: 'mode__icon', 'aria-hidden': 'true', text: g.icon }),
      el('span', { class: 'mode__title', text: t(`games.${g.id}`) }),
      el('span', { class: 'mode__desc', text: g.world ? `Mundo ${g.world.num}: ${g.world.title}` : '' }),
      best.get(g.id) ? el('span', { class: 'badge mode__flag', text: `Mejor: ${best.get(g.id)}` }) : null,
    ]))),
  ])]);
  focusMain();
}

export async function labView({ main, params }) {
  const id = params.id;
  if (!GAMES.some((g) => g.id === id)) {
    replace(main, [el('div', { class: 'wrap' }, [el('h1', { text: t('errors.pageNotFound') })])]);
    return;
  }

  let meta = null;
  try { meta = await gameMeta(id); } catch { /* se muestra igualmente */ }
  const concepts = await Promise.all((meta?.concepts || []).map((c) => getConcept(c)));

  const host = el('div');
  const notes = el('div', { class: 'card', style: { marginTop: 'var(--s-5)' } }, [
    el('h2', { text: t('labs.observation') }),
    el('p', { class: 'small', text: meta?.observation || '' }),
    concepts.length ? el('p', { class: 'xsmall muted' }, [
      el('b', { text: t('worlds.concepts') + ': ' }),
      concepts.map((c) => c.label).join(' · '),
    ]) : null,
  ]);

  replace(main, [el('div', { class: 'wrap' }, [
    el('div', { class: 'page-head' }, [
      el('div', {}, [
        el('h1', { text: t(`games.${id}`) }),
        el('p', { class: 'page-head__sub', text: 'Laboratorio libre: experimenta sin puntuación.' }),
      ]),
      el('div', { class: 'row' }, [
        el('a', { class: 'btn btn--sm', href: '#/lab', text: t('common.back') }),
      ]),
    ]),
    el('div', { class: 'card' }, [host]),
    notes,
  ])]);
  focusMain();

  let ctrl = null;
  try {
    ctrl = await mountGame(id, host, {}, {
      onScore: (points) => { db.recordGameScore(id, points).catch(() => {}); },
      onFinish: async (res) => {
        if (res?.score !== null && res?.score !== undefined && !res.exploratory) {
          await db.recordAttempt({
            activityId: `game:${id}`, world: GAMES.find((g) => g.id === id)?.world,
            concepts: meta?.concepts || [], type: 'sim', difficulty: 2,
            score: res.score, correct: res.score >= 0.7, attempts: 1, hintsUsed: 0,
            timeSeconds: 0, xpBase: 25, source: 'game',
          }).catch(() => {});
          const newly = await db.syncAchievements().catch(() => []);
          newly.forEach((a) => toast(`${a.icon} ${a.name}`, 'xp'));
        }
      },
    });
  } catch (err) {
    console.error('[lab] no se pudo cargar el minijuego', err);
    replace(host, [el('div', { class: 'callout callout--bad' }, [
      el('span', { class: 'callout__title', text: t('app.error') }),
      'No se ha podido cargar este laboratorio. Recarga la página o vuelve al índice.',
    ])]);
  }

  return () => { try { ctrl?.destroy?.(); } catch { /* ignorado */ } };
}
