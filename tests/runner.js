/**
 * STATLAB — micro-runner de pruebas
 * ---------------------------------------------------------------------------
 * Sin dependencias: funciona igual en Node (`npm test`) y en el navegador
 * (`tests.html`). Se ha escrito a mano en 80 líneas en lugar de añadir Jest o
 * Vitest porque el proyecto entero se apoya en no tener build ni node_modules.
 */

const suites = [];
let current = null;

export function describe(name, fn) {
  current = { name, tests: [] };
  suites.push(current);
  fn();
  current = null;
}

export function it(name, fn) {
  if (!current) throw new Error('it() fuera de describe()');
  current.tests.push({ name, fn });
}

/* ------------------------------------------------------- aserciones ----- */

export const assert = {
  ok(value, msg = 'se esperaba un valor verdadero') {
    if (!value) throw new Error(`${msg} (recibido: ${format(value)})`);
  },
  equal(actual, expected, msg = '') {
    if (actual !== expected) {
      throw new Error(`${msg || 'valores distintos'}\n  esperado: ${format(expected)}\n  recibido: ${format(actual)}`);
    }
  },
  /** Igualdad numérica con tolerancia. Imprescindible en pruebas estadísticas. */
  close(actual, expected, tol = 1e-6, msg = '') {
    if (!Number.isFinite(actual) || Math.abs(actual - expected) > tol) {
      throw new Error(`${msg || 'fuera de tolerancia'}\n  esperado: ${expected} ± ${tol}\n  recibido: ${actual}`);
    }
  },
  deepEqual(actual, expected, msg = '') {
    const a = JSON.stringify(actual), b = JSON.stringify(expected);
    if (a !== b) throw new Error(`${msg || 'estructuras distintas'}\n  esperado: ${b}\n  recibido: ${a}`);
  },
  throws(fn, msg = 'se esperaba una excepción') {
    let threw = false;
    try { fn(); } catch { threw = true; }
    if (!threw) throw new Error(msg);
  },
  between(actual, lo, hi, msg = '') {
    if (!(actual >= lo && actual <= hi)) {
      throw new Error(`${msg || 'fuera de rango'}\n  esperado en [${lo}, ${hi}]\n  recibido: ${actual}`);
    }
  },
};

const format = (v) => (typeof v === 'object' ? JSON.stringify(v) : String(v));

/* ------------------------------------------------------------ ejecución - */

export async function run({ log = console.log } = {}) {
  let passed = 0, failed = 0;
  const failures = [];

  for (const suite of suites) {
    log(`\n  ${suite.name}`);
    for (const test of suite.tests) {
      try {
        await test.fn();
        passed++;
        log(`    ✓ ${test.name}`);
      } catch (err) {
        failed++;
        failures.push({ suite: suite.name, test: test.name, err });
        log(`    ✗ ${test.name}`);
        log(`      ${String(err.message).split('\n').join('\n      ')}`);
      }
    }
  }

  log(`\n  ${passed} pruebas superadas, ${failed} fallidas\n`);
  return { passed, failed, failures, total: passed + failed };
}
