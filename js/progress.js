/**
 * STATLAB — XP, niveles, rachas y logros
 * ---------------------------------------------------------------------------
 * Reglas de gamificación (declaradas para que no haya sorpresas):
 *   · La XP NUNCA se resta. Fallar cuesta XP no ganada, no XP perdida.
 *   · Las pistas reducen ligeramente la XP del ejercicio (nunca por debajo del
 *     40 % del valor base): pedir ayuda debe seguir siendo mejor que rendirse.
 *   · Los niveles crecen de forma suave, sin muros artificiales.
 *   · La racha se rompe pero no penaliza: solo deja de sumar.
 */

import { clamp, daysBetween, todayKey } from './utils.js';

/* ------------------------------------------------------------------ XP --- */

export const XP_RULES = {
  hintPenaltyPerHint: 0.2,     // −20 % por pista
  hintPenaltyFloor: 0.4,       // nunca menos del 40 % de la XP base
  retryPenalty: { 1: 1, 2: 0.7, 3: 0.5 },  // por número de intento en que se acierta
  retryFloor: 0.35,
  partialCreditMin: 0.25,      // XP mínima si hay algo de crédito parcial
  streakBonusEvery: 5,         // cada 5 días de racha
  streakBonusXp: 25,
};

/**
 * XP de una actividad.
 * @param {object} a  { xp (base), difficulty }
 * @param {object} r  { correct, score (0–1), attempts, hintsUsed }
 */
export function activityXp(a, r, rules = XP_RULES) {
  const base = a.xp ?? 10;
  const credit = r.correct ? 1 : clamp(r.score ?? 0, 0, 1);
  if (credit <= 0) return 0;

  const hintFactor = Math.max(rules.hintPenaltyFloor, 1 - rules.hintPenaltyPerHint * (r.hintsUsed || 0));
  const tryFactor = Math.max(rules.retryFloor, rules.retryPenalty[Math.min(3, r.attempts || 1)] ?? rules.retryFloor);
  const raw = base * credit * hintFactor * tryFactor;
  const floor = credit > 0 ? base * rules.partialCreditMin * credit : 0;
  return Math.max(Math.round(floor), Math.round(raw));
}

/* -------------------------------------------------------------- niveles -- */

/**
 * Curva de nivel: XP acumulada necesaria para alcanzar el nivel L es
 *
 *     total(L) = 60 · (L − 1) + 20 · (L − 1)²
 *
 * Nivel 2 → 80 XP · Nivel 3 → 200 · Nivel 5 → 560 · Nivel 10 → 2.160
 * Crecimiento cuadrático suave: siempre se ve el siguiente nivel cerca, y no
 * hay saltos que desmotiven.
 */
export const xpForLevel = (level) => (level <= 1 ? 0 : 60 * (level - 1) + 20 * (level - 1) ** 2);

export function levelFromXp(xp) {
  let level = 1;
  while (xpForLevel(level + 1) <= xp && level < 200) level++;
  const current = xpForLevel(level);
  const next = xpForLevel(level + 1);
  return {
    level,
    xp,
    xpAtLevel: current,
    xpNextLevel: next,
    xpIntoLevel: xp - current,
    xpNeeded: next - xp,
    progress: next > current ? (xp - current) / (next - current) : 1,
  };
}

/* --------------------------------------------------------------- rachas -- */

/**
 * Actualiza la racha diaria.
 * @param {object} progress { streak_days, last_active_date }
 * @returns {object} { streak, extended, broken, bonusXp }
 */
export function updateStreak(progress, now = new Date()) {
  const today = todayKey(now);
  const last = progress?.last_active_date || null;
  if (!last) return { streak: 1, extended: true, broken: false, bonusXp: 0, date: today };
  if (last === today) return { streak: progress.streak_days || 1, extended: false, broken: false, bonusXp: 0, date: today };

  const gap = daysBetween(last, today);
  if (gap === 1) {
    const streak = (progress.streak_days || 0) + 1;
    const bonusXp = streak % XP_RULES.streakBonusEvery === 0 ? XP_RULES.streakBonusXp : 0;
    return { streak, extended: true, broken: false, bonusXp, date: today };
  }
  return { streak: 1, extended: true, broken: true, bonusXp: 0, date: today };
}

