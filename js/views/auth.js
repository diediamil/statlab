/**
 * Vistas de autenticación: iniciar sesión, crear cuenta y recuperar contraseña.
 *
 * Se piden SOLO los datos académicamente necesarios (nombre, apellidos,
 * correo, contraseña, grado y alias), y el identificador universitario es
 * opcional. El formulario explica por qué se pide cada cosa: la minimización
 * de datos también se comunica, no solo se aplica.
 */

import { el, replace, toast } from '../dom.js';
import { t } from '../i18n.js';
import { navigate } from '../router.js';
import { login, register, requestPasswordReset, isAuthenticated } from '../auth.js';
import { isDemo } from '../data/store.js';

const DEGREES = ['medicine', 'nursing', 'physio', 'pharmacy', 'psychology', 'ot', 'nutrition', 'biomedical', 'other'];

/* --------------------------------------------------------------- helpers -- */

function field({ id, label, type = 'text', hint = null, required = true, autocomplete, options = null, value = '' }) {
  const errorNode = el('span', { class: 'field__error', id: `${id}-error`, hidden: true });
  let input;
  if (options) {
    input = el('select', {
      class: 'select', id, name: id, required,
      'aria-describedby': `${id}-error${hint ? ` ${id}-hint` : ''}`,
    }, [
      el('option', { value: '', text: '— Selecciona —' }),
      ...options.map((o) => el('option', { value: o.value, text: o.label, selected: o.value === value })),
    ]);
  } else {
    input = el('input', {
      class: 'input', id, name: id, type, required, autocomplete, value,
      'aria-describedby': `${id}-error${hint ? ` ${id}-hint` : ''}`,
    });
  }
  const wrap = el('label', { class: 'field', for: id }, [
    el('span', { class: 'field__label' }, [label, required ? null : el('span', { class: 'muted', text: ` (${t('common.optional')})` })]),
    input,
    hint ? el('span', { class: 'field__hint', id: `${id}-hint`, text: hint }) : null,
    errorNode,
  ]);
  wrap.__input = input;
  wrap.__error = errorNode;
  return wrap;
}

function showErrors(fields, errors) {
  for (const [name, node] of Object.entries(fields)) {
    const msg = errors?.[name];
    if (!node.__error) continue;
    node.__error.hidden = !msg;
    node.__error.textContent = msg || '';
    node.__input?.setAttribute('aria-invalid', msg ? 'true' : 'false');
  }
  const first = Object.entries(fields).find(([n]) => errors?.[n]);
  first?.[1].__input?.focus();
}

const hero = () => el('div', { class: 'auth-hero' }, [
  el('div', { class: 'auth-hero__logo' }, [el('b', { text: 'STAT' }), 'LAB']),
  el('p', { class: 'auth-hero__sub', text: t('app.tagline') }),
]);

/* ============================================================== login === */

export async function loginView({ main }) {
  if (isAuthenticated()) { navigate('/student', { replace: true }); return; }

  const fields = {
    email: field({ id: 'email', label: t('auth.email'), type: 'email', autocomplete: 'username' }),
    password: field({ id: 'password', label: t('auth.password'), type: 'password', autocomplete: 'current-password' }),
  };

  const submit = el('button', { class: 'btn btn--primary btn--block btn--lg', type: 'submit', text: t('auth.signIn') });

  const form = el('form', { novalidate: true, onSubmit: async (e) => {
    e.preventDefault();
    submit.disabled = true;
    submit.textContent = t('auth.signingIn');
    const res = await login({
      email: fields.email.__input.value,
      password: fields.password.__input.value,
    });
    submit.disabled = false;
    submit.textContent = t('auth.signIn');
    if (!res.ok) { showErrors(fields, res.errors); return; }
    toast(`Hola, ${res.profile?.first_name || ''}`.trim(), 'ok');
    navigate(res.profile?.role === 'teacher' ? '/teacher' : '/student');
  } }, [
    fields.email, fields.password, submit,
  ]);

  replace(main, [
    el('div', { class: 'auth-shell' }, [
      el('div', { class: 'auth-card' }, [
        hero(),
        el('div', { class: 'card' }, [
          el('h1', { text: t('auth.loginTitle') }),
          isDemo() ? el('div', { class: 'callout callout--warn', style: { marginBottom: 'var(--s-4)' } }, [
            el('span', { class: 'callout__title', text: t('demo.banner') }),
            'Escribe cualquier correo y contraseña. Si el correo contiene «profe» entrarás como profesor.',
          ]) : null,
          form,
          el('p', { class: 'auth-alt' }, [
            el('a', { href: '#/recover', text: t('auth.forgot') }),
          ]),
          el('p', { class: 'auth-alt' }, [
            t('auth.noAccount') + ' ',
            el('a', { href: '#/register', text: t('auth.signUp') }),
          ]),
        ]),
      ]),
    ]),
  ]);
  fields.email.__input.focus();
}

/* =========================================================== registro === */

