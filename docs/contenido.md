# Cómo añadir y modificar contenido

Todo el contenido docente vive en archivos JSON dentro de `data/`. **No hace
falta tocar JavaScript** para añadir actividades, conceptos, mundos o retos.

Después de cualquier cambio, ejecuta `node tests/run.js`: hay pruebas que
validan la integridad del contenido (conceptos inexistentes, actividades sin
explicación, retos con pasos mal formados…).

---

## Estructura de `data/`

```
data/
├── worlds.json              mundos, conceptos y errores conceptuales
├── achievements.json        logros y sus reglas
├── cases.json               casos longitudinales A–E
├── activities/
│   ├── w01.json … w15.json  actividades de cada mundo
└── challenges/
    └── *.json               plantillas de reto semanal
```

---

## Añadir una actividad

Abre `data/activities/wNN.json` y añade un objeto al array `activities`:

```json
{
  "id": "w03-10",
  "concept": "media",
  "type": "mcq",
  "difficulty": 2,
  "xp": 15,
  "stem": "Contexto opcional que precede al enunciado.",
  "prompt": "La pregunta.",
  "options": [
    { "id": "a", "text": "Opción A", "why": "Por qué es incorrecta." },
    { "id": "b", "text": "Opción B", "why": "Por qué es la correcta." }
  ],
  "answer": "b",
  "explanation": "Explicación completa. La primera frase se usa como feedback breve.",
  "hints": ["Pista 1", "Pista 2", "Pista 3"]
}
```

Requisitos que comprueban las pruebas:

* `id` único en todo el proyecto;
* `concept` (o `concepts`) debe existir en `worlds.json`;
* `explanation` obligatoria;
* al menos una pista (salvo en actividades de tipo `sim`).

### Tipos de actividad disponibles

| `type` | Interacción | Crédito parcial |
|---|---|---|
| `mcq` | Elección única | no |
| `multi` | Selección múltiple | sí (penaliza falsos positivos) |
| `numeric` | Respuesta numérica con tolerancia | no |
| `classify` | Arrastrar a categorías | sí (proporción bien colocada) |
| `order` | Ordenar elementos | sí (pares concordantes) |
| `claim-audit` | Juzgar afirmaciones correctas/incorrectas | sí |
| `chart-pick` | Elegir el gráfico adecuado (se dibujan de verdad) | no |
| `chart-fix` | Diagnosticar un gráfico defectuoso | sí |
| `decision` | Elegir prueba **y justificarla** | sí (70 % + 30 %) |
| `table2x2` | Construir la tabla diagnóstica y sus métricas | sí |
| `sim` | Abre un laboratorio | según el juego |

Ejemplos de cada tipo: busca en `data/activities/` (`grep '"type"' data/activities/*.json`).

### Campos adicionales útiles

| Campo | Para qué |
|---|---|
| `misconceptionFeedback` | Respuesta dirigida a un error concreto: `{"120": "Eso es el número de datos, no de individuos."}` |
| `chart` | Dibuja un gráfico junto al enunciado (ver más abajo) |
| `quote` | Muestra el texto como cita (retos tipo *Reviewer 2*) |
| `case` | Vincula la actividad a un caso longitudinal (`"A"`…`"E"`) |
| `generator` | Genera el enunciado proceduralmente en cada intento |
| `acceptable` | En `decision`: alternativas que puntúan 0,6 en lugar de 0 |

### Gráficos dentro del contenido

```json
"chart": {
  "kind": "boxplot",
  "groups": [
    { "name": "Control", "values": [5, 6, 7, 6, 8] },
    { "name": "Intervención", "values": [3, 4, 5, 4, 4] }
  ],
  "opts": { "yLabel": "Dolor (0–10)", "showMean": true }
}
```

`kind` admite: `bar`, `groupedBar`, `pie`, `histogram`, `boxplot`, `scatter`,
`line`, `dotplot`, `stackedBar`, `pictogram`, `roc`.

Para el minijuego «Hospital de gráficos» puedes construir gráficos
deliberadamente engañosos: `opts.baselineZero: false` trunca el eje Y (y añade
un aviso visible).

---

## Añadir un concepto o un mundo

En `data/worlds.json`:

```json
{
  "id": "w16",
  "num": 16,
  "title": "Modelos multivariantes",
  "subtitle": "Ajustar por variables de confusión",
  "icon": "🧩",
  "requires": "w15",
  "labs": [],
  "concepts": [
    {
      "id": "confusion",
      "label": "Variable de confusión",
      "misconception": "Creer que ajustar por todo lo disponible siempre mejora el modelo."
    }
  ]
}
```

Después crea `data/activities/w16.json` con al menos una actividad. El mundo
aparece automáticamente en el mapa, en el panel del profesor y en las
estadísticas. **Recuerda añadir también la fila a la tabla `worlds` del SQL**
(al final de `supabase_schema.sql`) para que las claves foráneas funcionen.

Cada concepto debería declarar su `misconception`: es lo que la aplicación
muestra en el feedback cuando el alumno falla, y una prueba comprueba que más
del 90 % lo tienen.

