/**
 * Minijuego: CAZADOR DE ERRORES ESTADÍSTICOS
 * ---------------------------------------------------------------------------
 * Se presentan afirmaciones extraídas del tipo de lenguaje que aparece
 * realmente en artículos, notas de prensa y trabajos de fin de grado. Hay que
 * decidir si son defendibles y, cuando no lo son, identificar el error.
 *
 * Detalle deliberado: algunas afirmaciones SON correctas. Si todas fueran
 * falsas, el juego enseñaría a desconfiar de todo, que es tan inútil como
 * creérselo todo.
 */

import { el, clear, announce } from '../js/dom.js';
import { rngFor } from '../js/rng.js';

export const meta = {
  id: 'error-hunter',
  title: 'Cazador de errores estadísticos',
  concepts: ['p-valor', 'error-tipo-ii', 'causalidad', 'significacion-vs-importancia', 'error-estandar', 'vpp', 'ic'],
  observation: 'Los seis errores que más se repiten: p como probabilidad de H0, «no significativo» leído como equivalencia, '
    + 'SE informado como SD, causalidad desde datos observacionales, significación confundida con relevancia y '
    + 'sensibilidad confundida con VPP.',
};

const CLAIMS = [
  {
    text: 'Obtuvimos p = 0,04, así que hay un 96 % de probabilidad de que el tratamiento funcione.',
    ok: false, error: 'p-valor',
    why: 'El p-valor se calcula suponiendo H0 cierta; ni p ni 1 − p son probabilidades de las hipótesis.',
  },
  {
    text: 'La diferencia fue estadísticamente significativa (p = 0,03); la diferencia estimada fue de 3,1 puntos (IC 95 %: 0,4 a 5,8).',
    ok: true, error: null,
    why: 'Correcto: informa significación, magnitud y precisión, y no interpreta el p-valor como probabilidad de la hipótesis.',
  },
  {
    text: 'No hubo diferencias significativas (p = 0,31), por lo que ambos tratamientos son igualmente eficaces.',
    ok: false, error: 'error-tipo-ii',
    why: 'Ausencia de evidencia no es evidencia de ausencia. Afirmar equivalencia requiere un diseño de equivalencia y potencia suficiente.',
  },
  {
    text: 'La edad fue de 68,4 ± 0,7 años (media ± error estándar), lo que indica un grupo muy homogéneo.',
    ok: false, error: 'error-estandar',
    why: 'El error estándar mide la precisión de la media, no la variabilidad de las personas. Para describir la muestra se usa la desviación típica.',
  },
  {
    text: 'Quienes desayunan tienen menor IMC (estudio transversal, r = −0,18), luego desayunar reduce el peso.',
    ok: false, error: 'causalidad',
    why: 'Diseño transversal: no hay temporalidad y no se descartan confusión ni causalidad inversa.',
  },
  {
    text: 'Con n = 15.000 encontramos una reducción de 0,4 mmHg (p < 0,001): un hallazgo de gran importancia clínica.',
    ok: false, error: 'significacion-vs-importancia',
    why: '0,4 mmHg no cambia ninguna decisión clínica. Con n enorme, efectos triviales resultan significativos.',
  },
  {
    text: 'La prueba tiene sensibilidad del 95 %, así que si tu resultado es positivo tienes un 95 % de probabilidad de estar enfermo.',
    ok: false, error: 'vpp',
    why: 'Confunde sensibilidad, P(+|enfermo), con VPP, P(enfermo|+). El VPP depende de la prevalencia.',
  },
  {
    text: 'El IC 95 % de la diferencia fue de −0,2 a 4,6 puntos: el estudio no es concluyente, porque incluye tanto ausencia de efecto como un efecto relevante.',
    ok: true, error: null,
    why: 'Correcto: es exactamente la lectura que hay que hacer de un intervalo ancho que cruza el cero.',
  },
  {
    text: 'Hay un 95 % de probabilidad de que la media verdadera esté entre 12,1 y 15,7.',
    ok: false, error: 'ic',
    why: 'En el marco frecuentista la confianza es una propiedad del procedimiento repetido, no de este intervalo concreto. '
      + 'La lectura pragmática aceptable es «valores compatibles con los datos».',
  },
  {
    text: 'Analizamos 18 variables sin corrección y presentamos como principal la única que resultó significativa (p = 0,046).',
    ok: false, error: 'error-tipo-i',
    why: 'Con 18 contrastes al 5 %, la probabilidad de al menos un falso positivo es del 60 %. Falta control de multiplicidad.',
  },
  {
    text: 'La mediana de estancia fue de 4 días (IQR 3–7); la media, 9,2 días, está muy influida por tres pacientes con estancias muy prolongadas.',
    ok: true, error: null,
    why: 'Correcto: informa la medida adecuada para una distribución asimétrica y explica por qué difiere de la media.',
  },
  {
    text: 'La correlación fue r = 0,62, así que el 62 % de la variabilidad queda explicada.',
    ok: false, error: 'r-efecto',
    why: 'La varianza compartida es r² = 0,38, es decir el 38 %. Confundir r con r² es un error muy frecuente.',
  },
  {
    text: 'Como los datos no seguían una distribución normal, comparamos las medianas con la U de Mann–Whitney e informamos el tamaño del efecto r.',
    ok: true, error: null,
    why: 'Correcto y coherente: prueba basada en rangos, descripción con medianas y tamaño del efecto acorde con la prueba.',
  },
  {
    text: 'El ANOVA fue significativo (p = 0,008), por lo tanto la dosis alta es mejor que la baja.',
    ok: false, error: 'anova',
    why: 'El ANOVA indica que alguna media difiere, no cuál. Hacen falta comparaciones post hoc.',
  },
];

