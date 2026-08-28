/**
 * Vista: portada pública.
 * Explica en tres pantallazos qué es STATLAB y ofrece dos caminos: entrar o
 * probar la demo. Sin registro obligatorio para curiosear.
 */

import { el, replace } from '../dom.js';
import { t } from '../i18n.js';
import { isDemo } from '../data/store.js';
import { isAuthenticated } from '../auth.js';
import { navigate } from '../router.js';

export default async function landing({ main }) {
  if (isAuthenticated()) { navigate('/student', { replace: true }); return; }

  const features = [
    ['🧪', 'experimentTitle', 'experimentText'],
    ['🩺', 'casesTitle', 'casesText'],
    ['🧭', 'decideTitle', 'decideText'],
    ['🏆', 'challengeTitle', 'challengeText'],
    ['📈', 'progressTitle', 'progressText'],
    ['👩‍🏫', 'teacherTitle', 'teacherText'],
  ];

  replace(main, [
    el('section', { class: 'hero' }, [
      el('h1', { class: 'hero__logo' }, [
        el('b', { text: 'STAT' }), 'LAB',
        el('span', { class: 'hero__suffix', text: t('app.suffix') }),
      ]),
      el('img', {
        class: 'hero__institution',
        src: 'assets/loyola_principal.png',
        alt: 'Universidad Loyola Andalucía',
        width: 646, height: 200, loading: 'lazy',
      }),
      el('p', { class: 'hero__sub', text: t('app.tagline') + ' · ' + t('app.taglineEs') }),
      el('p', { class: 'hero__sub', text: t('landing.heroSub') }),
      el('div', { class: 'hero__cta' }, [
        el('a', { class: 'btn btn--primary btn--lg', href: '#/login', text: t('landing.ctaStart') }),
        el('a', { class: 'btn btn--lg', href: '#/register', text: t('landing.ctaRegister') }),
        isDemo() ? null : el('a', {
          class: 'btn btn--outline btn--lg', href: '?demo=1#/student', text: t('landing.ctaDemo'),
        }),
      ]),
      el('p', { class: 'hero__q', text: t('landing.centralQuestion') }),
    ]),

    el('div', { class: 'wrap' }, [
      el('div', { class: 'features' }, features.map(([icon, titleKey, textKey]) => el('div', { class: 'feature' }, [
        el('div', { class: 'feature__icon', 'aria-hidden': 'true', text: icon }),
        el('h3', { text: t(`landing.features.${titleKey}`) }),
        el('p', { text: t(`landing.features.${textKey}`) }),
      ]))),

      el('div', { class: 'card', style: { marginTop: 'var(--s-6)' } }, [
        el('h2', { text: 'Los 15 mundos' }),
        el('p', { class: 'muted small', text: 'De «qué son estos datos» a «decide tú el análisis».' }),
        el('div', { class: 'map-flow' }, [
          'Datos', 'Variables', 'Descriptiva', 'Visualización', 'Probabilidad', 'Distribuciones',
          'Muestreo', 'Estimación', 'Contrastes', 'Elección de pruebas', 'Correlación', 'Regresión',
          'Diagnóstico', 'Tamaños del efecto', 'Proyecto final',
        ].flatMap((n, i, arr) => [
          el('span', { class: 'map-flow__node', text: n }),
          i < arr.length - 1 ? el('span', { class: 'map-flow__arrow', 'aria-hidden': 'true', text: '→' }) : null,
        ])),
      ]),

      el('div', { class: 'callout', style: { marginTop: 'var(--s-5)' } }, [
        el('span', { class: 'callout__title', text: 'Privacidad' }),
        t('auth.privacyNote'),
      ]),
      el('p', { class: 'xsmall muted center', style: { marginTop: 'var(--s-5)' }, text: t('landing.footerNote') }),
    ]),
  ]);
}
