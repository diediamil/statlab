# Arquitectura

## Decisiones y por qué

| Decisión | Alternativa descartada | Razón |
|---|---|---|
| JavaScript con módulos ES nativos, **sin build** | React / Vue / Vite | Se despliega copiando archivos. Un profesor puede editar un `.js` y recargar. No hay `node_modules` que caduquen ni un `npm audit` que atender dentro de tres años |
| **Router por hash** (`#/ruta`) | History API | Funciona en GitHub Pages, en un subdirectorio y hasta abriendo `index.html` desde el disco, sin reglas de reescritura |
| Un único `index.html` | Un `.html` por pantalla | Los módulos compartidos se cargan una vez; la navegación es instantánea; no hay ocho copias de la cabecera que mantener sincronizadas |
| **Fachada de datos** con dos implementaciones | Llamar a Supabase desde las vistas | `?demo=1` funciona sin tocar las vistas; se puede cambiar de backend escribiendo un solo adaptador; los tests ejercitan la lógica sin red |
| **SVG a mano** para los gráficos | Chart.js / D3 | Cero dependencias, accesible por construcción y —clave— permite dibujar gráficos *deliberadamente engañosos* para el Hospital de gráficos |
| Contenido en **JSON** | Contenido en código | Ampliar el temario no exige saber programar |
| Corrección de retos **en el servidor** | Corrección en el cliente | Las respuestas correctas no llegan al navegador mientras el reto está abierto |
| Un micro-runner de pruebas de 80 líneas | Jest / Vitest | Coherencia: si el proyecto presume de no tener build, las pruebas tampoco lo tienen. Corren igual en Node y en el navegador |

---

## Mapa de módulos

```
index.html ── js/app.js ── config.js        ¿demo o Supabase?
                        ├─ i18n.js          idioma (locales/*.js)
                        ├─ router.js        rutas por hash + guardas
                        ├─ auth.js          sesión y validación
                        └─ data/store.js ─┬ data/demoStore.js  (localStorage)
                                          └ data/supabaseStore.js (RLS)

CONTENIDO         js/content.js  ← data/*.json (mundos, actividades, retos)
MOTOR             js/engine/activity.js ← engine/types/*.js (11 tipos)
LABORATORIOS      games/index.js ← games/*.js (10 minijuegos)
ESTADÍSTICA       js/stats/*.js  (puro, testable, sin DOM)
GRÁFICOS          js/viz.js      (SVG, accesible, temas claro/oscuro)
LÓGICA            js/scoring.js · js/mastery.js · js/progress.js · js/challenges.js
VISTAS            js/views/*.js  (una por pantalla)
```

### Reglas de dependencia

* `js/stats/**` **no importa nada** del DOM ni de la app. Es una librería pura.
* `js/engine/**` no conoce la capa de datos: recibe una actividad y devuelve un
  resultado.
* Las vistas **nunca** importan `supabaseStore` ni `demoStore`: solo `db`.
* Los minijuegos reciben un `api` con callbacks; no saben si hay backend.

Esta disciplina es lo que permite que los 190 tests corran en Node sin
navegador ni base de datos.

---

## Ciclo de una actividad

```
content.js         →  actividad (JSON)
generators.js      →  instancia con números concretos (RNG semillado)
engine/activity.js →  monta el tipo, gestiona pistas, intentos y feedback
                   →  resultado { score, attempts, hintsUsed, timeSeconds… }
views/session.js   →  db.recordAttempt()
data/*Store.js     →  XP + racha + mastery + logros
```

## Ciclo de un reto (con Supabase)

```
1. db.startChallengeAttempt(id)
   └─ RPC statlab_start_challenge_attempt
      · valida ventana temporal y pertenencia a la clase
      · comprueba intentos restantes
      · decide rank_eligible según la política
      · devuelve SOLO la configuración pública

2. por cada paso: db.submitChallengeStep(...)
   └─ RPC statlab_submit_challenge_step
      · lee la solución (que el cliente no tiene)
      · puntúa con statlab_grade_step
      · guarda el paso y devuelve solo la nota

3. db.finishChallengeAttempt(id, segundosActivos)
   └─ RPC statlab_finish_challenge_attempt
      · aplica la fórmula de los 1.000 Challenge Points
      · guarda el desglose y suma la XP
```

En modo demo, `demoStore` implementa exactamente los mismos tres pasos en
local, con la misma interfaz, de modo que las vistas no distinguen un modo del
otro.

---

## Accesibilidad

Aplicado de forma sistemática, no como parche final:

* **Teclado**: todo es alcanzable con Tab. El arrastrar y soltar tiene siempre
  alternativa (seleccionar la ficha y pulsar la categoría, o teclas 1–4). Los
  puntos de los diagramas de dispersión se mueven con las flechas.
* **Foco visible**: contorno de 3 px con desplazamiento, nunca `outline: none`
  sin sustituto.
* **ARIA**: `role="radiogroup"` en las opciones, `aria-pressed` en los botones
  de selección, `role="dialog"` con trampa de foco en los modales, región
  `aria-live` para los cambios importantes.
* **Gráficos**: cada SVG lleva `role="img"`, `<title>` y `<desc>` con la lectura
  del gráfico en palabras.
* **Color**: nunca es el único canal. Correcto/incorrecto llevan además ✓/✕ y
  texto.
* **Objetivos táctiles**: mínimo 44 × 44 px (`--tap`).
* **`prefers-reduced-motion`**: desactiva todas las animaciones.
* **Tema oscuro**: automático por `prefers-color-scheme` y conmutable.

La prueba `tests/e2e.mjs` comprueba automáticamente que no haya imágenes sin
alt, SVG sin etiqueta, botones sin nombre accesible ni desbordamiento
horizontal en móvil.

---

## Internacionalización

* Cero cadenas de interfaz en el HTML o en las vistas: todo pasa por `t()`.
* Los locales viven en `js/locales/*.js` como objetos anidados.
* Una clave que falta cae al idioma base (`es-ES`) y avisa por consola.
* El contenido docente (`data/*.json`) está en español; para traducirlo, los
  campos admiten objetos `{ "es": "…", "en": "…" }` que resuelve `pick()`.

Para añadir un idioma: crea `js/locales/xx.js`, regístralo en `LOCALES`
(`js/i18n.js`) y aparecerá en el selector. No hay que tocar ninguna vista.

---

## Rendimiento

* Las vistas y los minijuegos se cargan con `import()` dinámico: el navegador
  solo descarga lo que se abre.
* El contenido JSON se memoriza tras la primera carga.
* Los gráficos son SVG estáticos: no hay bucle de animación.
* Durante el arrastre de puntos no se repinta el SVG entero, solo el círculo
  movido y los indicadores numéricos (evita perder la captura del puntero).

Peso total del proyecto sin `node_modules`: menos de 1 MB, de los cuales la
mayor parte es contenido docente.
