/**
 * Vista: MI CUENTA
 * ---------------------------------------------------------------------------
 * El estudiante puede editar lo que es suyo (alias, grado, identificador) y
 * ver exactamente qué datos guarda la plataforma y quién puede verlos. La
 * transparencia sobre el tratamiento de datos forma parte del producto, no es
 * un anexo legal escondido.
 */

import { el, replace, toast, focusMain } from '../dom.js';
import { t } from '../i18n.js';
import { user, saveProfile } from '../auth.js';
import { db, isDemo } from '../data/store.js';
import { fmtDateTime } from '../utils.js';

const DEGREES = ['medicine', 'nursing', 'physio', 'pharmacy', 'psychology', 'ot', 'nutrition', 'biomedical', 'other'];

export default async function accountView({ main }) {
  const me = user();
  const enrolments = await db.listMyEnrolments();

  const alias = el('input', { class: 'input', id: 'alias', value: me.alias || '' });
  const aliasErr = el('span', { class: 'field__error', hidden: true });
  const first = el('input', { class: 'input', id: 'first', value: me.first_name || '' });
  const last = el('input', { class: 'input', id: 'last', value: me.last_name || '' });
  const degree = el('select', { class: 'select', id: 'degree' }, [
    el('option', { value: '', text: '—' }),
    ...DEGREES.map((d) => el('option', { value: d, selected: me.degree === d, text: t(`degrees.${d}`) })),
  ]);
  const uid = el('input', { class: 'input', id: 'uid', value: me.university_id || '' });

  replace(main, [el('div', { class: 'wrap wrap--mid' }, [
    el('div', { class: 'page-head' }, [
      el('div', {}, [el('h1', { text: t('nav.account') })]),
      el('a', { class: 'btn btn--sm', href: me.role === 'teacher' ? '#/teacher' : '#/student', text: t('common.back') }),
    ]),

    el('div', { class: 'card stack' }, [
      el('h2', { text: 'Datos académicos' }),
      el('div', { class: 'grid grid--2' }, [
        field(t('auth.firstName'), first), field(t('auth.lastName'), last),
      ]),
      field(t('auth.degree'), degree),
      field(t('auth.universityId'), uid, t('auth.universityIdHint')),
      el('label', { class: 'field', for: 'alias' }, [
        el('span', { class: 'field__label', text: t('auth.alias') }),
        alias,
        el('span', { class: 'field__hint', text: t('auth.aliasHint') }),
        aliasErr,
      ]),
      el('button', {
        class: 'btn btn--primary', type: 'button', text: t('common.save'),
        onClick: async () => {
          const res = await saveProfile({
            first_name: first.value.trim(), last_name: last.value.trim(),
            degree: degree.value || null, university_id: uid.value.trim() || null,
            alias: alias.value.trim(),
          });
          if (!res.ok) {
            aliasErr.hidden = false;
            aliasErr.textContent = res.errors.alias || t('auth.errors.generic');
            return;
          }
          aliasErr.hidden = true;
          toast(t('teacher.saved'), 'ok');
        },
      }),
    ]),

    el('div', { class: 'card stack', style: { marginTop: 'var(--s-5)' } }, [
      el('h2', { text: 'Mis clases' }),
      enrolments.length
        ? el('ul', { class: 'list' }, enrolments.map((c) => el('li', {}, [
          el('div', { class: 'itemrow' }, [
            el('div', { class: 'itemrow__main' }, [
              el('div', { class: 'itemrow__title', text: c.class_name }),
              el('div', { class: 'itemrow__meta', text: `${c.academic_year} · rankings ${c.ranking_enabled ? 'activados' : 'desactivados'}` }),
            ]),
          ]),
        ])))
        : el('p', { class: 'muted', text: t('student.noClass') }),
    ]),

    el('div', { class: 'card stack', style: { marginTop: 'var(--s-5)' } }, [
      el('h2', { text: 'Qué datos guarda STATLAB' }),
      el('div', { class: 'table-wrap' }, [
        el('table', {}, [
          el('thead', {}, [el('tr', {}, ['Dato', 'Para qué', 'Quién lo ve'].map((h) => el('th', { text: h })))]),
          el('tbody', {}, [
            ['Nombre y apellidos', 'Identificarte ante tu profesorado', 'Tú y el profesorado de tus clases'],
            ['Correo electrónico', 'Acceso y recuperación de contraseña', 'Tú y el profesorado de tus clases'],
            ['Alias', 'Aparecer en los rankings sin exponer tu identidad', 'Toda tu clase'],
            ['Grado', 'Adaptar ejemplos y agregados docentes', 'Tú y tu profesorado'],
            ['Identificador universitario (opcional)', 'Cruce con actas si tu profesorado lo necesita', 'Tú y tu profesorado'],
            ['Respuestas, tiempos y pistas', 'Calcular tu progreso y detectar dificultades', 'Tú y tu profesorado'],
            ['XP, nivel y mastery', 'Indicadores formativos de progreso', 'Tú y tu profesorado'],
          ].map((r) => el('tr', {}, r.map((cell, i) => el('td', { class: i === 0 ? 'strong' : '', text: cell })))),
          ),
        ]),
      ]),
      el('div', { class: 'callout' }, [
        el('span', { class: 'callout__title', text: 'Lo que NO guardamos' }),
        'Ningún dato de salud tuyo, ninguna información sensible y nada que no sea necesario para el uso docente. '
        + 'Los rankings nunca muestran nombre ni correo.',
      ]),
      el('p', { class: 'xsmall muted', text: `Cuenta creada el ${fmtDateTime(me.created_at)}.` }),
      isDemo() ? el('div', { class: 'callout callout--warn' }, [
        el('span', { class: 'callout__title', text: t('demo.banner') }),
        'En modo demo todos los datos son ficticios y viven solo en este navegador.',
      ]) : null,
    ]),
  ])]);
  focusMain();
}

function field(label, input, hint) {
  return el('label', { class: 'field', for: input.id }, [
    el('span', { class: 'field__label', text: label }),
    input,
    hint ? el('span', { class: 'field__hint', text: hint }) : null,
  ]);
}