export async function registerView({ main }) {
  if (isAuthenticated()) { navigate('/student', { replace: true }); return; }

  const fields = {
    firstName: field({ id: 'firstName', label: t('auth.firstName'), autocomplete: 'given-name' }),
    lastName: field({ id: 'lastName', label: t('auth.lastName'), autocomplete: 'family-name' }),
    email: field({ id: 'email', label: t('auth.email'), type: 'email', autocomplete: 'email' }),
    degree: field({
      id: 'degree', label: t('auth.degree'),
      options: DEGREES.map((d) => ({ value: d, label: t(`degrees.${d}`) })),
    }),
    alias: field({ id: 'alias', label: t('auth.alias'), hint: t('auth.aliasHint'), autocomplete: 'nickname' }),
    universityId: field({ id: 'universityId', label: t('auth.universityId'), hint: t('auth.universityIdHint'), required: false }),
    password: field({ id: 'password', label: t('auth.password'), type: 'password', autocomplete: 'new-password', hint: 'Al menos 8 caracteres, con letras y números.' }),
    password2: field({ id: 'password2', label: t('auth.passwordRepeat'), type: 'password', autocomplete: 'new-password' }),
  };

  const privacyBox = el('input', { type: 'checkbox', id: 'privacy' });
  const privacyErr = el('span', { class: 'field__error', hidden: true });
  const privacy = el('div', {}, [
    el('label', { class: 'check', for: 'privacy' }, [
      privacyBox,
      el('span', { class: 'check__text', text: t('auth.acceptPrivacy') }),
    ]),
    privacyErr,
  ]);
  privacy.__input = privacyBox;
  privacy.__error = privacyErr;
  fields.privacy = privacy;

  const submit = el('button', { class: 'btn btn--primary btn--block btn--lg', type: 'submit', text: t('auth.signUp') });

  const form = el('form', { novalidate: true, onSubmit: async (e) => {
    e.preventDefault();
    submit.disabled = true;
    const res = await register({
      firstName: fields.firstName.__input.value,
      lastName: fields.lastName.__input.value,
      email: fields.email.__input.value,
      degree: fields.degree.__input.value,
      alias: fields.alias.__input.value,
      universityId: fields.universityId.__input.value,
      password: fields.password.__input.value,
      password2: fields.password2.__input.value,
      privacy: privacyBox.checked,
    });
    submit.disabled = false;
    if (!res.ok) { showErrors(fields, res.errors); return; }
    if (res.needsEmailConfirmation) {
      replace(main, [el('div', { class: 'auth-shell' }, [
        el('div', { class: 'auth-card card' }, [
          el('h1', { text: t('auth.checkEmail') }),
          el('p', { text: 'Te hemos enviado un enlace de confirmación. Después podrás iniciar sesión.' }),
          el('a', { class: 'btn btn--primary', href: '#/login', text: t('auth.signIn') }),
        ]),
      ])]);
      return;
    }
    toast('Cuenta creada. ¡Bienvenida a STATLAB!', 'ok');
    navigate('/student');
  } }, [
    el('div', { class: 'grid grid--2' }, [fields.firstName, fields.lastName]),
    fields.email,
    fields.degree,
    fields.alias,
    fields.universityId,
    el('div', { class: 'grid grid--2' }, [fields.password, fields.password2]),
    el('div', { class: 'callout', style: { marginBottom: 'var(--s-4)' } }, [
      el('span', { class: 'callout__title', text: 'Qué hacemos con tus datos' }),
      t('auth.privacyNote'),
    ]),
    privacy,
    submit,
  ]);

  replace(main, [
    el('div', { class: 'auth-shell' }, [
      el('div', { class: 'auth-card', style: { width: 'min(34rem, 100%)' } }, [
        hero(),
        el('div', { class: 'card' }, [
          el('h1', { text: t('auth.registerTitle') }),
          form,
          el('p', { class: 'auth-alt' }, [
            t('auth.hasAccount') + ' ',
            el('a', { href: '#/login', text: t('auth.signIn') }),
          ]),
        ]),
      ]),
    ]),
  ]);
  fields.firstName.__input.focus();
}

/* ======================================================== recuperación == */

export async function recoverView({ main }) {
  const fields = { email: field({ id: 'email', label: t('auth.email'), type: 'email', autocomplete: 'email' }) };
  const submit = el('button', { class: 'btn btn--primary btn--block', type: 'submit', text: t('auth.recoverSend') });
  const done = el('div', { class: 'callout callout--ok', hidden: true, text: t('auth.recoverSent') });

  const form = el('form', { novalidate: true, onSubmit: async (e) => {
    e.preventDefault();
    submit.disabled = true;
    const res = await requestPasswordReset(fields.email.__input.value);
    submit.disabled = false;
    if (!res.ok) { showErrors(fields, res.errors); return; }
    done.hidden = false;
    form.hidden = true;
  } }, [fields.email, submit]);

  replace(main, [
    el('div', { class: 'auth-shell' }, [
      el('div', { class: 'auth-card' }, [
        hero(),
        el('div', { class: 'card' }, [
          el('h1', { text: t('auth.recoverTitle') }),
          el('p', { class: 'muted', text: t('auth.recoverText') }),
          form, done,
          el('p', { class: 'auth-alt' }, [el('a', { href: '#/login', text: t('common.back') })]),
        ]),
      ]),
    ]),
  ]);
}
