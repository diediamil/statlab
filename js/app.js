/**
 * STATLAB — arranque de la aplicación
 * ---------------------------------------------------------------------------
 * Orden de inicio:
 *   1. configuración (¿hay Supabase o vamos en modo demo?)
 *   2. idioma
 *   3. capa de datos + sesión
 *   4. barra superior y rutas
 *
 * El router es por hash, así que la app funciona en cualquier hosting
 * estático sin reglas de reescritura.
 */

import { getConfig, config } from './config.js';
import { detectLocale, setLocale, t, applyStaticTranslations, AVAILABLE_LOCALES, locale } from './i18n.js';
import { initStore, isDemo, db } from './data/store.js';
import { initAuth, user, isTeacher, isAuthenticated, logout, onUserChange, guard } from './auth.js';
import { route, setNotFound, setBeforeEach, startRouter, navigate, currentRoute } from './router.js';
import { el, replace, clear, toast, focusMain } from './dom.js';
import { fmtInt } from './utils.js';
import { levelFromXp } from './progress.js';

/* ------------------------------------------------------------- arranque -- */

async function boot() {
  const main = document.getElementById('main');
  replace(main, [el('div', { class: 'loading' }, [el('span', { class: 'spinner' }), 'Cargando STATLAB Loyola…'])]);

  const cfg = await getConfig();
  await setLocale(detectLocale(cfg.DEFAULT_LOCALE));
  applyStaticTranslations();

  initTheme();

  try {
    await initStore();
    await initAuth();
  } catch (err) {
    console.error('[app] no se pudo iniciar la capa de datos', err);
    replace(main, [el('div', { class: 'wrap wrap--narrow' }, [
      el('div', { class: 'card' }, [
        el('h1', { text: t('app.error') }),
        el('p', { text: 'No se ha podido conectar con el backend. Revisa config.js o usa el modo demo.' }),
        el('pre', { class: 'small', text: String(err.message || err) }),
        el('a', { class: 'btn btn--primary', href: '?demo=1#/student', text: 'Abrir en modo demo' }),
      ]),
    ])]);
    return;
  }

  document.getElementById('topbar').hidden = false;
  document.getElementById('footer').hidden = false;
  renderChrome();
  onUserChange(() => renderChrome());

  registerRoutes(main);
  await startRouter();
}

/* ---------------------------------------------------------------- tema --- */

function initTheme() {
  const KEY = 'statlab.theme';
  let saved = null;
  try { saved = localStorage.getItem(KEY); } catch { /* modo privado */ }
  if (saved) document.documentElement.dataset.theme = saved;

  const btn = document.getElementById('themeToggle');
  const icon = document.getElementById('themeIcon');
  const paint = () => {
    const explicit = document.documentElement.dataset.theme;
    const dark = explicit === 'dark'
      || (!explicit && window.matchMedia('(prefers-color-scheme: dark)').matches);
    if (icon) icon.textContent = dark ? '☾' : '☀';
    btn?.setAttribute('aria-label', t('a11y.theme'));
  };
  btn?.addEventListener('click', () => {
    const explicit = document.documentElement.dataset.theme;
    const dark = explicit === 'dark'
      || (!explicit && window.matchMedia('(prefers-color-scheme: dark)').matches);
    const next = dark ? 'light' : 'dark';
    document.documentElement.dataset.theme = next;
    try { localStorage.setItem(KEY, next); } catch { /* ignorado */ }
    paint();
  });
  paint();
}

/* ------------------------------------------------- barra superior y HUD -- */

