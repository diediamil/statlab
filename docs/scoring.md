# Puntuación del Reto de la semana (Challenge Points)

> Principio rector: **la competición debe premiar saber estadística, no responder
> rápido.** Todo lo que sigue está diseñado alrededor de esa frase.

La fórmula está implementada **dos veces y de forma idéntica**: en
`js/scoring.js` (cliente y modo demo) y en `supabase_schema.sql`
(`statlab_finish_challenge_attempt`, que es la que manda cuando hay backend).
Las pruebas de `tests/app.test.js` comprueban numéricamente ambas propiedades.

---

## Reparto de los 1.000 puntos

| Componente | Máximo | Fórmula |
|---|---:|---|
| Exactitud y resolución | **700** | `700 · Σ(wᵢ·sᵢ) / Σ(wᵢ)` |
| Eficiencia (errores) | **150** | `150 · E / (E + errores)`, con `E = max(2, pasos/2)` |
| Tiempo | **100** | `100` si `t ≤ t_ref`; si no, `100 / (1 + (t/t_ref − 1)^1,35)`, con suelo 25 |
| Pistas | **50** | `50 · (1 − usadas / disponibles)` |

Los cuatro máximos son **configurables por reto** (`scoring_config`), por si un
profesor quiere, por ejemplo, anular el componente temporal (`timeMax: 0`).

---

## 1. Exactitud (700 puntos)

Cada paso `i` tiene:

* un **peso** `wᵢ` (por defecto 1; los pasos decisivos —elegir la prueba,
  redactar la conclusión— llevan 1,5 o 2);
* una **puntuación** `sᵢ ∈ [0, 1]` que calcula el propio tipo de paso, **con
  crédito parcial**: clasificar bien 5 de 6 elementos da 0,833; acertar la
  prueba pero justificarla a medias da 0,7 · 1 + 0,3 · 0,5 = 0,85.

Es el componente dominante a propósito: por sí solo vale más que los otros tres
juntos.

## 2. Eficiencia (150 puntos)

`errores` = número de comprobaciones incorrectas acumuladas en todo el reto.

Con 8 pasos (`E = 4`):

| Errores | 0 | 1 | 2 | 4 | 8 |
|---|---:|---:|---:|---:|---:|
| Puntos | 150 | 120 | 100 | 75 | 50 |

Es una hipérbola, así que **el primer error penaliza más que el octavo**: ese es
justo el incentivo que se busca (pensar antes de responder) sin convertir un
despiste en una catástrofe. Nunca llega a cero.

## 3. Tiempo (100 puntos) — la parte delicada

`t_ref` es el **tiempo de referencia** que fija el profesor al crear el reto.

* **`t ≤ t_ref` → 100 puntos completos.** Por debajo del tiempo de referencia
  **no hay carrera**: terminar en 4 minutos o en 9 con `t_ref = 10` puntúa
  exactamente igual. Esto elimina el incentivo a responder a lo loco.
* Por encima, la caída es suave:

| t / t_ref | 1,0 | 1,25 | 1,5 | 2,0 | 3,0 | ≥ 4,5 |
|---|---:|---:|---:|---:|---:|---:|
| Puntos | 100 | 84 | 72 | 50 | 31 | 25 (suelo) |

* El **suelo de 25** evita que alguien lento pierda toda esperanza.
* Diferencias de segundos no cambian nada: la función es continua y plana en la
  zona relevante (5 segundos de más sobre 700 cambian la puntuación en menos de
  1 punto).

### Tiempo activo, no tiempo de reloj

El cronómetro (`ActiveTimer` en `js/challenges.js`) **solo suma cuando hay
interacción**: se detiene tras 90 segundos sin actividad y cuando la pestaña
deja de estar visible. Alguien que abre el reto, se va a comer y vuelve no
acumula ese tiempo.

## 4. Pistas (50 puntos)

Se conservan íntegros si no se usa ninguna. Si el reto no ofrece pistas, se
otorgan los 50 puntos completos: no se puede penalizar por algo que no existía.

---

## Comprobación del requisito de justicia

Con `t_ref = 10 min` y un reto de 8 pasos:

| | Exactitud | Eficiencia | Tiempo | Pistas | **Total** |
|---|---:|---:|---:|---:|---:|
| **A** — 9 min, todo perfecto | 700 | 150 | 100 | 50 | **1.000** |
| **B** — 4 min, 6/8 pasos, 3 errores | 525 | 86 | 100 | 50 | **761** |

A supera a B por 239 puntos **aunque tarde más del doble**. Esta comparación es
una prueba automatizada (`tests/app.test.js`), no una promesa: si alguien
modifica los pesos y rompe la propiedad, las pruebas fallan.

También se comprueba el caso extremo: alguien que tarda **el doble** del tiempo
de referencia pero resuelve perfectamente sigue ganando a quien va rapidísimo y
falla.

---

## XP y Challenge Points son sistemas separados

| | Challenge Points | XP |
|---|---|---|
| Para qué | competición dentro del reto | progresión general en STATLAB |
| Rango | 0–1.000 por reto | acumulativo sin techo |
| Ranking | **sí** | **nunca** |
| Se pierde | no aplica | nunca se resta XP ya ganada |

Si el ranking usara XP, quien lleva más tiempo jugando quedaría
permanentemente por delante, y competir dejaría de tener sentido para quien se
incorpora tarde.

Un reto completado genera ambas cosas: por ejemplo `936/1000 CP` **y** `+96 XP`.

Los bonus de posición son deliberadamente pequeños (100 / 75 / 50 XP), para que
el líder no se vuelva inalcanzable.

---

## Ranking de temporada

Suma los **mejores N retos** de cada estudiante (por defecto 10, configurable en
`classes.season_best_n`). Consecuencia buscada: una ausencia, una enfermedad o
una semana mala **no hunden** la clasificación, y quien se incorpora tarde
todavía puede competir.

Se calcula dinámicamente en una vista SQL (`v_seasonal_ranking`), así que nunca
queda desfasado.

---

## Lo que NO es

Los Challenge Points **no son una calificación académica** y no deben
convertirse automáticamente en nota. Son un indicador motivacional y una
herramienta de diagnóstico para el profesorado.
