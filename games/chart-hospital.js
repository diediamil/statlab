/**
 * Minijuego: HOSPITAL DE GRÁFICOS
 * ---------------------------------------------------------------------------
 * Cada «paciente» es un gráfico que ingresa con un problema. El alumno hace
 * dos cosas: DIAGNOSTICAR (qué le pasa) y TRATAR (elegir la corrección). Al
 * aplicar el tratamiento se dibuja el gráfico corregido, y ahí está el momento
 * pedagógico: se VE la diferencia que provoca el truco.
 *
 * Los gráficos defectuosos se generan con nuestro propio motor SVG, que
 * permite ejes truncados, sectores para variables continuas y otras
 * manipulaciones que ninguna librería seria deja hacer.
 */

import { el, clear, announce } from '../js/dom.js';
import { rngFor } from '../js/rng.js';
import { renderChart } from '../js/engine/chart-spec.js';

export const meta = {
  id: 'chart-hospital',
  title: 'Hospital de gráficos',
  concepts: ['grafico-adecuado', 'grafico-enganoso', 'histograma', 'boxplot', 'barras', 'sectores'],
  observation: 'Los tres trucos más frecuentes: eje truncado, gráfico inadecuado para el tipo de variable y '
    + 'ausencia de contexto (n, denominador, medida de precisión). Búscalos siempre en ese orden.',
};

/** Diagnósticos posibles. `makeCases()` (al final del archivo) crea los pacientes. */
const DIAGNOSES = [
  { id: 'truncated', label: 'Eje Y truncado: exagera diferencias pequeñas' },
  { id: 'wrongtype', label: 'Tipo de gráfico inadecuado para el tipo de variable' },
  { id: 'nocontext', label: 'Falta contexto: n, denominador o medida de precisión' },
  { id: 'pie3d', label: 'Sectores con demasiadas categorías o efecto 3D' },
  { id: 'barsforcontinuous', label: 'Barras separadas para una variable continua (debería ser histograma)' },
  { id: 'ok', label: 'Ningún problema: el gráfico es adecuado' },
];

