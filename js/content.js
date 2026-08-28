/**
 * STATLAB — carga y consulta del contenido
 * ---------------------------------------------------------------------------
 * El contenido (mundos, conceptos, actividades, retos, casos, logros) vive en
 * `data/*.json` y NO en el código. Esto permite:
 *   · que un profesor añada actividades sin tocar JavaScript;
 *   · versionar el contenido por separado del motor;
 *   · validar el contenido con un script (ver `validate()`).
 *
 * Todo se carga una sola vez y se memoriza.
 */

const cache = {
  worlds: null, activities: new Map(), achievements: null,
  cases: null, challenges: null, byConcept: null,
};

const base = new URL('../', import.meta.url).href;                 // raíz del proyecto
const dataUrl = (p) => new URL(`data/${p}`, base).href;

const isNode = typeof process !== 'undefined' && process.versions?.node && base.startsWith('file:');

/**
 * Carga un JSON del directorio `data/`. En el navegador usa fetch; bajo Node
 * (tests) lee del sistema de archivos, porque fetch no admite file://.
 */
async function loadJson(path) {
  const url = dataUrl(path);
  if (isNode) {
    const { readFile } = await import('node:fs/promises');
    const { fileURLToPath } = await import('node:url');
    return JSON.parse(await readFile(fileURLToPath(url), 'utf8'));
  }
  const res = await fetch(url, { cache: 'no-cache' });
  if (!res.ok) throw new Error(`No se pudo cargar data/${path} (${res.status})`);
  return res.json();
}

/* ------------------------------------------------------------- mundos ---- */

export async function getWorlds() {
  if (!cache.worlds) {
    const raw = await loadJson('worlds.json');
    cache.worlds = raw.worlds.map((w) => ({ ...w, conceptIds: w.concepts.map((c) => c.id) }));
    cache.flow = raw.flow || [];
  }
  return cache.worlds;
}

export async function getFlow() {
  await getWorlds();
  return cache.flow;
}

export async function getWorld(id) {
  const ws = await getWorlds();
  return ws.find((w) => w.id === id) || null;
}

/** Índice concepto → { concept, world }. */
export async function getConceptIndex() {
  if (cache.byConcept) return cache.byConcept;
  const ws = await getWorlds();
  const m = new Map();
  for (const w of ws) {
    for (const c of w.concepts) m.set(c.id, { ...c, world: w.id, worldNum: w.num, worldTitle: w.title });
  }
  cache.byConcept = m;
  return m;
}

export async function getConcept(id) {
  const idx = await getConceptIndex();
  return idx.get(id) || { id, label: id, world: null };
}

/* --------------------------------------------------------- actividades --- */

/** Actividades de un mundo (memorizadas). */
export async function getActivities(worldId) {
  if (cache.activities.has(worldId)) return cache.activities.get(worldId);
  let list = [];
  try {
    const raw = await loadJson(`activities/${worldId}.json`);
    list = (raw.activities || []).map((a) => ({
      world: worldId,
      difficulty: 1,
      xp: 10,
      concepts: a.concepts || (a.concept ? [a.concept] : []),
      ...a,
    }));
  } catch {
    list = [];                       // un mundo sin archivo simplemente no tiene actividades
  }
  cache.activities.set(worldId, list);
  return list;
}

/** Todas las actividades de todos los mundos. */
export async function getAllActivities() {
  const ws = await getWorlds();
  const lists = await Promise.all(ws.map((w) => getActivities(w.id)));
  return lists.flat();
}

export async function getActivity(id) {
  const all = await getAllActivities();
  return all.find((a) => a.id === id) || null;
}

/** Actividades que tocan un concepto. */
export async function getActivitiesByConcept(conceptId) {
  const all = await getAllActivities();
  return all.filter((a) => a.concepts.includes(conceptId));
}

/**
 * Selecciona actividades para una sesión de práctica.
 * `opts`: { worldId, concepts[], count, difficulty, exclude[], preferUnseen }
 */
export async function pickActivities(opts = {}) {
  const { worldId = null, concepts = null, count = 5, difficulty = null, exclude = [], rng = Math.random } = opts;
  let pool = worldId ? await getActivities(worldId) : await getAllActivities();
  if (concepts && concepts.length) pool = pool.filter((a) => a.concepts.some((c) => concepts.includes(c)));
  if (difficulty) pool = pool.filter((a) => a.difficulty === difficulty);
  const fresh = pool.filter((a) => !exclude.includes(a.id));
  const chosen = (fresh.length >= count ? fresh : pool).slice();
  // Barajado con el RNG recibido (permite reproducibilidad)
  for (let i = chosen.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [chosen[i], chosen[j]] = [chosen[j], chosen[i]];
  }
  return chosen.slice(0, count);
}

/* ---------------------------------------------------------------- casos -- */

export async function getCases() {
  if (!cache.cases) cache.cases = (await loadJson('cases.json')).cases;
  return cache.cases;
}

export async function getCase(id) {
  const cs = await getCases();
  return cs.find((c) => c.id === id) || null;
}

/* --------------------------------------------------------------- logros -- */