async function renderChrome() {
  const nav = document.getElementById('mainNav');
  const menu = document.getElementById('userMenu');
  const hud = document.getElementById('hud');
  const banner = document.getElementById('demoBanner');
  const me = user();

  /* --- navegación --- */
  const links = !isAuthenticated() ? [
    ['#/login', t('nav.login')],
    ['#/register', t('nav.register')],
  ] : isTeacher() ? [
    ['#/teacher', t('nav.teacher')],
    ['#/teacher?tab=challenge', t('challenge.title')],
    ['#/teacher?tab=rankings', t('nav.ranking')],
    ['#/lab', t('nav.lab')],
  ] : [
    ['#/student', t('nav.home')],
    ['#/campaign', t('nav.campaign')],
    ['#/challenge', t('nav.challenge')],
    ['#/lab', t('nav.lab')],
    ['#/ranking', t('nav.ranking')],
    ['#/progress', t('nav.progress')],
  ];
  const here = '#' + currentRoute();
  replace(nav, links.map(([href, label]) => el('a', {
    class: 'navlink', href, text: label,
    'aria-current': here.startsWith(href.split('?')[0]) && href !== '#/' ? 'page' : null,
  })));

  /* --- HUD del alumno --- */
  if (isAuthenticated() && !isTeacher()) {
    try {
      const pr = await db.getProgress();
      const lvl = levelFromXp(pr.xp || 0);
      hud.hidden = false;
      replace(hud, [
        el('span', { class: 'hud__item hud__lvl', title: t('student.level'), text: `N${lvl.level}` }),
        el('span', { class: 'hud__item', title: 'XP' }, [el('span', { 'aria-hidden': 'true', text: '⬢ ' }), fmtInt(pr.xp || 0)]),
        pr.streak_days ? el('span', { class: 'hud__item', title: t('student.streak') }, [el('span', { 'aria-hidden': 'true', text: '🔥 ' }), String(pr.streak_days)]) : null,
      ]);
    } catch { hud.hidden = true; }
  } else {
    hud.hidden = true;
  }

  /* --- menú de usuario --- */
  if (me) {
    menu.hidden = false;
    const pop = el('div', { class: 'usermenu__pop', hidden: true, role: 'menu' }, [
      el('div', { class: 'usermenu__head' }, [
        el('div', { class: 'strong', text: `${me.first_name} ${me.last_name}`.trim() || me.email }),
        el('div', { class: 'xsmall muted', text: me.email }),
        el('div', { class: 'xsmall muted' }, [el('span', { class: 'badge badge--brand', text: me.alias || '—' })]),
      ]),
      el('a', { href: '#/account', role: 'menuitem', text: t('nav.account') }),
      isTeacher() ? el('a', { href: '#/teacher', role: 'menuitem', text: t('nav.teacher') }) : el('a', { href: '#/progress', role: 'menuitem', text: t('nav.progress') }),
      localeSwitcher(),
      el('button', {
        type: 'button', role: 'menuitem', text: t('nav.logout'),
        onClick: async () => { await logout(); toast(t('auth.signedOut')); navigate('/'); },
      }),
    ]);
    const btn = el('button', {
      class: 'usermenu__btn', type: 'button', 'aria-haspopup': 'true', 'aria-expanded': 'false',
      onClick: () => {
        pop.hidden = !pop.hidden;
        btn.setAttribute('aria-expanded', String(!pop.hidden));
      },
    }, [
      el('span', { class: 'avatar', 'aria-hidden': 'true', text: (me.first_name?.[0] || '?') + (me.last_name?.[0] || '') }),
      el('span', { class: 'small nowrap', text: me.alias || me.first_name || '' }),
    ]);
    replace(menu, [btn, pop]);
    document.addEventListener('click', (e) => {
      if (!menu.contains(e.target)) { pop.hidden = true; btn.setAttribute('aria-expanded', 'false'); }
    });
  } else {
    menu.hidden = true;
    clear(menu);
  }

  /* --- banner de demo --- */
  if (isDemo()) {
    banner.hidden = false;
    const role = await db.demoRole();
    replace(banner, [
      el('span', { text: t('demo.banner') }),
      el('button', {
        class: 'btn btn--sm', type: 'button',
        text: role === 'teacher' ? t('demo.switchToStudent') : t('demo.switchToTeacher'),
        onClick: async () => {
          await db.setDemoRole(role === 'teacher' ? 'student' : 'teacher');
          navigate(role === 'teacher' ? '/student' : '/teacher');
          location.reload();
        },
      }),
      el('button', {
        class: 'btn btn--sm', type: 'button', text: t('demo.reset'),
        onClick: async () => { await db.resetDemo(); toast(t('demo.resetDone'), 'ok'); location.reload(); },
      }),
      config().demoBecauseUnconfigured
        ? el('span', { class: 'xsmall', style: { marginLeft: 'var(--s-3)' }, text: t('demo.noBackend') })
        : null,
    ]);
  } else {
    banner.hidden = true;
  }
}

