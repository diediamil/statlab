# Privacidad y protección de datos

STATLAB maneja datos personales de estudiantes. Este documento explica qué se
recoge, por qué, quién puede verlo y cómo está protegido, para que puedas
justificarlo ante tu institución.

---

## 1. Minimización: qué se pide y por qué

| Dato | Obligatorio | Finalidad |
|---|---|---|
| Nombre y apellidos | Sí | Identificar al estudiante ante su profesorado |
| Correo electrónico | Sí | Autenticación y recuperación de contraseña |
| Contraseña | Sí | Autenticación (la gestiona Supabase Auth; nunca se almacena en claro) |
| Grado | Sí | Adaptar ejemplos y producir agregados docentes |
| Alias | Sí | Aparecer en los rankings **sin exponer la identidad** |
| Identificador universitario | **No** | Solo si el profesorado necesita cruzar con actas |

**No se recoge nada más.** En particular, **no se almacena ningún dato de salud
del estudiante**: los casos clínicos de la aplicación son ficticios o simulados.

## 2. Pseudonimización en los rankings

Los rankings muestran **exclusivamente**: posición, alias y puntuación.

Nunca muestran nombre, apellidos ni correo. Esto no depende del frontend: las
vistas SQL `v_weekly_ranking` y `v_seasonal_ranking` **solo proyectan la columna
`alias`** de `profiles`, y la tabla `profiles` está protegida por RLS de forma
que un estudiante solo puede leer su propia fila.

El profesorado **sí** puede ver la correspondencia alias ↔ persona, porque la
necesita para su función docente. Esa correspondencia aparece únicamente en el
panel del profesor.

## 3. Control de acceso (Row Level Security)

Todas las tablas con datos personales tienen RLS activada. Las políticas
implementan tres reglas:

1. **El estudiante solo ve sus propias filas.** `attempts`, `student_progress`,
   `concept_mastery`, `study_sessions`, `student_achievements`,
   `weekly_challenge_attempts`… todas filtran por `auth.uid()`.
2. **El profesorado solo ve a los estudiantes de sus propias clases.** La
   función `statlab_teaches_student()` comprueba la pertenencia real.
3. **Los rankings se exponen solo por vistas** que proyectan alias, puntos y
   posición, con el filtro de clase dentro de la propia vista.

Esto significa que **la seguridad no depende del navegador**. Aunque alguien use
la anon key con `curl`, el servidor solo devolverá lo que las políticas
permitan. Puedes comprobarlo tú mismo:

```bash
curl "https://TU-PROYECTO.supabase.co/rest/v1/profiles?select=*" \
  -H "apikey: TU_ANON_KEY"
# → [] (sin sesión no se ve nada)
```

## 4. Las respuestas de los retos no viajan al navegador

Las soluciones viven en la columna `weekly_challenges.solution`, cuyo privilegio
de `SELECT` está **revocado** para el rol `authenticated`. Ni un `SELECT *`, ni
un `UPDATE ... RETURNING`, ni una vista lo devuelven.

La corrección ocurre en el servidor (`statlab_submit_challenge_step`, función
`SECURITY DEFINER`), que lee la solución, puntúa y devuelve solo el resultado.
El profesorado accede a las soluciones mediante
`statlab_challenge_solution()`, que comprueba permisos.

## 5. El rol no se puede escalar desde el cliente

* El trigger `handle_new_user()` fuerza `role = 'student'` en todas las altas,
  ignorando cualquier metadato enviado desde el navegador.
* La política de `UPDATE` sobre `profiles` impide que un usuario cambie su
  propia columna `role`.
* Convertir una cuenta en profesor exige un `UPDATE` administrativo desde la
  consola de Supabase (ver el README).

## 6. Exportación: dos modos

| Modo | Contiene | Uso previsto |
|---|---|---|
| **Identificada** | nombre, apellidos, correo, alias, resultados | Seguimiento docente |
| **Pseudonimizada** | UUID derivado por hash, alias, resultados | Análisis e investigación |

El UUID pseudonimizado es **estable entre exportaciones** (permite seguimiento
longitudinal) y **no reversible** desde el propio archivo.

⚠️ Los datos pseudonimizados **siguen siendo datos personales** a efectos del
RGPD. No los publiques junto a información que permita reidentificar (por
ejemplo, un grupo de prácticas de tres personas y su grado).

Cada exportación incluye un `LEEME.txt` que recuerda estas cautelas.

## 7. Derechos de las personas interesadas

| Derecho | Cómo se atiende |
|---|---|
| Acceso | La pantalla «Mi cuenta» enumera todos los datos guardados y quién los ve. «Mi progreso» muestra el histórico completo |
| Rectificación | El estudiante edita nombre, apellidos, grado, alias e identificador desde «Mi cuenta» |
| Supresión | Borrar el usuario en Supabase → Authentication elimina en cascada perfil, intentos, progreso y mastery (`ON DELETE CASCADE`) |
| Portabilidad | La exportación CSV del profesorado cubre a toda la clase; para una persona concreta, filtra por su `student_uuid` |
| Oposición al ranking | El profesorado puede desactivar los rankings por clase (`ranking_enabled`) |

## 8. Dónde viven los datos

Supabase permite elegir la región del proyecto al crearlo. **Para instituciones
europeas, elige una región de la UE** (por ejemplo `eu-west-1` o
`eu-central-1`). Consulta con la unidad de protección de datos de tu
universidad antes de usar la plataforma con estudiantes reales, y valora si
necesitas un contrato de encargado de tratamiento con el proveedor.

## 9. Modo demo

El modo demo (`?demo=1`) **no envía nada a ningún servidor**. Todo vive en el
`localStorage` del navegador y los 20 estudiantes son ficticios. Es la forma
recomendada de enseñar la herramienta a colegas o de hacer capturas de
pantalla.

## 10. Aviso pedagógico obligatorio

XP, Challenge Points y mastery son **indicadores formativos**. La aplicación lo
recuerda en el pie de página, en la pantalla de puntuación y en cada
exportación. No deben convertirse automáticamente en calificación académica, y
usarlos así cambiaría la naturaleza del tratamiento de datos (y probablemente
requeriría informar de nuevo al alumnado).
