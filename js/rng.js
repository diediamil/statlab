/**
 * STATLAB — generador de números pseudoaleatorios semillado
 * ---------------------------------------------------------------------------
 * Por qué no `Math.random()`: la generación procedural de ejercicios necesita
 * ser REPRODUCIBLE. Con una semilla podemos:
 *   · mostrar al alumno exactamente el mismo enunciado al revisar un intento;
 *   · dar a toda la clase el mismo reto (semilla = id del reto);
 *   · generar datos demo estables entre recargas;
 *   · escribir tests deterministas.
 *
 * Algoritmo: mulberry32 (32 bits, periodo 2^32, calidad más que suficiente
 * para contenido docente; no criptográfico).
 */

/** Hash de cadena → entero de 32 bits (FNV-1a). */
export function hashSeed(str) {
  let h = 0x811c9dc5;
  const s = String(str);
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

export class RNG {
  constructor(seed = 1) {
    this.seed = typeof seed === 'number' ? (seed >>> 0) : hashSeed(seed);
    this._s = this.seed || 1;
  }

  /** Uniforme en [0, 1). */
  next() {
    let t = (this._s += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  /** Uniforme continuo en [a, b). */
  uniform(a = 0, b = 1) { return a + (b - a) * this.next(); }

  /** Entero uniforme en [a, b] (ambos incluidos). */
  int(a, b) { return Math.floor(this.uniform(a, b + 1)); }

  /** true con probabilidad p. */
  bool(p = 0.5) { return this.next() < p; }

  /** Normal(mu, sd) por Box–Muller. */
  normal(mu = 0, sd = 1) {
    let u = 0, v = 0;
    while (u === 0) u = this.next();
    while (v === 0) v = this.next();
    return mu + sd * Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  }

  /** Normal truncada a [lo, hi] (rechazo, con tope de intentos). */
  normalIn(mu, sd, lo, hi) {
    for (let i = 0; i < 60; i++) {
      const x = this.normal(mu, sd);
      if (x >= lo && x <= hi) return x;
    }
    return Math.min(hi, Math.max(lo, mu));
  }

  /** Binomial(n, p) por suma de Bernoulli (n pequeño en uso docente). */
  binomial(n, p) {
    let k = 0;
    for (let i = 0; i < n; i++) if (this.next() < p) k++;
    return k;
  }

  /** Poisson(lambda) por el método de Knuth. */
  poisson(lambda) {
    const L = Math.exp(-lambda);
    let k = 0, p = 1;
    do { k++; p *= this.next(); } while (p > L);
    return k - 1;
  }

  /** Exponencial(rate). */
  exponential(rate = 1) { return -Math.log(1 - this.next()) / rate; }

  /** Elige un elemento. */
  pick(arr) { return arr[this.int(0, arr.length - 1)]; }

  /** Elige `k` elementos sin reemplazo. */
  sample(arr, k) { return this.shuffle(arr).slice(0, k); }

  /** Copia barajada (Fisher–Yates). */
  shuffle(arr) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = this.int(0, i);
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  /** Elección ponderada: `weights` paralelo a `arr`. */
  weighted(arr, weights) {
    const total = weights.reduce((s, w) => s + w, 0);
    let r = this.next() * total;
    for (let i = 0; i < arr.length; i++) {
      r -= weights[i];
      if (r <= 0) return arr[i];
    }
    return arr[arr.length - 1];
  }

  /** Número "bonito": redondeado a `d` decimales dentro de [a, b]. */
  nice(a, b, d = 1) {
    const f = 10 ** d;
    return Math.round(this.uniform(a, b) * f) / f;
  }

  /**
   * Par de vectores con correlación de Pearson aproximadamente `r`.
   * Construcción: y = r·x + sqrt(1−r²)·e, con x y e normales independientes.
   */
  correlated(n, r, muX = 0, sdX = 1, muY = 0, sdY = 1) {
    const xs = [], ys = [];
    const k = Math.sqrt(Math.max(0, 1 - r * r));
    for (let i = 0; i < n; i++) {
      const zx = this.normal(0, 1);
      const ze = this.normal(0, 1);
      const zy = r * zx + k * ze;
      xs.push(muX + sdX * zx);
      ys.push(muY + sdY * zy);
    }
    return { xs, ys };
  }
}

/** Atajo: RNG a partir de cualquier clave (cadena o número). */
export const rngFor = (key) => new RNG(typeof key === 'number' ? key : hashSeed(key));