export function mount(host, config = {}, api = {}) {
  const rng = rngFor(config.seed || `eh-${Date.now()}`);
  const deck = rng.shuffle(CLAIMS).slice(0, config.rounds || 8);
  let idx = 0, score = 0;

  const wrap = el('div', { class: 'stack' });
  host.appendChild(wrap);

  function render() {
    clear(wrap);
    if (idx >= deck.length) return finish();
    const c = deck[idx];
    const feedback = el('div');

    const judge = (said) => {
      const ok = said === c.ok;
      if (ok) score++;
      clear(feedback);
      feedback.appendChild(el('div', { class: `feedback feedback--${ok ? 'ok' : 'bad'}` }, [
        el('div', { class: 'feedback__verdict', text: ok ? 'Bien cazado' : 'Se te ha escapado' }),
        el('p', { class: 'feedback__what' }, [
          el('b', { text: c.ok ? 'La afirmación es DEFENDIBLE. ' : 'La afirmación es INCORRECTA. ' }),
          c.why,
        ]),
      ]));
      btnOk.disabled = true; btnBad.disabled = true;
      nextBtn.hidden = false;
      api.onScore?.(ok ? 1 : 0, { game: meta.id, error: c.error });
      announce(ok ? 'Correcto' : 'Incorrecto');
      nextBtn.focus();
    };

    const btnOk = el('button', { type: 'button', class: 'btn btn--success', text: 'Es defendible', onClick: () => judge(true) });
    const btnBad = el('button', { type: 'button', class: 'btn btn--danger', text: 'Contiene un error', onClick: () => judge(false) });
    const nextBtn = el('button', { type: 'button', class: 'btn btn--primary', text: 'Siguiente', hidden: true, onClick: () => { idx++; render(); } });

    wrap.appendChild(el('div', { class: 'row row--between' }, [
      el('h3', { class: 'mb-0', text: `Afirmación ${idx + 1} de ${deck.length}` }),
      el('span', { class: 'badge', text: `${score} aciertos` }),
    ]));
    wrap.appendChild(el('blockquote', { class: 'activity__stem', style: { fontStyle: 'italic' }, text: `«${c.text}»` }));
    wrap.appendChild(el('div', { class: 'row' }, [btnOk, btnBad, nextBtn]));
    wrap.appendChild(feedback);
  }

  function finish() {
    clear(wrap);
    wrap.appendChild(el('div', { class: 'card stack' }, [
      el('h3', { text: 'Cacería terminada' }),
      el('p', { text: `Has acertado ${score} de ${deck.length} afirmaciones.` }),
      el('div', { class: 'callout' }, [el('span', { class: 'callout__title', text: 'Qué llevarte' }), meta.observation]),
    ]));
    api.onFinish?.({ game: meta.id, score: deck.length ? score / deck.length : 0, correct: score, total: deck.length, concepts: meta.concepts });
  }

  render();
  return { destroy() { clear(host); } };
}
