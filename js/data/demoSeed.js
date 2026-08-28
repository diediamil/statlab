/**
 * STATLAB — datos de demostración
 * ---------------------------------------------------------------------------
 * Genera una clase completa y creíble con 20 estudiantes ficticios, para poder
 * probar TODO sin backend: rankings, progreso, errores, mastery, dashboard y
 * la pantalla «¿dónde falló la clase?».
 *
 * Los perfiles de comportamiento están diseñados para que el panel del profesor
 * tenga algo que decir:
 *   · 3 de alto rendimiento (consistentes, casi sin pistas);
 *   · 8 de rendimiento medio;
 *   · 4 con dificultades (precisión baja, muchas pistas);
 *   · 3 con mejora progresiva (empiezan mal y acaban bien) → «Most Improved»;
 *   · 2 inactivos (se apuntaron y apenas han entrado) → alerta de inactividad.
 *
 * Todo se genera con RNG SEMILLADO: los datos son idénticos en cada recarga,
 * así que las capturas de pantalla y las pruebas son reproducibles.
 */

import { RNG, rngFor } from '../rng.js';
import { uuid } from '../utils.js';
import { splitChallenge, totalHints } from '../challenges.js';
import { conceptMastery } from '../mastery.js';
import { levelFromXp } from '../progress.js';
import { scoreChallengeAttempt, challengeXp } from '../scoring.js';

const NAMES = [
  ['Lucía', 'Martín'], ['Hugo', 'Serrano'], ['Sofía', 'Delgado'], ['Mateo', 'Ibáñez'],
  ['Martina', 'Cabrera'], ['Leo', 'Vidal'], ['Emma', 'Pastor'], ['Daniel', 'Nogales'],
  ['Valeria', 'Quintana'], ['Álvaro', 'Beltrán'], ['Carla', 'Herrera'], ['Pablo', 'Mena'],
  ['Jimena', 'Aguilar'], ['Adrián', 'Roldán'], ['Noa', 'Ferrer'], ['Bruno', 'Salas'],
  ['Elena', 'Carrasco'], ['Iker', 'Montes'], ['Alba', 'Rivas'], ['Nicolás', 'Peña'],
];

const ALIASES = [
  'Sigma42', 'BayesRunner', 'DataHunter', 'MedianaMax', 'ChiCuadrado', 'NormalCurve',
  'PvalorZen', 'BoxPlotter', 'TCLfan', 'ROCstar', 'IQRider', 'AlfaBeta',
  'Residuo7', 'CohenD', 'Youden', 'Percentil99', 'MuestraLibre', 'RhoSpear',
  'NuloNulo', 'EfectoGrande',
];

const DEGREES = ['physio', 'nursing', 'medicine', 'psychology', 'nutrition', 'pharmacy'];

const PROFILES = [
  { key: 'high', n: 3, accuracy: [0.86, 0.95], hints: [0, 1], activity: [55, 80], drift: 0, days: 26 },
  { key: 'mid', n: 8, accuracy: [0.62, 0.78], hints: [0, 2], activity: [28, 50], drift: 0.03, days: 22 },
  { key: 'struggling', n: 4, accuracy: [0.34, 0.52], hints: [1, 3], activity: [16, 34], drift: 0.02, days: 18 },
  { key: 'improving', n: 3, accuracy: [0.40, 0.55], hints: [1, 2], activity: [30, 52], drift: 0.28, days: 24 },
  { key: 'inactive', n: 2, accuracy: [0.45, 0.65], hints: [0, 2], activity: [3, 7], drift: 0, days: 3 },
];

const TEACHER_ID = 'demo-teacher-0001';
const CLASS_ID = 'demo-class-0001';

/**
 * Construye el estado completo de la demo.
 * @param {object} content  { worlds, activities, achievements, challenges }
 */