export function mount(host, config = {}, api = {}) {
  const rng = rngFor(config.seed || `ch-${Date.now()}`);
  const cases = makeCases(rng);
  const total = Math.min(config.rounds || 6, cases.length);
  const deck = rng.shuffle(cases).slice(0, total);

  let idx = 0, score = 0;
  const wrap = el('div', { class: 'stack' });
  host.appendChild(wrap);

  function render() {
    clear(wrap);
    if (idx >= deck.length) return finish();
    const c = deck[idx];

    let selected = null;
    const chartHost = el('div', {}, [renderChart(c.sick)]);
    const feedback = el('div');
    const applyBtn = el('button', { type: 'button', class: 'btn btn--primary', text: 'Diagnosticar', disabled: true });
    const nextBtn = el('button', { type: 'button', class: 'btn btn--success', text: 'Siguiente paciente', hidden: true });

    const optionsBox = el('div', { class: 'options' });
    const buttons = [];
    for (const d of DIAGNOSES) {
      const btn = el('button', {
        type: 'button', class: 'option', 'aria-pressed': 'false', 'data-id': d.id,
        onClick: () => {
          selected = d.id;
          buttons.forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.id === d.id)));
          applyBtn.disabled = false;
        },
      }, [
        el('span', { class: 'option__key', 'aria-hidden': 'true', text: '□' }),
        el('span', { class: 'option__text', text: d.label }),
      ]);
      buttons.push(btn);
      optionsBox.appendChild(btn);
    }

    wrap.appendChild(el('div', { class: 'row row--between' }, [
      el('h3', { class: 'mb-0', text: `Paciente ${idx + 1} de ${deck.length}` }),
      el('span', { class: 'badge', text: `${score} diagnósticos correctos` }),
    ]));
    wrap.appendChild(el('div', { class: 'panel' }, [
      el('p', { class: 'small strong mb-0', text: 'Motivo de ingreso' }),
      el('p', { class: 'small', text: c.brief }),
    ]));
    wrap.appendChild(chartHost);
    wrap.appendChild(el('h4', { text: '¿Qué le pasa a este gráfico?' }));
    wrap.appendChild(optionsBox);
    wrap.appendChild(feedback);
    wrap.appendChild(el('div', { class: 'row row--end' }, [applyBtn, nextBtn]));

    applyBtn.onclick = () => {
      const ok = selected === c.diagnosis;
      if (ok) score++;
      buttons.forEach((b) => {
        b.disabled = true;
        if (b.dataset.id === c.diagnosis) { b.classList.add('option--correct'); b.querySelector('.option__key').textContent = '☑'; }
        else if (b.dataset.id === selected) { b.classList.add('option--wrong'); b.querySelector('.option__key').textContent = '☒'; }
      });
      applyBtn.hidden = true;
      nextBtn.hidden = false;
      clear(feedback);
      feedback.appendChild(el('div', { class: `feedback feedback--${ok ? 'ok' : 'bad'}` }, [
        el('div', { class: 'feedback__verdict', text: ok ? 'Diagnóstico correcto' : 'Diagnóstico incorrecto' }),
        el('p', { class: 'feedback__what', text: c.why }),
        el('p', { class: 'feedback__concept', text: `Tratamiento aplicado: ${c.treatment}` }),
      ]));
      if (c.cured) {
        feedback.appendChild(el('div', { style: { marginTop: 'var(--s-3)' } }, [
          el('p', { class: 'chart-title', text: 'Gráfico corregido' }),
          renderChart(c.cured),
        ]));
      }
      api.onScore?.(ok ? 1 : 0, { game: meta.id, case: c.id });
      announce(ok ? 'Diagnóstico correcto' : 'Diagnóstico incorrecto');
      nextBtn.focus();
    };

    nextBtn.onclick = () => { idx++; render(); };
  }

  function finish() {
    clear(wrap);
    wrap.appendChild(el('div', { class: 'card stack' }, [
      el('h3', { text: 'Alta hospitalaria' }),
      el('p', { text: `Has diagnosticado correctamente ${score} de ${deck.length} gráficos.` }),
      el('div', { class: 'callout' }, [el('span', { class: 'callout__title', text: 'Qué llevarte' }), meta.observation]),
    ]));
    api.onFinish?.({ game: meta.id, score: deck.length ? score / deck.length : 0, correct: score, total: deck.length, concepts: meta.concepts });
  }

  render();
  return { destroy() { clear(host); } };
}

/* ------------------------------------------------------------ los casos -- */