/** Últimos 7 días de actividad, para el widget de racha. */
export function streakCalendar(activeDates, days = 7, now = new Date()) {
  const set = new Set(activeDates);
  const out = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(d.getDate() - i);
    const key = todayKey(d);
    out.push({ date: key, active: set.has(key), isToday: i === 0 });
  }
  return out;
}

/* --------------------------------------------------- estado de los mundos */

/**
 * Estado de cada mundo: bloqueado / disponible / iniciado / completado.
 * Un mundo se considera completado cuando el alumno ha resuelto correctamente
 * al menos el 70 % de sus actividades y su mastery medio en los conceptos del
 * mundo alcanza 60.
 */
export function worldStates(worlds, { activityResults, masteryMap, threshold = 0.7, masteryThreshold = 60 }) {
  const states = new Map();
  const byWorld = new Map();
  for (const r of activityResults) {
    if (!byWorld.has(r.world)) byWorld.set(r.world, new Map());
    const m = byWorld.get(r.world);
    const prev = m.get(r.activity_id);
    // se guarda el mejor resultado por actividad
    if (!prev || (r.score ?? 0) > (prev.score ?? 0)) m.set(r.activity_id, r);
  }

  for (const w of worlds) {
    const results = byWorld.get(w.id) || new Map();
    const done = Array.from(results.values()).filter((r) => (r.score ?? 0) >= 0.999).length;
    const started = results.size > 0;
    const total = w.activityCount ?? null;

    const conceptVals = w.conceptIds.map((c) => masteryMap.get(c)?.value ?? 0);
    const avgMastery = conceptVals.length ? conceptVals.reduce((s, x) => s + x, 0) / conceptVals.length : 0;

    const completed = total
      ? done / total >= threshold && avgMastery >= masteryThreshold
      : started && avgMastery >= masteryThreshold;

    const prevOk = !w.requires || states.get(w.requires)?.state === 'completed';
    let state;
    if (completed) state = 'completed';
    else if (started) state = 'started';
    else if (prevOk) state = 'available';
    else state = 'locked';

    states.set(w.id, {
      state, done, total, started, completed,
      avgMastery: Math.round(avgMastery * 10) / 10,
      progress: total ? done / total : (started ? 0.5 : 0),
    });
  }
  return states;
}

/* --------------------------------------------------------------- logros -- */

/**
 * Evalúa las reglas de logros contra el estado del estudiante.
 * `ctx` contiene todo lo necesario para resolver cualquier regla declarada en
 * `data/achievements.json`. Devuelve los códigos recién conseguidos.
 */
export function evaluateAchievements(achievements, ctx, alreadyEarned = []) {
  const earned = new Set(alreadyEarned);
  const newly = [];
  for (const a of achievements) {
    if (earned.has(a.code)) continue;
    if (checkRule(a.rule, ctx)) newly.push(a);
  }
  return newly;
}