function localeSwitcher() {
  const sel = el('select', {
    class: 'select', style: { margin: '.35rem 0' }, 'aria-label': 'Idioma',
    onChange: async (e) => { await setLocale(e.target.value); location.reload(); },
  }, AVAILABLE_LOCALES.map((l) => el('option', { value: l.code, selected: l.code === locale(), text: l.label })));
  return sel;
}

/* -------------------------------------------------------------- rutas --- */

function registerRoutes(main) {
  const ctx = (c) => ({ ...c, main });

  const lazy = (loader, key = 'default') => async (c) => {
    const mod = await loader();
    const fn = mod[key] || mod.default;
    return fn(ctx(c));
  };

  route('/', lazy(() => import('./views/landing.js')));
  route('/login', lazy(() => import('./views/auth.js'), 'loginView'));
  route('/register', lazy(() => import('./views/auth.js'), 'registerView'));
  route('/recover', lazy(() => import('./views/auth.js'), 'recoverView'));

  route('/student', lazy(() => import('./views/student.js')), { requires: 'auth' });
  route('/account', lazy(() => import('./views/account.js')), { requires: 'auth' });

  route('/campaign', lazy(() => import('./views/campaign.js'), 'campaignView'), { requires: 'auth' });
  route('/world/:id', lazy(() => import('./views/campaign.js'), 'worldView'), { requires: 'auth' });
  route('/play/world/:id', lazy(() => import('./views/campaign.js'), 'playWorldView'), { requires: 'auth' });
  route('/quick', lazy(() => import('./views/campaign.js'), 'quickView'), { requires: 'auth' });
  route('/mistakes', lazy(() => import('./views/campaign.js'), 'mistakesView'), { requires: 'auth' });
  route('/assignments', lazy(() => import('./views/campaign.js'), 'assignmentsView'), { requires: 'auth' });
  route('/assignment/:id', lazy(() => import('./views/campaign.js'), 'assignmentPlayView'), { requires: 'auth' });

  route('/lab', lazy(() => import('./views/lab.js'), 'labIndexView'), { requires: 'auth' });
  route('/lab/:id', lazy(() => import('./views/lab.js'), 'labView'), { requires: 'auth' });

  route('/challenge', lazy(() => import('./views/challenge.js'), 'challengeHubView'), { requires: 'auth' });
  route('/challenge/:id', lazy(() => import('./views/challenge.js'), 'challengeRunView'), { requires: 'auth' });
  route('/challenge/:id/review', lazy(() => import('./views/challenge.js'), 'challengeReviewView'), { requires: 'auth' });

  route('/ranking', lazy(() => import('./views/ranking.js')), { requires: 'auth' });
  route('/progress', lazy(() => import('./views/progress.js')), { requires: 'auth' });

  route('/teacher', lazy(() => import('./views/teacher.js')), { requires: 'teacher' });
  route('/teacher/student/:id', lazy(() => import('./views/teacher.js'), 'teacherStudentView'), { requires: 'teacher' });

  setBeforeEach(async (c) => {
    const redirect = guard(c.route.requires);
    if (redirect) return redirect;
    // Redirección amable: un profesor que abre la raíz va a su panel.
    if (c.path === '/' && isAuthenticated()) return isTeacher() ? '/teacher' : '/student';
    renderChrome();
    return true;
  });

  setNotFound(({ path, error }) => {
    console.warn('[router] ruta no encontrada:', path, error || '');
    replace(main, [el('div', { class: 'wrap wrap--narrow' }, [
      el('div', { class: 'card' }, [
        el('h1', { text: error ? t('app.error') : t('errors.pageNotFound') }),
        el('p', { text: error ? String(error.message || error) : t('errors.pageNotFoundText') }),
        el('a', { class: 'btn btn--primary', href: isAuthenticated() ? '#/student' : '#/', text: t('common.back') }),
      ]),
    ])]);
    focusMain();
  });
}

/* --------------------------------------------------- errores globales --- */

window.addEventListener('unhandledrejection', (e) => {
  console.error('[statlab] promesa rechazada:', e.reason);
});

boot();