function makeCases(rng) {
  const bmi = Array.from({ length: 90 }, () => Math.round(rng.normalIn(26, 4.5, 16, 42) * 10) / 10);
  const painA = Array.from({ length: 40 }, () => Math.max(0, Math.min(10, Math.round(rng.normal(5.9, 1.7)))));
  const painB = Array.from({ length: 40 }, () => Math.max(0, Math.min(10, Math.round(rng.normal(4.3, 1.7)))));
  const adher = rng.nice(66, 71, 1);

  return [
    {
      id: 'truncated-bars',
      brief: 'Folleto comercial que compara la adherencia a dos programas. El laboratorio insiste en que la diferencia es enorme.',
      diagnosis: 'truncated',
      sick: {
        kind: 'bar',
        data: [{ label: 'Programa A', value: adher }, { label: 'Programa B', value: adher - 1.4 }],
        opts: { baselineZero: false, yMin: adher - 3, yMax: adher + 1, yLabel: '% de adherencia', title: 'Adherencia comparada' },
      },
      cured: {
        kind: 'bar',
        data: [{ label: 'Programa A', value: adher }, { label: 'Programa B', value: adher - 1.4 }],
        opts: { yMin: 0, yMax: 100, yLabel: '% de adherencia', title: 'Adherencia comparada (eje desde 0)' },
      },
      why: 'El eje empezaba muy por encima de cero, así que una diferencia de 1,4 puntos porcentuales parecía abismal. '
        + 'En un diagrama de barras el mensaje visual es la LONGITUD de la barra: el eje debe empezar en 0.',
      treatment: 'Eje Y desde 0 y añadir intervalos de confianza.',
    },
    {
      id: 'pie-continuous',
      brief: 'Informe de gestión: quiere mostrar cómo se distribuye el índice de masa corporal de 90 pacientes.',
      diagnosis: 'wrongtype',
      sick: {
        kind: 'pie',
        data: [{ label: '<20', value: 9 }, { label: '20–25', value: 28 }, { label: '25–30', value: 34 }, { label: '30–35', value: 15 }, { label: '>35', value: 4 }],
        opts: { title: 'Distribución del IMC' },
      },
      cured: {
        kind: 'histogram',
        values: bmi,
        opts: { xLabel: 'IMC (kg/m²)', yLabel: 'Frecuencia', title: 'Distribución del IMC', markMean: true },
      },
      why: 'El IMC es una variable cuantitativa continua: al trocearla en sectores se pierde la forma de la distribución, '
        + 'la asimetría y los valores extremos. El histograma muestra exactamente lo que interesa.',
      treatment: 'Sustituir el diagrama de sectores por un histograma.',
    },
    {
      id: 'nocontext',
      brief: 'Nota de prensa del servicio: «los casos detectados se han triplicado».',
      diagnosis: 'nocontext',
      sick: {
        kind: 'bar',
        data: [{ label: '2024', value: 5 }, { label: '2025', value: 11 }, { label: '2026', value: 16 }],
        opts: { yLabel: 'Casos detectados', title: 'Casos detectados por año' },
      },
      cured: {
        kind: 'bar',
        data: [{ label: '2024', value: 0.42 }, { label: '2025', value: 0.48 }, { label: '2026', value: 0.51 }],
        opts: { yLabel: 'Casos por 1.000 habitantes', title: 'Incidencia por 1.000 habitantes', valueFmt: (v) => v.toFixed(2).replace('.', ',') },
      },
      why: 'El gráfico está bien dibujado, pero un recuento sin denominador no es interpretable: al convertirlo en tasa '
        + 'por 1.000 habitantes (y sabiendo que se hicieron muchas más pruebas), el «triple» se convierte en un aumento leve. '
        + 'Con cifras tan pequeñas, además, el ruido aleatorio es enorme.',
      treatment: 'Convertir a tasa por población y declarar el número de pruebas realizadas.',
    },
    {
      id: 'bars-for-groups',
      brief: 'Manuscrito: compara el dolor final entre dos grupos de un ensayo con dos barras de medias.',
      diagnosis: 'nocontext',
      sick: {
        kind: 'bar',
        data: [
          { label: 'Ejercicio', value: painA.reduce((s, x) => s + x, 0) / painA.length },
          { label: 'Ejercicio + educación', value: painB.reduce((s, x) => s + x, 0) / painB.length },
        ],
        opts: { yLabel: 'Dolor medio (0–10)', yMax: 10, title: 'Dolor a las 8 semanas', rotateX: true },
      },
      cured: {
        kind: 'boxplot',
        groups: [{ name: 'Ejercicio', values: painA }, { name: 'Ejercicio + educación', values: painB }],
        opts: { yLabel: 'Dolor a las 8 semanas (0–10)', showMean: true, title: 'Dolor a las 8 semanas por grupo' },
      },
      why: 'Dos barras de medias («dynamite plot») esconden la distribución completa: no se ve la dispersión, ni el solapamiento '
        + 'entre grupos, ni los valores atípicos. Con n = 40 por grupo, el diagrama de caja informa mucho más.',
      treatment: 'Sustituir por diagramas de caja (o violín) con los puntos individuales.',
    },
    {
      id: 'pie-many',
      brief: 'Presentación de resultados: distribución de pacientes por servicio de ingreso, con nueve servicios.',
      diagnosis: 'pie3d',
      sick: {
        kind: 'pie',
        data: [
          { label: 'M. Interna', value: 21 }, { label: 'Cirugía', value: 18 }, { label: 'Trauma', value: 15 },
          { label: 'Cardio', value: 12 }, { label: 'Neumo', value: 11 }, { label: 'Digestivo', value: 9 },
          { label: 'Neuro', value: 6 }, { label: 'Uro', value: 5 }, { label: 'Otros', value: 3 },
        ],
        opts: { title: 'Pacientes por servicio' },
      },
      cured: {
        kind: 'bar',
        data: [
          { label: 'M. Interna', value: 21 }, { label: 'Cirugía', value: 18 }, { label: 'Trauma', value: 15 },
          { label: 'Cardio', value: 12 }, { label: 'Neumo', value: 11 }, { label: 'Digestivo', value: 9 },
          { label: 'Neuro', value: 6 }, { label: 'Uro', value: 5 }, { label: 'Otros', value: 3 },
        ],
        opts: { yLabel: '% de pacientes', rotateX: true, title: 'Pacientes por servicio (ordenado)' },
      },
      why: 'Con nueve categorías es imposible comparar ángulos. El ojo humano compara longitudes mucho mejor que ángulos, '
        + 'así que un diagrama de barras ordenado de mayor a menor se lee de un vistazo.',
      treatment: 'Diagrama de barras ordenado, con las categorías menores agrupadas en «Otros».',
    },
    {
      id: 'correct-one',
      brief: 'Manuscrito: distribución del tiempo de espera en urgencias, 300 pacientes.',
      diagnosis: 'ok',
      sick: {
        kind: 'histogram',
        values: Array.from({ length: 300 }, () => Math.round(5 + rng.exponential(1 / 38))),
        opts: { xLabel: 'Tiempo de espera (minutos)', yLabel: 'Frecuencia', title: 'Tiempo de espera en urgencias (n = 300)', markMean: true },
      },
      cured: null,
      why: 'Este gráfico es correcto: variable cuantitativa continua, histograma, eje desde cero, n declarado y clases contiguas. '
        + 'Además la asimetría a la derecha se ve perfectamente, lo que ya avisa de que la mediana describirá mejor el tiempo típico que la media. '
        + 'Parte del trabajo de revisión es reconocer lo que está bien hecho.',
      treatment: 'Ninguno. Se podría añadir la mediana junto a la media.',
    },
    {
      id: 'scatter-categorical',
      brief: 'Trabajo de fin de grado: quiere mostrar la relación entre el grupo de tratamiento y el dolor final.',
      diagnosis: 'wrongtype',
      sick: {
        kind: 'scatter',
        points: painA.slice(0, 20).map((v, i) => ({ x: 1 + (i % 3) * 0.02, y: v }))
          .concat(painB.slice(0, 20).map((v, i) => ({ x: 2 + (i % 3) * 0.02, y: v, color: 'var(--data-2)' }))),
        opts: { xLabel: 'Grupo (1 = ejercicio, 2 = ejercicio + educación)', yLabel: 'Dolor final', title: 'Dolor final según grupo' },
      },
      cured: {
        kind: 'boxplot',
        groups: [{ name: 'Ejercicio', values: painA }, { name: 'Ejercicio + educación', values: painB }],
        opts: { yLabel: 'Dolor a las 8 semanas', title: 'Dolor final por grupo' },
      },
      why: 'El diagrama de dispersión exige DOS variables cuantitativas. Codificar el grupo como 1 y 2 no lo convierte en '
        + 'cuantitativo: el eje X sugiere falsamente que existe un continuo entre los dos programas.',
      treatment: 'Diagrama de caja por grupo (o gráfico de puntos con dispersión horizontal aleatoria).',
    },
  ];
}
