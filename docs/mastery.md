# Concept Mastery (0–100)

> Requisito de diseño: **nada de algoritmos opacos.** Esta es la definición
> completa, y es la misma que la aplicación muestra al alumnado cuando pulsa
> «¿cómo se calcula?».

Implementación: [`js/mastery.js`](../js/mastery.js) · Pruebas: [`tests/app.test.js`](../tests/app.test.js)

El **mastery** resume en una escala de 0 a 100 la evidencia disponible de que
una persona domina *en este momento* un concepto. Mide el estado actual, no el
histórico acumulado: por eso puede bajar si se deja de acertar lo que antes se
acertaba.

---

## Nomenclatura

| Símbolo | Significado |
|---|---|
| $n$ | número total de respuestas registradas en el concepto |
| $N = 12$ | tamaño de la ventana |
| $m = \min(n, N)$ | respuestas que entran efectivamente en la media |
| $i$ | índice de respuesta, de reciente a antigua; $i = 1$ es la última |
| $q_i \in [0,1]$ | calidad de la respuesta $i$ |
| $d_i \in \{1,2,3\}$ | dificultad del ejercicio: fácil, media, difícil |
| $w(d)$ | peso por dificultad |
| $\lambda = 0{,}85$ | factor de decaimiento por recencia |
| $\omega_i$ | peso total de la respuesta $i$ |
| $\bar{q}$ | valor bruto: calidad media ponderada |
| $\kappa(n)$ | factor de contracción por falta de evidencia |
| $M$ | mastery del concepto |

---

## Definición

Cada respuesta recibe un peso que combina dificultad y recencia:

$$\omega_i = w(d_i)\,\lambda^{\,i-1} \tag{1}$$

El valor bruto es la media de las calidades ponderada por esos pesos:

$$\bar{q} = \frac{\sum_{i=1}^{m} \omega_i\,q_i}{\sum_{i=1}^{m} \omega_i}
\;\in\; [0,1] \tag{2}$$

Y se contrae hacia cero cuando hay poca evidencia:

$$\kappa(n) = \frac{n}{n+2} \tag{3}$$

$$M = 100 \cdot \bar{q} \cdot \kappa(n) \tag{4}$$

Sustituyendo (1)–(3) en (4):

$$\boxed{\;M \;=\; 100 \cdot
\frac{\sum_{i=1}^{m} w(d_i)\,\lambda^{\,i-1}\,q_i}
     {\sum_{i=1}^{m} w(d_i)\,\lambda^{\,i-1}}
\cdot \frac{n}{n+2}\;} \tag{5}$$

> **Detalle que importa.** La media (2) usa las $m$ respuestas más recientes,
> pero la contracción (3) usa $n$, el total histórico. Practicar de más nunca
> resta: aumenta $\kappa$ y acerca el mastery a su valor bruto.

---

## Los componentes

### Calidad de la respuesta $q_i$

| Situación | $q_i$ |
|---|---:|
| Correcta a la primera, sin pistas | 1,00 |
| Correcta a la primera, con pista | 0,85 |
| Correcta en el segundo intento | 0,70 |
| Correcta tras tres o más intentos | 0,40 |
| Incorrecta | 0,00 |

Con crédito parcial $c \in (0,1)$ —por ejemplo, clasificar bien 4 de 6— la
calidad es el producto del crédito por el descuento de la tabla:

$$q_i = c \cdot q_{\text{tabla}}$$

### Peso por dificultad $w(d)$

| $d$ | Nivel | $w(d)$ |
|---:|---|---:|
| 1 | fácil | 1,0 |
| 2 | media | 1,3 |
| 3 | difícil | 1,6 |

Acertar un ejercicio difícil es más informativo sobre el dominio real que
acertar uno fácil.

### Decaimiento por recencia $\lambda^{\,i-1}$

| $i$ | 1 | 2 | 3 | 4 | 6 | 11 |
|---|---:|---:|---:|---:|---:|---:|
| $\lambda^{\,i-1}$ | 1,00 | 0,85 | 0,72 | 0,61 | 0,44 | 0,20 |

Consecuencia buscada: un concepto que se dominaba hace tres meses y ahora se
falla **baja**; uno que se falló al principio y ahora se acierta **sube**.

### Contracción $\kappa(n)$

| $n$ | 1 | 2 | 5 | 10 | 20 | 50 |
|---|---:|---:|---:|---:|---:|---:|
| $\kappa(n)$ | 0,33 | 0,50 | 0,71 | 0,83 | 0,91 | 0,96 |

Sin este factor, dos aciertos sueltos darían un 100 y el indicador no valdría
nada. El techo solo se alcanza con evidencia sostenida.

### Niveles

| Rango | Etiqueta |
|---|---|
| $0 \le M < 40$ | iniciando |
| $40 \le M < 60$ | en desarrollo |
| $60 \le M < 80$ | consolidando |
| $80 \le M \le 100$ | dominado |

---

## Para qué se usa

1. **Panel del estudiante**: mastery medio y conceptos fuertes/débiles.
2. **Mis errores**: prioridad de repaso, calculada como
   $(100 - M)\log(1 + e)$, con $e$ el número de errores recientes.
3. **Dificultad adaptativa**: decide qué ejercicio se ofrece a continuación
   (`nextDifficulty`).
4. **Estado de los mundos**: un mundo no se marca «completado» solo por hacer
   actividades; hace falta además $\bar{M} \ge 60$ en sus conceptos.
5. **Panel del profesor**: mastery medio de la clase y detección de conceptos
   problemáticos.

## Dificultad adaptativa (sin IA)

Reglas deterministas y auditables:

| Mastery del concepto | Dificultad ofrecida |
|---|---|
| $M < 40$ | 1 (fácil, muy guiada) |
| $40 \le M < 70$ | 2 (media) |
| $M \ge 70$ | 3 (difícil, enunciado menos explícito) |

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
Un $M = 55$ no significa «un 5,5»: significa que hay evidencia parcial de
dominio y conviene seguir practicando.
