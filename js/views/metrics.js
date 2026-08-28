/**
 * Vista: CÓMO SE MIDE
 * ---------------------------------------------------------------------------
 * Reúne en una sola pantalla, a ancho completo, las tres métricas de STATLAB:
 * mastery, Challenge Points y XP. Antes vivían apretadas en la columna lateral
 * de «Mi progreso», donde una fracción con sumatorios no cabe.
 *
 * La explicación NO se escribe aquí: se importa de los módulos que implementan
 * cada fórmula (`mastery.js`, `scoring.js`). Así no puede desincronizarse del
 * cálculo real, que es justo lo que exige el requisito de «nada de algoritmos
 * opacos».
 */

import { el, replace, focusMain } from '../dom.js';
import { t } from '../i18n.js';
import { MASTERY_DOC } from '../mastery.js';
import { SCORING_DOC } from '../scoring.js';

const SECTIONS = [
  {
    id: 'mastery',
    icon: '🎯',
    title: 'Mastery por concepto',
    lead: 'Cuánta evidencia hay de que dominas un concepto ahora mismo.',
    html: () => MASTERY_DOC.html,
  },
  {
    id: 'points',
    icon: '🏆',
    title: 'Challenge Points y XP',
    lead: 'Cómo se puntúa el reto semanal y cómo se sube de nivel.',
    html: () => SCORING_DOC.html,
  },
];

export default async function metricsView({ main }) {
  const hash = (location.hash.split('#')[2] || '').trim();

  replace(main, [el('div', { class: 'wrap wrap--mid' }, [
    el('div', { class: 'page-head' }, [
      el('div', {}, [
        el('h1', { text: t('metrics.title') }),
        el('p', { class: 'page-head__sub', text: t('metrics.subtitle') }),
      ]),
      el('a', { class: 'btn btn--sm', href: '#/student', text: t('common.back') }),
    ]),

    // Índice: en una pantalla larga conviene poder saltar.
    el('nav', { class: 'row', 'aria-label': 'Secciones', style: { marginBottom: 'var(--s-5)', flexWrap: 'wrap' } },
      SECTIONS.map((s) => el('a', {
        class: 'btn btn--sm', href: `#/metrics#${s.id}`,
        onClick: (ev) => { ev.preventDefault(); document.getElementById(s.id)?.scrollIntoView({ behavior: 'smooth', block: 'start' }); },
      }, [el('span', { 'aria-hidden': 'true', text: `${s.icon} ` }), s.title]))),

    ...SECTIONS.map((s) => el('section', { class: 'card', id: s.id, style: { marginBottom: 'var(--s-5)' } }, [
      el('h2', {}, [el('span', { 'aria-hidden': 'true', text: `${s.icon} ` }), s.title]),
      el('p', { class: 'small muted', text: s.lead }),
      el('div', { class: 'mathdoc', html: s.html() }),
    ])),

    el('p', { class: 'xsmall muted', text: t('metrics.sourceNote') }),
  ])]);

  // Cualquier tabla puede quedarse ancha en un móvil. En lugar de recordar
  // envolverlas a mano una por una en el texto, se envuelven todas aquí: así
  // desplazan dentro de su caja y nunca empujan la página.
  main.querySelectorAll('.mathdoc table').forEach((table) => {
    if (table.parentElement?.classList.contains('mathdoc__scroll')) return;
    const box = el('div', { class: 'mathdoc__scroll' });
    table.parentElement.insertBefore(box, table);
    box.appendChild(table);
  });

  focusMain();
  if (hash) document.getElementById(hash)?.scrollIntoView({ block: 'start' });
}
