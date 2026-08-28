# Concept Mastery (0–100)

> Requisito de diseño: **nada de algoritmos opacos.** Esta es la fórmula
> completa, y la propia aplicación se la muestra al alumnado cuando pulsa
> «¿cómo se calcula?».

Implementación: `js/mastery.js`. Pruebas: `tests/app.test.js`.

---

## La fórmula

```
mastery = 100 · [ Σ(w_d · λ^k · q) / Σ(w_d · λ^k) ] · n / (n + 2)
```

con `λ = 0,85` y las 12 respuestas más recientes.

### 1. Calidad de cada respuesta (`q`)

| Situación | q |
|---|---:|
| Correcta a la primera, sin pistas | 1,00 |
| Correcta a la primera, con pista | 0,85 |
| Correcta en el segundo intento | 0,70 |
| Correcta tras tres o más intentos | 0,40 |
| Incorrecta | 0,00 |

Con crédito parcial (por ejemplo, clasificar bien 4 de 6), `q` parte del propio
crédito y se le aplican los mismos descuentos.

### 2. Peso por dificultad (`w_d`)

| Dificultad | Peso |
|---|---:|
| Fácil | 1,0 |
| Media | 1,3 |
| Difícil | 1,6 |

Acertar ejercicios difíciles demuestra más dominio que acertar fáciles.

### 3. Peso por recencia (`λ^k`)

Las respuestas se ordenan de la más reciente a la más antigua. La k-ésima más
reciente (con `k = 0` para la última) pesa `0,85^k`:

| k | 0 | 1 | 2 | 3 | 5 | 10 |
|---|---:|---:|---:|---:|---:|---:|
| Peso | 1,00 | 0,85 | 0,72 | 0,61 | 0,44 | 0,20 |

Consecuencia: un concepto que se dominaba hace tres meses y ahora se falla
**baja**; y uno que se falló al principio y ahora se acierta **sube**. Es lo que
hace que el mastery mida el estado actual y no el histórico acumulado.

### 4. Contracción por falta de evidencia

```
factor = n / (n + 2)
```

| n (respuestas) | 1 | 2 | 5 | 10 | 20 | 50 |
|---|---:|---:|---:|---:|---:|---:|
| Factor | 0,33 | 0,50 | 0,71 | 0,83 | 0,91 | 0,96 |

Sin esto, dos aciertos sueltos darían un 100 y el indicador sería inútil. Con
esto, **el techo real solo se alcanza con evidencia sostenida**.

### 5. Niveles

| Rango | Etiqueta |
|---|---|
| 0–39 | iniciando |
| 40–59 | en desarrollo |
| 60–79 | consolidando |
| 80–100 | dominado |

---

## Para qué se usa

1. **Panel del estudiante**: mastery medio y conceptos fuertes/débiles.
2. **Mis errores**: prioridad de repaso, calculada como
   `(100 − mastery) · log(1 + errores recientes)`.
3. **Dificultad adaptativa**: decide qué ejercicio se ofrece a continuación
   (`nextDifficulty`).
4. **Estado de los mundos**: un mundo no se marca «completado» solo por hacer
   actividades; hace falta además un mastery medio ≥ 60 en sus conceptos.
5. **Panel del profesor**: mastery medio de la clase y detección de conceptos
   problemáticos.

## Dificultad adaptativa (sin IA)

Reglas deterministas y auditables:

| Mastery del concepto | Dificultad ofrecida |
|---|---|
| < 40 | 1 (fácil, muy guiada) |
| 40–69 | 2 (media) |
| ≥ 70 | 3 (difícil, enunciado menos explícito) |

Ajustes:

* dos fallos seguidos → baja un escalón;
* tres aciertos limpios seguidos → sube un escalón;
* tras dos intentos fallidos en la misma actividad → se muestra la explicación
  completa y se intercala un ejercicio más fácil del mismo concepto.

**Nunca se castiga**: no se resta XP ganada ni se bloquea contenido por fallar.

---

## Lo que NO es

El mastery **no es una nota**. Es un indicador formativo del estado actual de
un concepto para una persona concreta, construido con la evidencia disponible.
Un mastery de 55 no significa «un 5,5»: significa «hay evidencia parcial de
dominio, conviene seguir practicando».