---

## Añadir un reto semanal

Copia una plantilla de `data/challenges/` y adáptala:

```json
{
  "id": "ch-demo-04",
  "code": "RETO 4",
  "type": "clinical_case",
  "title": "…",
  "description": "…",
  "world": "w10",
  "concepts": ["t-independiente", "p-valor"],
  "difficulty": 3,
  "recommendedMinutes": 15,
  "maxAttempts": 3,
  "competitivePolicy": "first",
  "allowHints": true,
  "solutionPolicy": "on_close",
  "briefing": "Texto que lee el alumno antes de empezar.",
  "dataset": { "generator": "clinicalTrial2Groups", "seed": "…", "params": { … } },
  "steps": [ { "id": "s1", "type": "mcq", "weight": 1.5, "concept": "…", … } ],
  "wrapUp": "Qué llevarse del reto."
}
```

Los pasos usan **los mismos tipos** que las actividades, con dos añadidos:

* `weight`: importancia del paso en la puntuación de exactitud (por defecto 1);
* `quote`: para mostrar un fragmento citado (útil en *Reviewer 2*).

Registra el archivo en `DEMO_CHALLENGE_FILES` (`js/content.js`) para que
aparezca como plantilla en el panel del profesor.

### Tipos de reto

`clinical_case`, `detective`, `mystery_chart`, `bayes`, `diagnostic`, `data`,
`research`, `regression`, `reviewer2`.

### La solución nunca viaja al navegador

Al crear un reto desde el panel del profesor, `splitChallenge()` separa la
plantilla en dos:

* `configuration`: enunciados, opciones, pistas y datos → **visible**;
* `solution`: respuestas, marcas `correct`, explicaciones → **privada**.

Una prueba comprueba que la parte pública no contiene ni `answer`, ni
`correct`, ni `why`, ni `explanation`, ni `bin`.

---

## Conjuntos de datos generados

Un reto puede declarar un dataset reproducible:

```json
"dataset": {
  "generator": "clinicalTrial2Groups",
  "seed": "statlab-reto-2-lumbalgia",
  "params": {
    "n": 80,
    "groupNames": ["Ejercicio", "Ejercicio + educación"],
    "outcome": { "name": "dolor_final", "label": "Dolor (0–10)", "mean": 5.9, "sd": 1.7, "effect": -1.6, "min": 0, "max": 10, "round": 0 },
    "covariates": [ { "name": "edad", "label": "Edad", "mean": 51, "sd": 11, "min": 22, "max": 79, "round": 0 } ],
    "categorical": [ { "name": "sexo", "label": "Sexo", "levels": ["Mujer", "Hombre"], "probs": [0.58, 0.42] } ]
  }
}
```

La semilla garantiza que **toda la clase ve exactamente los mismos datos** y que
el enunciado se puede reproducir al revisar el intento.

Generadores disponibles: `clinicalTrial2Groups`, `correlatedPairs`,
`diagnostic2x2` (`js/generators.js`).

---

## Generación procedural de ejercicios

Añade `"generator": "descriptiveBasics"` a una actividad y sus números
cambiarán en cada intento. Generadores incluidos:

| Generador | Qué produce |
|---|---|
| `populationSample` | Identificar la población objetivo |
| `variableTypes` | Clasificar el tipo de una variable |
| `descriptiveBasics` | Calcular media, mediana, desviación típica o rango |
| `seFromSample` | Calcular el error estándar |
| `conditionalProbability` | Probabilidad condicionada con tabla 2×2 |
| `diagnosticMetrics` | VPP a partir de S, E y prevalencia |
| `zScore` | Puntuación z |

Para crear uno nuevo: añade la función a `GENERATORS` en `js/generators.js`.
Recibe `(rng, activity)` y devuelve los campos que sustituyen a los de la
actividad. Usa **siempre** el `rng` que recibe (nunca `Math.random`) para que el
enunciado sea reproducible.

---

## Rigor estadístico: lista de comprobación

Antes de dar por buena una actividad nueva, verifica que **no** cae en ninguno
de estos errores (el propio contenido de STATLAB los combate explícitamente):

- [ ] El p-valor **no** se presenta como «probabilidad de que H0 sea cierta».
- [ ] Un p > 0,05 **no** se presenta como demostración de igualdad.
- [ ] No se confunden desviación típica (SD) y error estándar (SE).
- [ ] No se confunden sensibilidad y valor predictivo positivo.
- [ ] No se deduce causalidad de una asociación observacional.
- [ ] R² **no** se interpreta como causalidad ni como tasa de acierto.
- [ ] Los umbrales de tamaño del efecto se presentan como **convenciones
      orientativas**, no como categorías absolutas, y se usa la escala correcta
      para cada índice (la de la *d* no vale para la *V* de Cramér).
- [ ] Se distingue significación estadística de relevancia clínica.
- [ ] Los intervalos de confianza se interpretan sobre el procedimiento, no
      como probabilidad del parámetro.