function checkRule(rule, ctx) {
  if (!rule) return false;
  switch (rule.type) {
    case 'totalActivities':
      return (ctx.totalActivities || 0) >= rule.min;
    case 'worldCompleted':
      return ctx.worldStates?.get(rule.world)?.state === 'completed';
    case 'conceptCorrect':
      return (ctx.correctByConcept?.get(rule.concept) || 0) >= rule.min;
    case 'conceptStreak': {
      let n = 0;
      for (const c of rule.concepts) n += ctx.correctByConcept?.get(c) || 0;
      const errs = rule.concepts.reduce((s, c) => s + (ctx.errorsByConcept?.get(c) || 0), 0);
      return n >= rule.correct && errs === 0;
    }
    case 'gameScore':
      return (ctx.gameBest?.get(rule.game) || 0) >= rule.min;
    case 'challengeErrors':
      return ctx.lastChallenge && ctx.lastChallenge.completed && (ctx.lastChallenge.errors ?? 99) <= rule.max;
    case 'challengeHints':
      return ctx.lastChallenge && ctx.lastChallenge.completed && (ctx.lastChallenge.hints_used ?? 99) <= rule.max;
    case 'weeklyRank':
      return ctx.lastChallengeRank && ctx.lastChallengeRank <= rule.max;
    case 'mostImproved':
      return !!ctx.isMostImproved;
    case 'challengeDelta':
      return (ctx.lastChallengeDelta || 0) >= rule.min;
    case 'consecutiveChallenges':
      return (ctx.consecutiveChallenges || 0) >= rule.min;
    case 'challengeTypePerfect':
      return ctx.lastChallenge?.challenge_type === rule.challengeType
        && (ctx.lastChallenge?.errors ?? 99) === 0
        && (ctx.lastChallenge?.score ?? 0) >= 0.999;
    case 'streak':
      return (ctx.streak || 0) >= rule.min;
    case 'masteryCount': {
      let n = 0;
      for (const m of (ctx.masteryMap?.values() || [])) if (m.value >= rule.min) n++;
      return n >= rule.count;
    }
    case 'masteryConcepts':
      return rule.concepts.every((c) => (ctx.masteryMap?.get(c)?.value ?? 0) >= rule.min);
    default:
      return false;
  }
}

/* ---------------------------------------------- agregados del estudiante -- */

/** Construye el contexto que necesitan los logros y el panel del alumno. */
export function buildStudentContext({ attempts, masteryMap, worldStates: ws, progress, challengeAttempts = [], gameBest = new Map() }) {
  const correctByConcept = new Map();
  const errorsByConcept = new Map();
  const activeDates = new Set();
  let totalActivities = 0, firstTryCorrect = 0, totalTimeSeconds = 0;

  for (const a of attempts) {
    totalActivities++;
    totalTimeSeconds += a.time_seconds || 0;
    if (a.created_at) activeDates.add(todayKey(new Date(a.created_at)));
    if (a.correct && (a.attempt_number || 1) === 1) firstTryCorrect++;
    for (const c of a.concepts || (a.concept ? [a.concept] : [])) {
      if (a.correct) correctByConcept.set(c, (correctByConcept.get(c) || 0) + 1);
      else errorsByConcept.set(c, (errorsByConcept.get(c) || 0) + 1);
    }
  }

  const completed = challengeAttempts.filter((c) => c.completed);
  const sortedCh = completed.slice().sort((a, b) => new Date(a.completed_at || 0) - new Date(b.completed_at || 0));
  const lastChallenge = sortedCh[sortedCh.length - 1] || null;
  const prevChallenge = sortedCh[sortedCh.length - 2] || null;

  return {
    totalActivities,
    firstTryAccuracy: totalActivities ? firstTryCorrect / totalActivities : 0,
    totalTimeSeconds,
    correctByConcept,
    errorsByConcept,
    activeDates: Array.from(activeDates),
    masteryMap,
    worldStates: ws,
    streak: progress?.streak_days || 0,
    gameBest,
    challengesCompleted: completed.length,
    lastChallenge,
    lastChallengeDelta: lastChallenge && prevChallenge
      ? (lastChallenge.challenge_points || 0) - (prevChallenge.challenge_points || 0) : 0,
    consecutiveChallenges: consecutiveRun(sortedCh),
  };
}

function consecutiveRun(sorted) {
  // Cuenta la racha final de retos completados sin huecos por número de reto.
  let run = 0;
  for (let i = sorted.length - 1; i >= 0; i--) {
    if (sorted[i].completed) run++; else break;
  }
  return run;
}