export async function getAchievements() {
  if (!cache.achievements) cache.achievements = (await loadJson('achievements.json')).achievements;
  return cache.achievements;
}

/* ------------------------------------------------- retos de demostración -- */

const DEMO_CHALLENGE_FILES = [
  'challenges/demo-01-detective-variables.json',
  'challenges/demo-02-funciona-el-tratamiento.json',
  'challenges/demo-03-reviewer2.json',
];

/** Plantillas de reto incluidas con la aplicación. */
export async function getBuiltInChallenges() {
  if (!cache.challenges) {
    const list = await Promise.all(DEMO_CHALLENGE_FILES.map(async (f) => {
      try { return await loadJson(f); } catch { return null; }
    }));
    cache.challenges = list.filter(Boolean);
  }
  return cache.challenges;
}

export async function getBuiltInChallenge(id) {
  const list = await getBuiltInChallenges();
  return list.find((c) => c.id === id) || null;
}

/* ----------------------------------------------- catálogo de minijuegos -- */

export const GAMES = [
  { id: 'variable-classifier', world: 'w02', icon: '🏷️', concepts: ['cualitativa', 'cuantitativa', 'nominal-ordinal', 'discreta-continua'] },
  { id: 'chart-hospital', world: 'w04', icon: '🩹', concepts: ['grafico-adecuado', 'grafico-enganoso', 'histograma', 'boxplot'] },
  { id: 'error-hunter', world: 'w09', icon: '🔍', concepts: ['p-valor', 'error-tipo-ii', 'causalidad', 'significacion-vs-importancia'] },
  { id: 'choose-your-test', world: 'w10', icon: '🧪', concepts: ['parametrica-no', 'independientes-relacionadas', 'n-grupos'] },
  { id: 'bayes-machine', world: 'w05', icon: '🎲', concepts: ['bayes', 'condicionada', 'vpp', 'prevalencia'] },
  { id: 'build-the-normal', world: 'w06', icon: '🔔', concepts: ['normal', 'puntuacion-z', 'regla-68-95', 'percentil-normal'] },
  { id: 'sampling-simulator', world: 'w07', icon: '🎯', concepts: ['tcl', 'error-estandar', 'distribucion-muestral', 'ic'] },
  { id: 'correlation-lab', world: 'w11', icon: '🔗', concepts: ['pearson', 'intensidad', 'outliers-r', 'scatter-r'] },
  { id: 'regression-lab', world: 'w12', icon: '📉', concepts: ['minimos-cuadrados', 'pendiente', 'residuos', 'r2'] },
  { id: 'diagnostic-table', world: 'w13', icon: '🩺', concepts: ['vp-vn-fp-fn', 'sensibilidad', 'especificidad', 'vpp', 'vpn'] },
];

export const getGame = (id) => GAMES.find((g) => g.id === id) || null;

/* ------------------------------------------------------------ validación -- */

/**
 * Comprobación de integridad del contenido. Se ejecuta en los tests y puede
 * llamarse desde la consola del navegador: `import('./js/content.js').then(m => m.validate())`
 */
export async function validate() {
  const problems = [];
  const worlds = await getWorlds();
  const conceptIdx = await getConceptIndex();
  const ids = new Set();

  for (const w of worlds) {
    if (w.requires && !worlds.some((x) => x.id === w.requires)) {
      problems.push(`Mundo ${w.id}: requiere "${w.requires}", que no existe.`);
    }
    for (const g of w.labs || []) {
      if (!GAMES.some((x) => x.id === g)) problems.push(`Mundo ${w.id}: laboratorio desconocido "${g}".`);
    }
  }

  const acts = await getAllActivities();
  for (const a of acts) {
    if (ids.has(a.id)) problems.push(`Actividad duplicada: ${a.id}`);
    ids.add(a.id);
    if (!a.type) problems.push(`Actividad ${a.id}: falta "type".`);
    for (const c of a.concepts) {
      if (!conceptIdx.has(c)) problems.push(`Actividad ${a.id}: concepto desconocido "${c}".`);
    }
    if (!a.explanation) problems.push(`Actividad ${a.id}: falta explicación.`);
    if (a.type === 'mcq' && !a.generator && !a.answer) problems.push(`Actividad ${a.id}: mcq sin respuesta.`);
    if (a.type === 'sim' && !getGame(a.game)) problems.push(`Actividad ${a.id}: juego desconocido "${a.game}".`);
  }

  const challenges = await getBuiltInChallenges();
  for (const ch of challenges) {
    if (!ch.steps?.length) problems.push(`Reto ${ch.id}: sin pasos.`);
    for (const s of ch.steps || []) {
      if (!s.type) problems.push(`Reto ${ch.id}, paso ${s.id}: falta "type".`);
      if (s.concept && !conceptIdx.has(s.concept)) problems.push(`Reto ${ch.id}, paso ${s.id}: concepto desconocido "${s.concept}".`);
    }
  }

  return { ok: problems.length === 0, problems, counts: { worlds: worlds.length, activities: acts.length, challenges: challenges.length, concepts: conceptIdx.size } };
}
