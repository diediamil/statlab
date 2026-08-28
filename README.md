<div align="center">

# STATLAB

**Learn statistics by experimenting** · *Aprende estadística experimentando*

Plataforma docente de Estadística y Bioestadística para primer curso de
Ciencias de la Salud.

**Creado por Diego Díaz Milanés** · [ddiaz@uloyola.es](mailto:ddiaz@uloyola.es)
Departamento de Métodos Cuantitativos · Universidad Loyola Andalucía

</div>

---

## Qué es

STATLAB no es un banco de preguntas tipo test con una capa de videojuego. Es
una plataforma donde la estadística se aprende **manipulando datos y tomando
decisiones**: mover un punto y ver cómo cambia *r*, bajar la prevalencia y ver
cómo se hunde el VPP, ajustar una recta a mano y comprobar que ninguna consigue
una suma de residuos menor que la de mínimos cuadrados.

La pregunta central de toda la aplicación es:

> **«¿Qué debo hacer con estos datos y por qué?»**

y no «¿qué fórmula tengo que memorizar?».

### De un vistazo

| | |
|---|---|
| **15 mundos** | De «qué son estos datos» al proyecto final sin instrucciones |
| **10 laboratorios** | Simulaciones interactivas, no ilustraciones |
| **11 tipos de actividad** | Incluye decisión + justificación y auditoría de afirmaciones |
| **Reto de la semana** | Caso semanal para toda la clase, con ranking por Challenge Points |
| **Panel del profesor** | «¿Dónde falló la clase?» con datos, no con intuición |
| **Sin build** | HTML + CSS + JS con módulos ES. Se despliega copiando archivos |
| **Sin dependencias** | Cero `node_modules` en producción. Supabase se carga por CDN |
| **190 pruebas** | Estadística validada contra R/scipy, scoring, mastery y contenido |

---

## Probarlo ahora mismo (30 segundos, sin instalar nada)

```bash
cd statlab
python3 -m http.server 8080
```

Abre <http://localhost:8080/index.html?demo=1#/student>.

Entrarás como estudiante en una clase de demostración con **20 estudiantes
ficticios**, tres retos ya jugados y rankings poblados. El banner superior
permite cambiar a la **vista de profesor** con un clic.

> El modo demo no envía nada a ningún servidor: todo vive en el `localStorage`
> de tu navegador. Es la forma recomendada de enseñar la herramienta a un
> colega o de hacer capturas.

---

## Índice

