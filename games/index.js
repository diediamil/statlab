/**
 * STATLAB — registro de minijuegos y laboratorios
 * ---------------------------------------------------------------------------
 * Carga diferida (import dinámico): el navegador solo descarga el minijuego
 * que el alumno abre. Añadir uno nuevo requiere una línea aquí y su archivo.
 *
 * Contrato de cada módulo:
 *   export const meta = { id, title, concepts[], observation }
 *   export function mount(host, config, api) → { destroy() }
 *
 * `api` puede traer: onScore(points, detail), onFinish(result), onState(state).
 */

const LOADERS = {
  'variable-classifier': () => import('./variable-classifier.js'),
  'chart-hospital': () => import('./chart-hospital.js'),
  'error-hunter': () => import('./error-hunter.js'),
  'choose-your-test': () => import('./choose-your-test.js'),
  'bayes-machine': () => import('./bayes-machine.js'),
  'build-the-normal': () => import('./build-the-normal.js'),
  'sampling-simulator': () => import('./sampling-simulator.js'),
  'correlation-lab': () => import('./correlation-lab.js'),
  'regression-lab': () => import('./regression-lab.js'),
  'diagnostic-table': () => import('./diagnostic-table.js'),
};

export const GAME_IDS = Object.keys(LOADERS);

const cache = new Map();

export async function loadGame(id) {
  if (!LOADERS[id]) throw new Error(`Minijuego desconocido: ${id}`);
  if (!cache.has(id)) cache.set(id, await LOADERS[id]());
  return cache.get(id);
}

/** Monta un minijuego en un contenedor. */
export async function mountGame(id, host, config = {}, api = {}) {
  const mod = await loadGame(id);
  return mod.mount(host, config, api);
}

export async function gameMeta(id) {
  const mod = await loadGame(id);
  return mod.meta;
}

/** Metadatos de todos los minijuegos (para el índice del Laboratorio). */
export async function allGameMeta() {
  return Promise.all(GAME_IDS.map(async (id) => ({ id, ...(await gameMeta(id)) })));
}