export function buildDemoData(content) {
  const rng = new RNG(20260827);
  const now = Date.now();

  /* ------------------------------------------------------------ perfiles -- */
  const teacher = {
    id: TEACHER_ID,
    first_name: 'Diego', last_name: 'Docente',
    email: 'profesor@demo.statlab', degree: null, university_id: null,
    alias: 'ProfeStat', role: 'teacher',
    created_at: iso(now - 90 * 86400000),
  };

  const students = [];
  let idx = 0;
  for (const prof of PROFILES) {
    for (let k = 0; k < prof.n; k++, idx++) {
      const [first, last] = NAMES[idx];
      students.push({
        id: `demo-student-${String(idx + 1).padStart(4, '0')}`,
        first_name: first,
        last_name: last,
        email: `${first.toLowerCase()}.${last.toLowerCase().replace(/\s/g, '')}@demo.statlab`
          .normalize('NFD').replace(/[\u0300-\u036f]/g, ''),
        degree: DEGREES[idx % DEGREES.length],
        university_id: `U${20260000 + idx * 37}`,
        alias: ALIASES[idx],
        role: 'student',
        created_at: iso(now - (30 - (idx % 5)) * 86400000),
        _profile: prof,
      });
    }
  }

  const profiles = {};
  [teacher, ...students].forEach((p) => { profiles[p.id] = p; });

  /* -------------------------------------------------------------- clase -- */
  const classes = [{
    id: CLASS_ID,
    teacher_id: TEACHER_ID,
    class_name: 'Bioestadística 1º — Demo',
    academic_year: '2025-2026',
    class_code: 'DEMO26',
    ranking_enabled: true,
    ranking_mode: 'public',
    season_best_n: 10,
    archived: false,
    created_at: iso(now - 60 * 86400000),
  }];

  const class_members = students.map((s) => ({
    id: uuid(), class_id: CLASS_ID, student_id: s.id,
    joined_at: iso(now - (50 - (students.indexOf(s) % 20)) * 86400000),
    active: true,
  }));

  /* ------------------------------------------------------------ intentos -- */
  const allActivities = content.activities;
  const attempts = [];
  const gameBest = {};

  for (const s of students) {
    const prof = s._profile;
    const rs = rngFor(`att-${s.id}`);
    const nAttempts = rs.int(prof.activity[0], prof.activity[1]);

    // Los alumnos avanzan por los mundos en orden, con distinto alcance.
    const reach = prof.key === 'high' ? 12 : prof.key === 'mid' ? 8
      : prof.key === 'improving' ? 9 : prof.key === 'struggling' ? 5 : 3;
    const pool = allActivities.filter((a) => worldNum(a.world) <= reach);

    for (let i = 0; i < nAttempts; i++) {
      const a = rs.pick(pool);
      const progressFrac = i / Math.max(1, nAttempts - 1);
      const baseAcc = rs.uniform(prof.accuracy[0], prof.accuracy[1]) + prof.drift * progressFrac;
      // Los mundos avanzados cuestan más
      const penalty = 0.035 * Math.max(0, worldNum(a.world) - 4);
      const pCorrect = clamp01(baseAcc - penalty + (a.difficulty === 1 ? 0.1 : a.difficulty === 3 ? -0.1 : 0));
      const correct = rs.bool(pCorrect);
      const partial = correct ? 1 : (rs.bool(0.35) ? rs.nice(0.25, 0.7, 2) : 0);
      const attemptNumber = correct ? (rs.bool(0.72) ? 1 : 2) : rs.int(1, 3);
      const hints = rs.int(prof.hints[0], prof.hints[1]);
      const daysAgo = Math.round((1 - progressFrac) * prof.days) + rs.uniform(0, 1.2);

      attempts.push({
        id: uuid(),
        student_id: s.id,
        class_id: CLASS_ID,
        activity_id: a.id,
        world_id: a.world,
        concept_id: a.concepts[0] || null,
        concepts: a.concepts,
        activity_type: a.type,
        difficulty: a.difficulty,
        score: correct ? 1 : partial,
        correct,
        attempt_number: attemptNumber,
        hints_used: hints,
        time_seconds: rs.int(35, 210),
        xp_earned: correct ? Math.round((a.xp || 10) * (1 - 0.15 * hints)) : Math.round((a.xp || 10) * partial * 0.4),
        source: rs.weighted(['campaign', 'practice', 'quick', 'assignment'], [5, 3, 2, 2]),
        created_at: iso(now - daysAgo * 86400000),
      });
    }

    gameBest[s.id] = {
      'sampling-simulator': rs.bool(0.5) ? 1000 : rs.int(100, 800),
      'chart-hospital': rs.int(2, 12),
      'variable-classifier': rs.int(4, 24),
    };
  }

  /* ------------------------------------------------------------- retos --- */
  const challenges = [];
  const challenge_attempts = [];
  const challenge_steps = [];
  const bonuses = [];

  const templates = content.challenges;
  templates.forEach((tpl, i) => {
    const { configuration, solution } = splitChallenge(tpl);
    // Reto 1 y 2 cerrados (con solución disponible), reto 3 abierto ahora.
    const isOpen = i === templates.length - 1;
    const opens = now - (isOpen ? 2 : (templates.length - i) * 7) * 86400000;
    const closes = isOpen ? now + 5 * 86400000 : opens + 6.5 * 86400000;

    challenges.push({
      id: `demo-challenge-${i + 1}`,
      class_id: CLASS_ID,
      teacher_id: TEACHER_ID,
      number: i + 1,
      title: tpl.title,
      description: tpl.description,
      challenge_type: tpl.type,
      world_id: tpl.world,
      concepts: tpl.concepts || [],
      difficulty: tpl.difficulty ?? 2,
      configuration,
      solution,
      builtin_template: tpl.id,
      opens_at: iso(opens),
      closes_at: iso(closes),
      recommended_seconds: (tpl.recommendedMinutes || 12) * 60,
      max_attempts: tpl.maxAttempts ?? 3,
      competitive_attempts: tpl.competitivePolicy || 'first',
      allow_hints: tpl.allowHints !== false,
      solution_policy: tpl.solutionPolicy || 'on_close',
      solution_available_at: null,
      show_ranking: tpl.showRanking !== false,
      counts_for_season: tpl.countsForSeason !== false,
      scoring_config: {},
      published: true,
      created_at: iso(opens - 2 * 86400000),
    });
  });

  // Intentos de reto: solo en los retos ya cerrados (los dos primeros).
  for (const ch of challenges.filter((c) => new Date(c.closes_at).getTime() < now)) {
    const steps = ch.solution.steps;
    const hintsAvailable = totalHints(steps);
    const chIndex = ch.number;

    for (const s of students) {
      const rs = rngFor(`ch-${ch.id}-${s.id}`);
      const prof = s._profile;
      if (prof.key === 'inactive' && rs.bool(0.7)) continue;             // no participan
      if (prof.key === 'struggling' && rs.bool(0.25)) continue;

      const improveBoost = prof.key === 'improving' ? 0.22 * (chIndex - 1) : 0;
      const baseAcc = clamp01(rs.uniform(prof.accuracy[0], prof.accuracy[1]) + improveBoost);
      const attemptId = uuid();
      const stepResults = [];
      let errors = 0, hintsUsed = 0;

      steps.forEach((st, si) => {
        const weight = st.weight ?? 1;
        const correct = rs.bool(clamp01(baseAcc - 0.03 * si));
        const score = correct ? 1 : (rs.bool(0.5) ? rs.nice(0.3, 0.75, 2) : 0);
        const stepErrors = correct ? 0 : rs.int(0, 2);
        const stepHints = ch.allow_hints ? Math.min(st.hints?.length || 0, rs.int(prof.hints[0], prof.hints[1])) : 0;
        errors += stepErrors;
        hintsUsed += stepHints;
        stepResults.push({ id: st.id, score, weight, errors: stepErrors, hintsUsed: stepHints });
        challenge_steps.push({
          id: uuid(), attempt_id: attemptId, step_id: st.id, step_index: si,
          concept_id: st.concept || null, weight, score, correct: score >= 0.999,
          errors: stepErrors, hints_used: stepHints,
          time_seconds: rs.int(30, 180), answer: null,
          answered_at: iso(new Date(ch.opens_at).getTime() + rs.int(1, 5) * 86400000),
        });
      });

      const refSeconds = ch.recommended_seconds;
      const speed = prof.key === 'high' ? rs.uniform(0.55, 0.95)
        : prof.key === 'mid' ? rs.uniform(0.7, 1.3)
          : rs.uniform(0.95, 1.9);
      const activeSeconds = Math.round(refSeconds * speed);

      const scored = scoreChallengeAttempt({
        steps: stepResults, errors, hintsUsed, hintsAvailable,
        activeSeconds, referenceSeconds: refSeconds,
      });

      const completedAt = new Date(ch.opens_at).getTime() + rs.uniform(0.5, 6) * 86400000;
      challenge_attempts.push({
        id: attemptId,
        challenge_id: ch.id,
        student_id: s.id,
        attempt_number: 1,
        started_at: iso(completedAt - activeSeconds * 1000),
        completed_at: iso(completedAt),
        active_time_seconds: activeSeconds,
        score: scored.components.accuracy.fraction,
        challenge_points: scored.total,
        points_breakdown: scored.components,
        xp_earned: challengeXp(scored),
        errors, hints_used: hintsUsed,
        completed: true, first_attempt: true, rank_eligible: true, practice_mode: false,
        created_at: iso(completedAt - activeSeconds * 1000),
      });
    }

    // Bonus de XP a los tres primeros
    const ranking = challenge_attempts
      .filter((a) => a.challenge_id === ch.id && a.rank_eligible)
      .sort((a, b) => b.challenge_points - a.challenge_points || a.active_time_seconds - b.active_time_seconds);
    [100, 75, 50].forEach((xp, i) => {
      if (ranking[i]) {
        bonuses.push({
          id: uuid(), challenge_id: ch.id, student_id: ranking[i].student_id,
          position: i + 1, kind: 'rank', xp, awarded_at: ch.closes_at,
        });
      }
    });
  }

  /* --------------------------------------------------- progreso y mastery -- */
  const progress = {};
  const mastery = {};

  for (const s of students) {
    const own = attempts.filter((a) => a.student_id === s.id);
    const ownCh = challenge_attempts.filter((a) => a.student_id === s.id);
    const xp = own.reduce((t, a) => t + a.xp_earned, 0)
      + ownCh.reduce((t, a) => t + a.xp_earned, 0)
      + bonuses.filter((b) => b.student_id === s.id).reduce((t, b) => t + b.xp, 0);
    const lvl = levelFromXp(xp);

    const dates = Array.from(new Set(own.map((a) => a.created_at.slice(0, 10)))).sort();
    const streak = s._profile.key === 'inactive' ? 0 : streakFromDates(dates, now);

    progress[s.id] = {
      student_id: s.id,
      xp,
      level: lvl.level,
      streak_days: streak,
      longest_streak: Math.max(streak, s._profile.key === 'high' ? 11 : 5),
      last_active_date: dates.length ? dates[dates.length - 1] : null,
      total_time_seconds: own.reduce((t, a) => t + a.time_seconds, 0),
      activities_completed: own.filter((a) => a.correct).length,
      challenges_completed: ownCh.length,
      current_world: currentWorld(own),
      last_activity_id: own.length ? own[own.length - 1].activity_id : null,
      updated_at: iso(now),
    };

    // Mastery por concepto, con la fórmula real
    const byConcept = new Map();
    for (const a of own.slice().sort((x, y) => new Date(x.created_at) - new Date(y.created_at))) {
      for (const c of a.concepts) {
        if (!byConcept.has(c)) byConcept.set(c, []);
        byConcept.get(c).push({
          correct: a.correct, partial: a.score, attempts: a.attempt_number,
          hintsUsed: a.hints_used, difficulty: a.difficulty,
        });
      }
    }
    mastery[s.id] = {};
    for (const [c, rows] of byConcept) {
      const m = conceptMastery(rows);
      mastery[s.id][c] = {
        student_id: s.id, concept_id: c, mastery: m.value,
        n_responses: m.n, last_correct: rows[rows.length - 1].correct,
        updated_at: iso(now),
      };
    }
  }

  /* ------------------------------------------------------------- logros --- */
  const student_achievements = [];
  for (const s of students) {
    const rs = rngFor(`ach-${s.id}`);
    const codes = ['first-steps'];
    if (s._profile.key === 'high') codes.push('world-1-clear', 'typology', 'perfect-run', 'unaided', 'consistency');
    if (s._profile.key === 'mid' && rs.bool(0.6)) codes.push('world-1-clear', 'bayes-thinker');
    if (s._profile.key === 'improving') codes.push('most-improved', 'comeback', 'world-1-clear');
    if (rs.bool(0.4)) codes.push('clt-witness');
    if (rs.bool(0.25)) codes.push('not-causal');
    for (const code of Array.from(new Set(codes))) {
      student_achievements.push({
        id: uuid(), student_id: s.id, achievement_code: code,
        earned_at: iso(now - rs.uniform(1, 25) * 86400000), context: null,
      });
    }
  }

  /* ----------------------------------------------------------- tareas ---- */
  const assignments = [
    {
      id: 'demo-assign-1', class_id: CLASS_ID, teacher_id: TEACHER_ID,
      title: 'Tipos de variables — repaso obligatorio',
      description: 'Antes del seminario del jueves. Ocho ejercicios del Mundo 2.',
      world_id: 'w02', concepts: ['nominal-ordinal', 'discreta-continua'],
      difficulty: 2, n_exercises: 8, max_attempts: 3, feedback_mode: 'immediate',
      opens_at: iso(now - 6 * 86400000), due_at: iso(now + 2 * 86400000),
      published: true, created_at: iso(now - 7 * 86400000),
    },
    {
      id: 'demo-assign-2', class_id: CLASS_ID, teacher_id: TEACHER_ID,
      title: 'Elección de pruebas — práctica guiada',
      description: 'Diez escenarios del Mundo 10. Justifica cada elección.',
      world_id: 'w10', concepts: ['parametrica-no', 'independientes-relacionadas'],
      difficulty: 3, n_exercises: 10, max_attempts: 2, feedback_mode: 'after',
      opens_at: iso(now + 1 * 86400000), due_at: iso(now + 9 * 86400000),
      published: true, created_at: iso(now - 2 * 86400000),
    },
    {
      id: 'demo-assign-3', class_id: CLASS_ID, teacher_id: TEACHER_ID,
      title: 'Borrador: pruebas diagnósticas',
      description: 'Pendiente de decidir fechas.',
      world_id: 'w13', concepts: ['vpp', 'sensibilidad'],
      difficulty: 3, n_exercises: 6, max_attempts: 3, feedback_mode: 'immediate',
      opens_at: null, due_at: null,
      published: false, created_at: iso(now - 1 * 86400000),
    },
  ];

  const assignment_progress = [];
  for (const s of students) {
    const rs = rngFor(`ap-${s.id}`);
    if (rs.bool(s._profile.key === 'inactive' ? 0.15 : 0.75)) {
      const done = rs.int(2, 8);
      assignment_progress.push({
        id: uuid(), assignment_id: 'demo-assign-1', student_id: s.id,
        completed_count: done, correct_count: Math.round(done * rs.uniform(0.4, 0.95)),
        score: rs.nice(0.4, 1, 2), time_seconds: rs.int(300, 1500),
        completed_at: done >= 8 ? iso(now - rs.uniform(1, 5) * 86400000) : null,
        updated_at: iso(now),
      });
    }
  }

  // Quien juega la demo como estudiante es el primero de la lista (alto rendimiento)
  const demoStudentId = students[0].id;

  return {
    version: 3,
    profiles, classes, class_members, attempts,
    progress, mastery, student_achievements,
    assignments, assignment_progress,
    challenges, challenge_attempts, challenge_steps, bonuses,
    gameBest, sessions: [],
    demoStudentId, demoTeacherId: TEACHER_ID, demoClassId: CLASS_ID,
  };
}

/* ------------------------------------------------------------ utilidades -- */

const iso = (ms) => new Date(ms).toISOString();
const clamp01 = (x) => Math.min(1, Math.max(0, x));
const worldNum = (id) => Number(String(id || 'w01').replace('w', '')) || 1;

function currentWorld(own) {
  if (!own.length) return 'w01';
  const maxW = own.reduce((m, a) => Math.max(m, worldNum(a.world_id)), 1);
  return `w${String(Math.min(15, maxW)).padStart(2, '0')}`;
}

function streakFromDates(dates, now) {
  if (!dates.length) return 0;
  const set = new Set(dates);
  let streak = 0;
  for (let i = 0; i < 40; i++) {
    const d = new Date(now - i * 86400000).toISOString().slice(0, 10);
    if (set.has(d)) streak++;
    else if (i > 0) break;
  }
  return streak;
}