1. [Los 15 mundos](#los-15-mundos)
2. [Modos de la aplicación](#modos-de-la-aplicación)
3. [El Reto de la semana](#el-reto-de-la-semana)
4. [Puesta en marcha con Supabase](#puesta-en-marcha-con-supabase)
5. [Crear el primer profesor](#crear-el-primer-profesor)
6. [Despliegue](#despliegue)
7. [Estructura del proyecto](#estructura-del-proyecto)
8. [Añadir contenido](#añadir-contenido)
9. [Seguridad y privacidad](#seguridad-y-privacidad)
10. [Exportación de datos](#exportación-de-datos)
11. [Pruebas](#pruebas)
12. [Copias de seguridad](#copias-de-seguridad)
13. [Preguntas frecuentes](#preguntas-frecuentes)

---

## Los 15 mundos

```
Datos → Variables → Descriptiva → Visualización → Probabilidad → Distribuciones
  → Muestreo → Estimación → Contrastes → Elección de pruebas
  → Correlación → Regresión → Diagnóstico → Tamaños del efecto → Proyecto final
```

| # | Mundo | Laboratorio asociado |
|---|---|---|
| 1 | Conoce tus datos | — |
| 2 | Tipos de variables | Clasificador de variables |
| 3 | Estadística descriptiva | — |
| 4 | Visualización | Hospital de gráficos |
| 5 | Probabilidad | Máquina de Bayes |
| 6 | Distribuciones | Construye la normal |
| 7 | Muestreo | Simulador de muestreo (TCL) |
| 8 | Estimación | Simulador de cobertura de IC |
| 9 | Contraste de hipótesis | Cazador de errores estadísticos |
| 10 | Elección de pruebas | **Elige tu prueba** |
| 11 | **Correlación** | Laboratorio de correlación |
| 12 | **Regresión** | Laboratorio de regresión |
| 13 | Pruebas diagnósticas | Tabla diagnóstica + ROC |
| 14 | Tamaños del efecto | — |
| 15 | Proyecto final | Elige tu prueba (modo difícil) |

Correlación y regresión son **mundos separados y sin conceptos compartidos**,
porque la confusión entre ambos es uno de los errores más persistentes: la
correlación es simétrica y adimensional; la regresión no lo es y tiene unidades.

Cada mundo declara sus conceptos **y el error conceptual habitual asociado a
cada uno**, que la aplicación muestra en el feedback cuando el estudiante falla.

---

## Modos de la aplicación

| Modo | Qué hace |
|---|---|
| **Campaña** | Progresión guiada por los 15 mundos, con desbloqueo por mastery |
| **Laboratorio** | Los 10 minijuegos, libres y sin puntuación |
| **Partida rápida** | Práctica suelta sobre los mundos elegidos |
| **Reto de la semana** | El caso semanal de la clase, con ranking |
| **Mis actividades** | Lo asignado por el profesorado, con fechas |
| **Mi progreso** | XP, nivel, mastery por concepto, racha, logros e histórico |
| **Mis errores** | Conceptos que más cuestan, con práctica dirigida |

### Los 10 laboratorios

1. **Clasificador de variables** — arrastrar variables sanitarias a su tipo.
2. **Hospital de gráficos** — diagnosticar gráficos defectuosos y ver la versión corregida.
3. **Cazador de errores** — juzgar afirmaciones estadísticas reales (algunas son correctas).
4. **Elige tu prueba** — escenario, prueba **y justificación** (30 % de la nota).
5. **Máquina de Bayes** — 1.000 personas dibujadas; baja la prevalencia y mira el VPP.
6. **Construye la normal** — mueve μ y σ, lee áreas y puntuaciones z.
7. **Simulador de muestreo** — el TCL apareciendo, y la cobertura real de los IC del 95 %.
8. **Laboratorio de correlación** — arrastra puntos y observa *r*; incluye el caso curvo con *r* ≈ 0.
9. **Laboratorio de regresión** — ajusta la recta a mano y compárala con MCO; residuos, R², apalancamiento.
10. **Tabla diagnóstica** — construye la 2×2, calcula las cuatro métricas y mueve el punto de corte sobre la ROC.

---

## El Reto de la semana

Cada semana el profesor publica un caso que resuelve toda la clase.

**Secuencia de 8 pasos** (ejemplo del reto «¿Funciona el tratamiento?»):

1. identificar variables → 2. elegir descriptivos → 3. seleccionar el gráfico →
4. formular hipótesis → 5. **elegir el análisis** → 6. interpretar el p-valor →
7. interpretar el tamaño del efecto → 8. emitir conclusión.

**La prueba estadística nunca aparece indicada**: deducirla es lo que se evalúa.

### Nueve plantillas

`Caso clínico` · `Detective estadístico` · `Gráfico misterioso` ·
`Bayes Challenge` · `Diagnostic Challenge` · `Data Challenge` ·
`Research Challenge` · `Regression Challenge` · **`Reviewer 2`** (fragmentos de
un artículo ficticio con errores estadísticos reales que hay que encontrar).

### Puntuación: 1.000 Challenge Points

| Componente | Máximo | Idea |
|---|---:|---|
| Exactitud y resolución | 700 | Domina la puntuación |
| Eficiencia (errores) | 150 | Nunca llega a cero |
| Tiempo | 100 | **Completos por debajo del tiempo de referencia** |
| Pistas | 50 | Íntegros si no usas ninguna |

**Comprobación de justicia** (probada automáticamente): con `t_ref = 10 min`,
quien tarda 9 minutos y resuelve perfectamente obtiene **1.000**; quien tarda 4
minutos con 2 pasos fallados y 3 errores obtiene **761**. Saber estadística gana.

El cronómetro mide **tiempo activo**: se detiene tras 90 segundos sin
interacción o al cambiar de pestaña.

Detalle completo de las fórmulas: **[docs/scoring.md](docs/scoring.md)**.

### Rankings

* **Semanal** por reto: podio + tabla, con posición, **alias** y puntos.
* **De temporada**: suma los **mejores N retos** (10 por defecto, configurable),
  de modo que una ausencia o una semana mala no hunden la clasificación.
* **Most Improved**: reconocimiento independiente a quien más mejora respecto a
  su propia media, para que no gane siempre quien partía mejor.

Los rankings muestran **exclusivamente el alias**. El profesorado sí ve la
correspondencia con la persona.

### Configuración por reto

Fechas de apertura y cierre · tiempo de referencia · intentos máximos ·
**intento competitivo** (primero / mejor / único / todos; por defecto
**primer intento**) · pistas sí/no · publicación de la solución (inmediata / al
cerrar / manual) · mostrar ranking · contar para la temporada · pesos de
puntuación personalizados.

---

## Puesta en marcha con Supabase

### 1. Crear el proyecto

1. Entra en [supabase.com](https://supabase.com) y crea un proyecto.
2. **Elige una región de la UE** si trabajas con estudiantes europeos.
3. Anota la *Project URL* y la *anon public key* (Settings → API).

### 2. Crear el esquema

Abre **SQL Editor**, pega el contenido completo de `supabase_schema.sql` y
ejecútalo. El script crea tablas, índices, triggers, funciones, vistas, activa
Row Level Security y define todas las políticas. Es idempotente: se puede
volver a ejecutar sin destruir datos.

Comprueba que RLS quedó activa:

```sql
select tablename, rowsecurity from pg_tables
 where schemaname = 'public' order by tablename;
```

Todas las tablas con datos personales deben mostrar `rowsecurity = true`.

### 3. Configurar la aplicación

```bash
cp config.example.js config.js
```

Edita `config.js`:

```js
window.STATLAB_CONFIG = {
  SUPABASE_URL: 'https://xxxxx.supabase.co',
  SUPABASE_ANON_KEY: 'eyJhbGciOi...',
  DEFAULT_LOCALE: 'es-ES',
  ALLOWED_EMAIL_DOMAIN: 'uloyola.es',   // opcional: restringe el alta
};
```

> ⚠️ **Nunca pongas aquí la `service_role` key.** Esa clave omite RLS y, en un
> archivo servido al navegador, equivale a publicar la base de datos entera. La
> `anon` key sí es pública por diseño: la seguridad real la aportan las
> políticas RLS.

Si `config.js` no existe, STATLAB arranca en modo demo automáticamente.

### 4. Configurar la autenticación

En Supabase → **Authentication → URL Configuration**, añade la URL de tu
despliegue a *Site URL* y *Redirect URLs* (por ejemplo
`https://tuusuario.github.io/statlab/`).

Si quieres que el alumnado entre sin confirmar el correo, desactiva *Confirm
email* en Authentication → Providers → Email. Para uso real, es preferible
dejarlo activado.

---

## Crear el primer profesor

El rol **no se puede obtener desde la aplicación**: el trigger de alta fuerza
`role = 'student'` ignorando cualquier metadato del cliente, y una política RLS
impide que nadie cambie su propia columna `role`.

Procedimiento:

1. Regístrate normalmente en la aplicación con tu correo institucional.
2. En Supabase → **SQL Editor**, ejecuta:

```sql
update public.profiles
   set role = 'teacher'
 where email = 'profesor@universidad.es';
```

3. Cierra sesión y vuelve a entrar. Verás el panel del profesor.

Comprobar quién tiene rol docente:

```sql
select id, email, first_name, last_name, role
  from public.profiles where role <> 'student';
```

Revocar:

```sql
update public.profiles set role = 'student' where email = '...';
```

Este SQL corre con privilegios de administrador de la consola, **no** con la
anon key: ningún usuario de la aplicación puede reproducirlo.

---

## Despliegue

STATLAB es un sitio **estático**. No hay build, no hay servidor propio.

### GitHub Pages

```bash
git init && git add . && git commit -m "STATLAB"
git branch -M main
git remote add origin https://github.com/TUUSUARIO/statlab.git
git push -u origin main
```

En **Settings → Pages**, selecciona *GitHub Actions*: el flujo
`.github/workflows/pages.yml` ya está incluido y publica en cada push.

El router por hash hace que funcione en un subdirectorio
(`usuario.github.io/statlab/`) **sin ninguna regla de reescritura**.

### Netlify

Arrastra la carpeta a <https://app.netlify.com/drop>, o conecta el repositorio
(el `netlify.toml` incluido no define build y añade cabeceras de seguridad).

### Vercel

`vercel --prod` desde la carpeta, o importa el repositorio. El `vercel.json`
incluido no necesita configuración adicional.

### Cloudflare Pages

Conecta el repositorio, deja el comando de build vacío y el directorio de
salida en `/`.

### Servidor propio

Copia la carpeta a cualquier servidor web. **No abras `index.html` con
`file://`**: los módulos ES necesitan HTTP.

---

## Estructura del proyecto

```
statlab/
├── index.html                   shell de la SPA
├── tests.html                   las pruebas, en el navegador
├── config.example.js            → cópialo como config.js
├── supabase_schema.sql          esquema completo con RLS
├── README.md · LICENSE
│
├── styles/                      tokens, base, componentes, layout, juegos
│
├── js/
│   ├── app.js                   arranque, barra superior y rutas
│   ├── router.js                router por hash con guardas
│   ├── config.js · i18n.js · auth.js
│   ├── locales/                 es-ES.js · en.js
│   ├── data/
│   │   ├── store.js             FACHADA (las vistas solo hablan con esto)
│   │   ├── demoStore.js         localStorage + 20 alumnos ficticios
│   │   ├── demoSeed.js          generador de la clase demo
│   │   └── supabaseStore.js     Supabase + RLS
│   ├── stats/                   NÚCLEO ESTADÍSTICO (puro y testable)
│   │   ├── special.js           Lanczos, beta y gamma incompletas
│   │   ├── distributions.js     normal, t, chi², F, binomial, Poisson
│   │   ├── descriptive.js       centro, dispersión, cuartiles, Tukey
│   │   ├── tests.js             t, ANOVA, chi², Fisher, MW, Wilcoxon, KW…
│   │   ├── effects.js           d, g, η², ω², ε², V de Cramér, W, potencia
│   │   ├── regression.js        Pearson, Spearman, MCO, residuos, influencia
│   │   ├── diagnostics.js       S, E, VPP, VPN, LR, Youden, ROC/AUC
│   │   └── sampling.js          SE, TCL, IC, cobertura, tamaño muestral
│   ├── engine/
│   │   ├── activity.js          motor de actividades
│   │   ├── chart-spec.js        gráficos declarados en JSON
│   │   └── types/               11 tipos de actividad
│   ├── viz.js                   motor SVG accesible
│   ├── scoring.js               Challenge Points (documentado)
│   ├── mastery.js               mastery 0–100 (documentado)
│   ├── progress.js              XP, niveles, rachas, logros
│   ├── challenges.js            separación de soluciones, tiempo activo
│   ├── generators.js            generación procedural semillada
│   ├── export.js                CSV y ZIP sin dependencias
│   └── views/                   una por pantalla
│
├── games/                       los 10 minijuegos (carga diferida)
│
├── data/
│   ├── worlds.json              15 mundos, conceptos y errores frecuentes
│   ├── achievements.json        20 logros con sus reglas
│   ├── cases.json               casos longitudinales A–E
│   ├── activities/w01…w15.json  actividades
│   └── challenges/*.json        3 retos completos de demostración
│
├── docs/
│   ├── arquitectura.md · scoring.md · mastery.md
│   ├── privacidad.md · contenido.md
│
└── tests/
    ├── runner.js · run.js
    ├── stats.test.js · app.test.js
    └── e2e.mjs                  recorrido completo en navegador real
```

Detalle de las decisiones de diseño: **[docs/arquitectura.md](docs/arquitectura.md)**.

---

## Añadir contenido

Todo el contenido vive en `data/*.json`. **No hace falta tocar JavaScript.**

Añadir una actividad al Mundo 3:

```json
{
  "id": "w03-10",
  "concept": "media",
  "type": "mcq",
  "difficulty": 2,
  "xp": 15,
  "prompt": "…",
  "options": [{ "id": "a", "text": "…", "why": "…" }],
  "answer": "a",
  "explanation": "…",
  "hints": ["…", "…", "…"]
}
```

Guía completa (tipos de actividad, gráficos en JSON, retos, generadores
procedurales y una lista de comprobación de rigor estadístico):
**[docs/contenido.md](docs/contenido.md)**.

Tras cualquier cambio, ejecuta `node tests/run.js`: hay pruebas que validan la
integridad del contenido.

---

## Seguridad y privacidad

Resumen; el detalle está en **[docs/privacidad.md](docs/privacidad.md)**.

* **Row Level Security** activa en todas las tablas con datos personales. La
  seguridad **no depende del frontend**: con la anon key y `curl` solo se
  obtiene lo que las políticas permiten.
* **El alumnado solo ve sus propias filas.** El profesorado solo ve a los
  estudiantes de **sus** clases.
* **Los rankings solo exponen alias**, mediante vistas que no proyectan nombre
  ni correo.
* **Las soluciones de los retos no viajan al navegador**: la columna `solution`
  tiene el privilegio de `SELECT` revocado y la corrección se hace en el
  servidor con funciones `SECURITY DEFINER`.
* **El rol no se puede escalar** desde el cliente.
* **Los intentos son inmutables**: no hay políticas de `UPDATE` ni `DELETE`.
* **No se almacena ningún dato de salud** del estudiante.
* La `service_role` key **no aparece en ningún archivo** del proyecto.

---

## Exportación de datos

Panel del profesor → **Exportar**. Dos modos:

| Modo | Contiene | Para qué |
|---|---|---|
| **Identificada** | nombre, apellidos, correo, alias, resultados | Seguimiento docente |
| **Pseudonimizada** | UUID estable por hash, alias, resultados | Análisis e investigación |

Diez tablas: `students`, `attempts`, `progress`, `challenge_attempts`,
`challenge_steps`, `weekly_rankings`, `seasonal_rankings`, `concept_mastery`,
`class_summary`, `concept_difficulty`. Se descargan sueltas o en un ZIP con un
`LEEME.txt` que documenta el formato y las cautelas de protección de datos.

Formato pensado para que funcione sin configurar nada: UTF-8 con BOM, separador
coma, decimal punto, booleanos 0/1, fechas ISO 8601.

```r
# R
datos <- read.csv("attempts.csv", encoding = "UTF-8")
todo  <- merge(datos, read.csv("progress.csv"), by = "student_uuid")
```

```python
# Python
import pandas as pd
attempts = pd.read_csv("attempts.csv")
todo = attempts.merge(pd.read_csv("progress.csv"), on="student_uuid")
```

---

## Pruebas

```bash
node tests/run.js      # 190 pruebas, sin dependencias
```

O abre `tests.html` en el navegador para ver las mismas pruebas ahí.

Qué se comprueba:

* **Estadística** — media, mediana, desviación típica, cuartiles (tipo 7 de
  R), Tukey, normal, t, chi², F, binomial, t de una muestra / independiente /
  pareada, ANOVA, Fisher, Mann–Whitney, Wilcoxon, Kruskal–Wallis, normalidad
  K², Pearson, Spearman, regresión completa, sensibilidad, especificidad, VPP,
  VPN, Youden, ROC/AUC, error estándar, TCL y cobertura de los IC. Los valores
  de referencia proceden de **R y scipy** y se citan en cada prueba.
* **Scoring** — cada componente por separado y el **requisito de justicia**
  (perfecto y lento gana a rápido y con fallos).
* **Mastery** — calidad, recencia, dificultad, contracción y adaptatividad.
* **Progreso** — XP, niveles, rachas, estados de los mundos y logros.
* **Retos** — que la configuración pública **no contenga ninguna respuesta**.
* **Exportación** — formato CSV RFC 4180.
* **Contenido** — integridad de mundos, conceptos, actividades y retos.

Prueba de extremo a extremo con navegador real (requiere Playwright):

```bash
python3 -m http.server 8099 &
node tests/e2e.mjs
```

Recorre demo → alumno → campaña → actividad → laboratorios → reto → ranking →
panel del profesor, y comprueba accesibilidad básica y ausencia de
desbordamiento en móvil.

---

## Copias de seguridad

**Base de datos.** Supabase hace copias automáticas en los planes de pago. Para
una copia manual:

```bash
supabase db dump -f copia-$(date +%F).sql --db-url "postgresql://..."
```

O desde la consola: Database → Backups.

**Contenido.** Está en el repositorio Git: cada commit es una copia.

**Datos de una clase concreta.** La exportación ZIP del panel del profesor
sirve como copia funcional y legible dentro de veinte años, cuando ni STATLAB
ni Supabase existan.

Recomendación práctica: exporta al terminar cada cuatrimestre y guarda el ZIP
pseudonimizado junto a los materiales de la asignatura.

---

## Preguntas frecuentes

**¿Puedo usarlo sin Supabase?**
Sí, en modo demo, pero los datos no persisten entre navegadores ni se comparten.
Para usarlo con una clase real necesitas el backend.

**¿Cuánto cuesta?**
El plan gratuito de Supabase (500 MB de base de datos, 50.000 usuarios activos
al mes) sobra para varias asignaturas. El hosting estático es gratuito en las
cuatro plataformas mencionadas.

**¿Puedo cambiar los pesos de la puntuación?**
Sí, por reto, en `scoring_config`. Las fórmulas están en `js/scoring.js` y
`supabase_schema.sql`, y ambas deben cambiarse a la vez.

**¿Los XP son la nota?**
No, y la aplicación lo repite en el pie de página, en la pantalla de puntuación
y en cada exportación. Son indicadores formativos.

**¿Cómo evito que se copien las respuestas del reto?**
Las soluciones no llegan al navegador: la corrección ocurre en el servidor y la
columna `solution` está revocada. Además, por defecto solo cuenta el **primer
intento** para el ranking, así que repetir hasta memorizar no sirve de nada.

**Un estudiante ha perdido su racha por enfermedad.**
La racha no resta nada: solo deja de sumar. Y el ranking de temporada cuenta
únicamente los mejores N retos, precisamente para eso.

**¿Puedo traducirlo?**
Sí. Crea `js/locales/xx.js`, regístralo en `js/i18n.js` y aparecerá en el
selector. Las claves que falten caen automáticamente al español.

**¿Funciona en móvil?**
Sí: diseño adaptable, objetivos táctiles de 44 px y arrastrar y soltar con
alternativa táctil y de teclado.

---

## Autoría y licencia

Creado por **Diego Díaz Milanés** — [ddiaz@uloyola.es](mailto:ddiaz@uloyola.es)
Departamento de Métodos Cuantitativos, Universidad Loyola Andalucía.

MIT. Ver [LICENSE](LICENSE).

Si lo usas en docencia, se agradece (pero no se exige) una mención.

---

<div align="center">
<sub>XP, Challenge Points y mastery son indicadores formativos.<br>
No son calificación académica.</sub>
</div>
