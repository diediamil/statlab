/**
 * STATLAB — implementación DEMO de la capa de datos
 * ---------------------------------------------------------------------------
 * Reproduce la interfaz completa del store usando localStorage. Permite:
 *   · probar la aplicación entera sin Supabase (`?demo=1` o sin config.js);
 *   · alternar entre la vista de ESTUDIANTE y la de PROFESOR;
 *   · trabajar con 20 estudiantes ficticios y resultados de retos ya jugados.
 *
 * Los datos se guardan SOLO en el navegador de quien lo usa. No hay red.
 * Si localStorage no está disponible (navegación privada muy restrictiva) se
 * degrada a memoria: la demo sigue funcionando, pero no persiste.
 */

import { getWorlds, getAllActivities, getAchievements, getBuiltInChallenges } from '../content.js';
import { buildDemoData } from './demoSeed.js';
import { uuid, nowIso, todayKey, sortBy, desc, groupBy } from '../utils.js';
import { conceptMastery, computeAllMastery, conceptsToReview } from '../mastery.js';
import { levelFromXp, updateStreak, activityXp, evaluateAchievements, buildStudentContext, worldStates } from '../progress.js';
import { scoreChallengeAttempt, challengeXp, rankBonusXp } from '../scoring.js';
import { isRankEligible, solutionAvailable, challengeState, totalHints } from '../challenges.js';

const KEY = 'statlab.demo.v3';
const ROLE_KEY = 'statlab.demo.role';

export async function createDemoStore() {
  const content = {
    worlds: await getWorlds(),
    activities: await getAllActivities(),
    achievements: await getAchievements(),
    challenges: await getBuiltInChallenges(),
  };

  let memoryOnly = false;
  let data = load();

  if (!data || data.version !== 3) {
    data = buildDemoData(content);
    save();
  }

  let actingRole = readRole();

  function load() {
    try {
      const raw = localStorage.getItem(KEY);
      return raw ? JSON.parse(raw) : null;
    } catch { memoryOnly = true; return null; }
  }
  function save() {
    if (memoryOnly) return;
    try { localStorage.setItem(KEY, JSON.stringify(data)); }
    catch { memoryOnly = true; }
  }
  function readRole() {
    try { return localStorage.getItem(ROLE_KEY) || 'student'; } catch { return 'student'; }
  }
  function writeRole(r) {
    actingRole = r;
    try { localStorage.setItem(ROLE_KEY, r); } catch { /* ignorado */ }
  }

  // Se relee el rol en cada acceso: así un cambio hecho en otra pestaña (o
  // directamente en localStorage) se refleja sin necesidad de recargar.
  const me = () => {
    actingRole = readRole();
    return actingRole === 'teacher'
      ? data.profiles[data.demoTeacherId]
      : data.profiles[data.demoStudentId];
  };

  const authListeners = new Set();
  const notifyAuth = () => authListeners.forEach((fn) => fn(publicProfile(me())));

  const publicProfile = (p) => (p ? { ...p, _profile: undefined } : null);

  /* ===================================================== autenticación == */

  const api = {
    /* ---- demo específico -------------------------------------------- */
    isDemo: () => true,
    demoRole: () => actingRole,
    async setDemoRole(role) {
      writeRole(role === 'teacher' ? 'teacher' : 'student');
      notifyAuth();
      return publicProfile(me());
    },
    async resetDemo() {
      data = buildDemoData(content);
      save();
      notifyAuth();
      return true;
    },

    /* ---- autenticación ---------------------------------------------- */
    async currentUser() { return publicProfile(me()); },

    onAuthChange(fn) { authListeners.add(fn); return () => authListeners.delete(fn); },

    async signIn({ email }) {
      // En demo cualquier credencial entra; el correo del profesor abre el panel docente.
      const isTeacher = /profe|teacher|docente/i.test(email || '');
      writeRole(isTeacher ? 'teacher' : 'student');
      notifyAuth();
      return publicProfile(me());
    },

    async signUp(payload) {
      // Se crea un perfil real en la demo y se convierte en el «yo» del alumno.
      const id = `demo-student-${uuid().slice(0, 8)}`;
      data.profiles[id] = {
        id,
        first_name: payload.firstName || 'Alumna',
        last_name: payload.lastName || 'Demo',
        email: payload.email,
        degree: payload.degree || null,
        university_id: payload.universityId || null,
        alias: payload.alias || `Demo${Object.keys(data.profiles).length}`,
        role: 'student',
        created_at: nowIso(),
      };
      data.progress[id] = {
        student_id: id, xp: 0, level: 1, streak_days: 0, longest_streak: 0,
        last_active_date: null, total_time_seconds: 0, activities_completed: 0,
        challenges_completed: 0, current_world: 'w01', last_activity_id: null, updated_at: nowIso(),
      };
      data.mastery[id] = {};
      data.demoStudentId = id;
      writeRole('student');
      save();
      notifyAuth();
      return publicProfile(data.profiles[id]);
    },

    async signOut() { notifyAuth(); return true; },
    async resetPassword() { return true; },

    async updateProfile(patch) {
      const p = me();
      const allowed = ['first_name', 'last_name', 'degree', 'university_id', 'alias', 'locale'];
      for (const k of allowed) if (k in patch) p[k] = patch[k];
      save();
      notifyAuth();
      return publicProfile(p);
    },

    async aliasAvailable(alias) {
      const taken = Object.values(data.profiles)
        .some((p) => p.id !== me().id && (p.alias || '').toLowerCase() === String(alias).toLowerCase());
      return !taken;
    },

    /* ======================================================== clases === */

    async listMyClasses() {
      const p = me();
      if (p.role === 'teacher') return data.classes.filter((c) => c.teacher_id === p.id);
      return [];
    },

    async listMyEnrolments() {
      const p = me();
      const ids = data.class_members.filter((m) => m.student_id === p.id && m.active).map((m) => m.class_id);
      return data.classes.filter((c) => ids.includes(c.id));
    },

    async createClass({ className, academicYear, rankingEnabled = true, seasonBestN = 10 }) {
      const c = {
        id: uuid(),
        teacher_id: me().id,
        class_name: className,
        academic_year: academicYear || '2025-2026',
        class_code: randomCode(),
        ranking_enabled: rankingEnabled,
        ranking_mode: 'public',
        season_best_n: seasonBestN,
        archived: false,
        created_at: nowIso(),
      };
      data.classes.push(c);
      save();
      return c;
    },

    async updateClass(id, patch) {
      const c = data.classes.find((x) => x.id === id);
      if (!c) throw new Error('Clase no encontrada');
      Object.assign(c, patch);
      save();
      return c;
    },

    async regenerateClassCode(id) {
      const c = data.classes.find((x) => x.id === id);
      c.class_code = randomCode();
      save();
      return c.class_code;
    },

    async deleteClass(id) {
      data.classes = data.classes.filter((c) => c.id !== id);
      data.class_members = data.class_members.filter((m) => m.class_id !== id);
      save();
      return true;
    },

    async joinClassByCode(code) {
      const c = data.classes.find((x) => x.class_code.toUpperCase() === String(code).trim().toUpperCase());
      if (!c) { const e = new Error('CODIGO_NO_VALIDO'); e.code = 'CODIGO_NO_VALIDO'; throw e; }
      const already = data.class_members.find((m) => m.class_id === c.id && m.student_id === me().id);
      if (already) { already.active = true; save(); return c; }
      data.class_members.push({ id: uuid(), class_id: c.id, student_id: me().id, joined_at: nowIso(), active: true });
      save();
      return c;
    },

    async listClassMembers(classId) {
      const ids = data.class_members.filter((m) => m.class_id === classId && m.active).map((m) => m.student_id);
      return ids.map((id) => {
        const p = publicProfile(data.profiles[id]);
        const pr = data.progress[id] || {};
        const own = data.attempts.filter((a) => a.student_id === id);
        const mast = Object.values(data.mastery[id] || {});
        return {
          ...p,
          progress: pr,
          attempts: own.length,
          accuracy: own.length ? own.filter((a) => a.correct).length / own.length : 0,
          firstTryAccuracy: own.length
            ? own.filter((a) => a.correct && a.attempt_number === 1).length / own.length : 0,
          meanMastery: mast.length ? mast.reduce((s, m) => s + m.mastery, 0) / mast.length : 0,
          lastActive: pr.last_active_date || null,
        };
      });
    },

    /* ==================================================== actividades === */

    async recordAttempt(attempt) {
      const p = me();
      const enrolments = data.class_members.filter((m) => m.student_id === p.id && m.active);
      const row = {
        id: uuid(),
        student_id: p.id,
        class_id: attempt.classId || enrolments[0]?.class_id || null,
        activity_id: attempt.activityId || attempt.itemId || null,
        world_id: attempt.world || null,
        concept_id: attempt.concept || (attempt.concepts || [])[0] || null,
        concepts: attempt.concepts || [],
        activity_type: attempt.type || null,
        difficulty: attempt.difficulty ?? 1,
        score: attempt.score ?? 0,
        correct: !!attempt.correct,
        attempt_number: attempt.attempts ?? 1,
        hints_used: attempt.hintsUsed ?? 0,
        time_seconds: attempt.timeSeconds ?? 0,
        xp_earned: 0,
        seed: attempt.seed || null,
        answer: null,                                   // en demo no se guardan respuestas
        source: attempt.source || 'practice',
        assignment_id: attempt.assignmentId || null,
        created_at: nowIso(),
      };

      const xp = activityXp({ xp: attempt.xpBase ?? 10, difficulty: row.difficulty }, {
        correct: row.correct, score: row.score, attempts: row.attempt_number, hintsUsed: row.hints_used,
      });
      row.xp_earned = xp;
      data.attempts.push(row);

      // Progreso, racha y mastery
      const pr = data.progress[p.id] || (data.progress[p.id] = emptyProgress(p.id));
      const streak = updateStreak(pr);
      pr.xp += xp + streak.bonusXp;
      pr.level = levelFromXp(pr.xp).level;
      pr.streak_days = streak.streak;
      pr.longest_streak = Math.max(pr.longest_streak || 0, streak.streak);
      pr.last_active_date = streak.date;
      pr.total_time_seconds += row.time_seconds;
      if (row.correct) pr.activities_completed += 1;
      pr.current_world = row.world_id || pr.current_world;
      pr.last_activity_id = row.activity_id;
      pr.updated_at = nowIso();

      updateMasteryFor(p.id, row);
      save();

      return { attempt: row, xpEarned: xp, streakBonus: streak.bonusXp, streak: streak.streak, level: pr.level };
    },

    async listAttempts({ studentId = null, classId = null, since = null, limit = 500 } = {}) {
      const id = studentId || me().id;
      let rows = data.attempts.filter((a) => a.student_id === id);
      if (classId) rows = rows.filter((a) => a.class_id === classId);
      if (since) rows = rows.filter((a) => a.created_at >= since);
      return sortBy(rows, desc((a) => a.created_at)).slice(0, limit);
    },

    async listClassAttempts(classId, { since = null } = {}) {
      const ids = data.class_members.filter((m) => m.class_id === classId).map((m) => m.student_id);
      let rows = data.attempts.filter((a) => ids.includes(a.student_id));
      if (since) rows = rows.filter((a) => a.created_at >= since);
      return rows;
    },

    async getProgress(studentId = null) {
      const id = studentId || me().id;
      return data.progress[id] || emptyProgress(id);
    },

    async getMastery(studentId = null) {
      const id = studentId || me().id;
      const rows = Object.values(data.mastery[id] || {});
      const map = new Map();
      for (const r of rows) {
        map.set(r.concept_id, {
          value: r.mastery, n: r.n_responses,
          level: null, raw: null, shrink: null, evidence: r.n_responses,
        });
      }
      return map;
    },

    async recordGameScore(gameId, points) {
      const id = me().id;
      data.gameBest[id] = data.gameBest[id] || {};
      data.gameBest[id][gameId] = Math.max(data.gameBest[id][gameId] || 0, points || 0);
      save();
      return data.gameBest[id][gameId];
    },

    async getGameBest(studentId = null) {
      const id = studentId || me().id;
      return new Map(Object.entries(data.gameBest[id] || {}));
    },

    async touchSession(seconds, context = null) {
      const id = me().id;
      data.sessions.push({ id: uuid(), student_id: id, started_at: nowIso(), ended_at: nowIso(), active_seconds: seconds, context });
      const pr = data.progress[id];
      if (pr) { pr.total_time_seconds += seconds; }
      save();
      return true;
    },

    /* ======================================================== logros === */

    async listAchievements() { return content.achievements; },

    async listStudentAchievements(studentId = null) {
      const id = studentId || me().id;
      return data.student_achievements.filter((a) => a.student_id === id);
    },

    async awardAchievement(code, context = null) {
      const id = me().id;
      if (data.student_achievements.some((a) => a.student_id === id && a.achievement_code === code)) return null;
      const row = { id: uuid(), student_id: id, achievement_code: code, earned_at: nowIso(), context };
      data.student_achievements.push(row);
      const ach = content.achievements.find((a) => a.code === code);
      if (ach?.xp && data.progress[id]) {
        data.progress[id].xp += ach.xp;
        data.progress[id].level = levelFromXp(data.progress[id].xp).level;
      }
      save();
      return row;
    },

    /** Evalúa y concede los logros pendientes. Devuelve los nuevos. */
    async syncAchievements() {
      const id = me().id;
      const attempts = data.attempts.filter((a) => a.student_id === id);
      const masteryMap = await api.getMastery(id);
      const ws = worldStates(await worldsWithCounts(), {
        activityResults: attempts.map((a) => ({ ...a, world: a.world_id })),
        masteryMap,
      });
      const ctx = buildStudentContext({
        attempts, masteryMap, worldStates: ws,
        progress: data.progress[id],
        challengeAttempts: data.challenge_attempts.filter((a) => a.student_id === id),
        gameBest: await api.getGameBest(id),
      });
      const earned = data.student_achievements.filter((a) => a.student_id === id).map((a) => a.achievement_code);
      const newly = evaluateAchievements(content.achievements, ctx, earned);
      for (const a of newly) await api.awardAchievement(a.code);
      return newly;
    },

    /* ==================================================== asignaciones == */

    async listAssignments({ classId = null } = {}) {
      let rows = data.assignments;
      if (classId) rows = rows.filter((a) => a.class_id === classId);
      if (me().role !== 'teacher') rows = rows.filter((a) => a.published);
      return sortBy(rows, (a) => a.due_at || '9999');
    },

    async listMyAssignments() {
      const ids = data.class_members.filter((m) => m.student_id === me().id && m.active).map((m) => m.class_id);
      const rows = data.assignments.filter((a) => ids.includes(a.class_id) && a.published);
      const mine = data.assignment_progress.filter((p) => p.student_id === me().id);
      return rows.map((a) => ({ ...a, myProgress: mine.find((p) => p.assignment_id === a.id) || null }));
    },

    async createAssignment(a) {
      const row = {
        id: uuid(), teacher_id: me().id, created_at: nowIso(), published: false,
        concepts: [], n_exercises: 5, max_attempts: 3, feedback_mode: 'immediate', ...a,
      };
      data.assignments.push(row);
      save();
      return row;
    },

    async updateAssignment(id, patch) {
      const a = data.assignments.find((x) => x.id === id);
      Object.assign(a, patch);
      save();
      return a;
    },

    async deleteAssignment(id) {
      data.assignments = data.assignments.filter((a) => a.id !== id);
      save();
      return true;
    },

    async listAssignmentProgress(assignmentId) {
      return data.assignment_progress.filter((p) => p.assignment_id === assignmentId);
    },

    /* ========================================================= retos === */

    async listChallenges({ classId = null, onlyPublished = false } = {}) {
      let rows = data.challenges;
      if (classId) rows = rows.filter((c) => c.class_id === classId);
      if (onlyPublished || me().role !== 'teacher') rows = rows.filter((c) => c.published);
      return sortBy(rows, desc((c) => c.opens_at)).map(publicChallenge);
    },

    async listMyChallenges() {
      const ids = data.class_members.filter((m) => m.student_id === me().id && m.active).map((m) => m.class_id);
      const rows = data.challenges.filter((c) => ids.includes(c.class_id) && c.published);
      return sortBy(rows, desc((c) => c.opens_at)).map(publicChallenge);
    },

    async getChallenge(id) {
      const c = data.challenges.find((x) => x.id === id);
      if (!c) return null;
      return me().role === 'teacher' ? { ...c } : publicChallenge(c);
    },

    async getChallengeSolution(id) {
      const c = data.challenges.find((x) => x.id === id);
      if (!c) throw new Error('Reto no encontrado');
      if (me().role === 'teacher') return c.solution;
      if (!solutionAvailable(c)) { const e = new Error('SOLUCION_NO_DISPONIBLE'); e.code = 'SOLUCION_NO_DISPONIBLE'; throw e; }
      return c.solution;
    },

    async createChallenge(payload) {
      const row = {
        id: uuid(),
        teacher_id: me().id,
        created_at: nowIso(),
        published: false,
        scoring_config: {},
        solution_available_at: null,
        ...payload,
      };
      data.challenges.push(row);
      save();
      return publicChallenge(row);
    },

    async updateChallenge(id, patch) {
      const c = data.challenges.find((x) => x.id === id);
      Object.assign(c, patch);
      save();
      return publicChallenge(c);
    },

    async deleteChallenge(id) {
      data.challenges = data.challenges.filter((c) => c.id !== id);
      data.challenge_attempts = data.challenge_attempts.filter((a) => a.challenge_id !== id);
      save();
      return true;
    },

    async publishSolution(id) {
      const c = data.challenges.find((x) => x.id === id);
      c.solution_policy = 'manual';
      c.solution_available_at = nowIso();
      save();
      return true;
    },

    /** Inicia un intento. Valida ventana y política, igual que el servidor. */
    async startChallengeAttempt(challengeId) {
      const c = data.challenges.find((x) => x.id === challengeId);
      if (!c || !c.published) throw new Error('Reto no disponible');
      const st = challengeState(c);
      if (st === 'upcoming') throw new Error('El reto todavía no está abierto');

      const mine = data.challenge_attempts.filter((a) => a.challenge_id === challengeId && a.student_id === me().id);
      if (mine.length >= c.max_attempts) throw new Error('Has agotado los intentos de este reto');

      const practice = st === 'closed';
      const eligible = isRankEligible({
        policy: c.competitive_attempts, previousAttempts: mine.length, practice,
      });

      const att = {
        id: uuid(),
        challenge_id: challengeId,
        student_id: me().id,
        attempt_number: mine.length + 1,
        started_at: nowIso(),
        completed_at: null,
        active_time_seconds: 0,
        score: 0, challenge_points: 0, points_breakdown: {}, xp_earned: 0,
        errors: 0, hints_used: 0,
        completed: false,
        first_attempt: mine.length === 0,
        rank_eligible: eligible,
        practice_mode: practice,
        created_at: nowIso(),
      };
      data.challenge_attempts.push(att);
      save();
      return {
        attempt_id: att.id, attempt_number: att.attempt_number,
        rank_eligible: att.rank_eligible, practice_mode: att.practice_mode,
        started_at: att.started_at,
        recommended_seconds: c.recommended_seconds,
        allow_hints: c.allow_hints,
        configuration: c.configuration,
      };
    },

    /**
     * Corrige y guarda un paso. En la demo la corrección es local (no hay
     * servidor), pero la INTERFAZ es idéntica a la del RPC de Supabase, así
     * que la vista del reto no distingue un modo del otro.
     */
    async submitChallengeStep(attemptId, stepId, answer, { errors = 0, hints = 0, seconds = 0 } = {}) {
      const att = data.challenge_attempts.find((a) => a.id === attemptId);
      if (!att || att.student_id !== me().id) throw new Error('Intento no encontrado');
      if (att.completed) throw new Error('El intento ya está cerrado');
      const ch = data.challenges.find((c) => c.id === att.challenge_id);
      const idx = ch.solution.steps.findIndex((s) => s.id === stepId);
      const step = ch.solution.steps[idx];
      if (!step) throw new Error('Paso desconocido');

      const score = gradeStepLocally(step, answer);

      const existing = data.challenge_steps.find((s) => s.attempt_id === attemptId && s.step_id === stepId);
      if (existing) {
        existing.score = score;
        existing.correct = score >= 0.999;
        existing.errors += errors;
        existing.hints_used = Math.max(existing.hints_used, hints);
        existing.time_seconds = seconds;
        existing.answer = answer;
        existing.answered_at = nowIso();
      } else {
        data.challenge_steps.push({
          id: uuid(), attempt_id: attemptId, step_id: stepId, step_index: idx,
          concept_id: step.concept || null, weight: step.weight ?? 1,
          score, correct: score >= 0.999, errors, hints_used: hints,
          time_seconds: seconds, answer, answered_at: nowIso(),
        });
      }
      save();
      return {
        score, correct: score >= 0.999,
        explanation: solutionAvailable(ch) ? step.explanation : null,
      };
    },

    async finishChallengeAttempt(attemptId, activeSeconds) {
      const att = data.challenge_attempts.find((a) => a.id === attemptId);
      if (!att) throw new Error('Intento no encontrado');
      if (att.completed) return att.points_breakdown;
      const ch = data.challenges.find((c) => c.id === att.challenge_id);
      const steps = data.challenge_steps.filter((s) => s.attempt_id === attemptId);

      const scored = scoreChallengeAttempt({
        steps: steps.map((s) => ({ score: s.score, weight: s.weight, errors: s.errors, hintsUsed: s.hints_used })),
        activeSeconds,
        referenceSeconds: ch.recommended_seconds,
        hintsAvailable: ch.allow_hints ? totalHints(ch.solution.steps) : 0,
      }, { ...defaultScoring(), ...(ch.scoring_config || {}) });

      att.completed = true;
      att.completed_at = nowIso();
      att.active_time_seconds = activeSeconds;
      att.score = scored.components.accuracy.fraction;
      att.challenge_points = scored.total;
      att.points_breakdown = scored.components;
      att.errors = scored.components.efficiency.errors;
      att.hints_used = scored.components.hints.used;
      att.xp_earned = challengeXp(scored);

      const pr = data.progress[att.student_id];
      if (pr) {
        pr.xp += att.xp_earned;
        pr.level = levelFromXp(pr.xp).level;
        pr.challenges_completed += 1;
        pr.updated_at = nowIso();
      }

      // Bonus de posición si el reto ya está cerrado
      if (challengeState(ch) === 'closed') awardRankBonuses(ch.id);

      save();
      return { ...scored, attempt: att };
    },

    async myChallengeAttempts(challengeId = null) {
      let rows = data.challenge_attempts.filter((a) => a.student_id === me().id);
      if (challengeId) rows = rows.filter((a) => a.challenge_id === challengeId);
      return sortBy(rows, desc((a) => a.created_at));
    },

    async listChallengeAttempts(challengeId) {
      return data.challenge_attempts.filter((a) => a.challenge_id === challengeId);
    },

    async listChallengeSteps(attemptId) {
      return sortBy(data.challenge_steps.filter((s) => s.attempt_id === attemptId), (s) => s.step_index);
    },

    /* ====================================================== rankings === */

    async weeklyRanking(challengeId) {
      const ch = data.challenges.find((c) => c.id === challengeId);
      if (!ch) return [];
      const rows = data.challenge_attempts
        .filter((a) => a.challenge_id === challengeId && a.completed && a.rank_eligible && !a.practice_mode);
      const best = new Map();
      for (const a of rows) {
        const prev = best.get(a.student_id);
        if (!prev || a.challenge_points > prev.challenge_points) best.set(a.student_id, a);
      }
      const sorted = Array.from(best.values())
        .sort((a, b) => b.challenge_points - a.challenge_points || a.active_time_seconds - b.active_time_seconds);
      return sorted.map((a, i) => ({
        position: i + 1,
        alias: data.profiles[a.student_id]?.alias || 'Anónimo',
        challenge_points: a.challenge_points,
        active_time_seconds: a.active_time_seconds,
        errors: a.errors,
        hints_used: a.hints_used,
        perfect_run: a.errors === 0 && a.score >= 0.9999,
        student_id: a.student_id,
        isMe: a.student_id === me().id,
      }));
    },

    async seasonalRanking(classId) {
      const cls = data.classes.find((c) => c.id === classId);
      const bestN = cls?.season_best_n || 10;
      const chIds = data.challenges
        .filter((c) => c.class_id === classId && c.counts_for_season && c.published)
        .map((c) => c.id);
      const rows = data.challenge_attempts
        .filter((a) => chIds.includes(a.challenge_id) && a.completed && a.rank_eligible && !a.practice_mode);

      const byStudent = groupBy(rows, (a) => a.student_id);
      const out = [];
      for (const [studentId, list] of byStudent) {
        // mejor intento por reto
        const bestPerChallenge = new Map();
        for (const a of list) {
          const prev = bestPerChallenge.get(a.challenge_id);
          if (!prev || a.challenge_points > prev) bestPerChallenge.set(a.challenge_id, a.challenge_points);
        }
        const points = Array.from(bestPerChallenge.values()).sort((a, b) => b - a);
        const counted = points.slice(0, bestN);
        out.push({
          student_id: studentId,
          alias: data.profiles[studentId]?.alias || 'Anónimo',
          total_points: counted.reduce((s, x) => s + x, 0),
          challenges_counted: counted.length,
          challenges_done: points.length,
          avg_points: points.length ? Math.round(points.reduce((s, x) => s + x, 0) / points.length) : 0,
          isMe: studentId === me().id,
        });
      }
      return out.sort((a, b) => b.total_points - a.total_points)
        .map((r, i) => ({ ...r, position: i + 1 }));
    },

    async mostImproved(classId) {
      const chIds = data.challenges.filter((c) => c.class_id === classId).map((c) => c.id);
      const rows = sortBy(
        data.challenge_attempts.filter((a) => chIds.includes(a.challenge_id) && a.completed && a.rank_eligible),
        (a) => a.completed_at,
      );
      const byStudent = groupBy(rows, (a) => a.student_id);
      const out = [];
      for (const [id, list] of byStudent) {
        if (list.length < 2) continue;
        const latest = list[list.length - 1];
        const prev = list.slice(0, -1);
        const prevAvg = prev.reduce((s, a) => s + a.challenge_points, 0) / prev.length;
        if (latest.challenge_points <= prevAvg) continue;
        out.push({
          student_id: id,
          alias: data.profiles[id]?.alias || 'Anónimo',
          latest_points: latest.challenge_points,
          previous_average: Math.round(prevAvg),
          improvement: Math.round(latest.challenge_points - prevAvg),
          n_prev: prev.length,
        });
      }
      return out.sort((a, b) => b.improvement - a.improvement);
    },

    /* ===================================================== analítica === */

    async classSummary(classId) {
      const memberIds = data.class_members.filter((m) => m.class_id === classId && m.active).map((m) => m.student_id);
      const rows = data.attempts.filter((a) => memberIds.includes(a.student_id));
      const weekAgo = new Date(Date.now() - 7 * 86400000).toISOString();
      const active = new Set(rows.filter((a) => a.created_at >= weekAgo).map((a) => a.student_id));
      const masteries = memberIds.flatMap((id) => Object.values(data.mastery[id] || {}).map((m) => m.mastery));
      return {
        class_id: classId,
        students: memberIds.length,
        active_7d: active.size,
        mean_mastery: masteries.length ? round1(masteries.reduce((s, x) => s + x, 0) / masteries.length) : 0,
        mean_accuracy_pct: rows.length ? round1(100 * rows.filter((a) => a.correct).length / rows.length) : 0,
        total_time_seconds: rows.reduce((s, a) => s + a.time_seconds, 0),
        attempts: rows.length,
      };
    },

    async conceptDifficulty(classId) {
      const memberIds = data.class_members.filter((m) => m.class_id === classId && m.active).map((m) => m.student_id);
      const rows = data.attempts.filter((a) => memberIds.includes(a.student_id) && a.concept_id);
      const byConcept = groupBy(rows, (a) => a.concept_id);
      const out = [];
      for (const [concept, list] of byConcept) {
        out.push({
          concept_id: concept,
          attempts: list.length,
          correct_pct: round1(100 * list.filter((a) => a.correct).length / list.length),
          mean_score_pct: round1(100 * list.reduce((s, a) => s + a.score, 0) / list.length),
          mean_hints: round2(list.reduce((s, a) => s + a.hints_used, 0) / list.length),
          students: new Set(list.map((a) => a.student_id)).size,
        });
      }
      return out.sort((a, b) => a.correct_pct - b.correct_pct);
    },

    async challengeAnalytics(challengeId) {
      const ch = data.challenges.find((c) => c.id === challengeId);
      if (!ch) return null;
      const memberIds = data.class_members.filter((m) => m.class_id === ch.class_id && m.active).map((m) => m.student_id);
      const attempts = data.challenge_attempts.filter((a) => a.challenge_id === challengeId);
      const competitive = attempts.filter((a) => a.rank_eligible && !a.practice_mode && a.completed);
      const participants = new Set(attempts.map((a) => a.student_id));

      const points = competitive.map((a) => a.challenge_points).sort((a, b) => a - b);
      const times = competitive.map((a) => a.active_time_seconds).sort((a, b) => a - b);

      const stepRows = data.challenge_steps.filter((s) => competitive.some((a) => a.id === s.attempt_id));
      const byStep = groupBy(stepRows, (s) => s.step_id);
      const stepStats = [];
      for (const st of ch.solution.steps) {
        const list = byStep.get(st.id) || [];
        stepStats.push({
          step_id: st.id,
          step_index: ch.solution.steps.indexOf(st),
          concept_id: st.concept || null,
          prompt: (ch.configuration.steps.find((x) => x.id === st.id) || {}).prompt || st.id,
          answered: list.length,
          correct_pct: list.length ? round1(100 * list.filter((s) => s.correct).length / list.length) : null,
          mean_score_pct: list.length ? round1(100 * list.reduce((s, x) => s + x.score, 0) / list.length) : null,
          mean_errors: list.length ? round2(list.reduce((s, x) => s + x.errors, 0) / list.length) : 0,
          hints_used: list.reduce((s, x) => s + x.hints_used, 0),
        });
      }

      return {
        challenge: publicChallenge(ch),
        participants: participants.size,
        nonParticipants: memberIds.filter((id) => !participants.has(id)).length,
        nonParticipantAliases: memberIds.filter((id) => !participants.has(id)).map((id) => data.profiles[id]?.alias),
        completed: competitive.length,
        classSize: memberIds.length,
        meanTime: times.length ? Math.round(times.reduce((s, x) => s + x, 0) / times.length) : 0,
        medianTime: median(times),
        meanScore: points.length ? Math.round(points.reduce((s, x) => s + x, 0) / points.length) : 0,
        medianScore: median(points),
        distribution: histogramBuckets(points),
        meanErrors: competitive.length ? round2(competitive.reduce((s, a) => s + a.errors, 0) / competitive.length) : 0,
        hintsTotal: competitive.reduce((s, a) => s + a.hints_used, 0),
        perfectRuns: competitive.filter((a) => a.errors === 0 && a.score >= 0.9999).length,
        perfectRunPct: competitive.length
          ? round1(100 * competitive.filter((a) => a.errors === 0 && a.score >= 0.9999).length / competitive.length) : 0,
        steps: stepStats,
        worstConcepts: stepStats.filter((s) => s.correct_pct !== null)
          .sort((a, b) => a.correct_pct - b.correct_pct).slice(0, 5),
      };
    },

    async pedagogicalAlerts(classId, { inactivityDays = 10 } = {}) {
      const members = await api.listClassMembers(classId);
      const alerts = [];
      const now = Date.now();

      for (const m of members) {
        const own = sortBy(data.attempts.filter((a) => a.student_id === m.id), (a) => a.created_at);
        const recent = own.slice(-12);

        if (recent.length >= 6) {
          const acc = recent.filter((a) => a.correct).length / recent.length;
          if (acc < 0.5) {
            alerts.push({
              kind: 'support', alias: m.alias, student_id: m.id,
              title: 'Podría necesitar refuerzo',
              detail: `Precisión reciente del ${Math.round(acc * 100)} % en las últimas ${recent.length} actividades.`,
            });
          }
        }

        const masteryMap = await api.getMastery(m.id);
        const review = conceptsToReview(masteryMap, own, { limit: 2 });
        for (const r of review) {
          if (r.errors >= 3) {
            alerts.push({
              kind: 'concept', alias: m.alias, student_id: m.id,
              title: 'Concepto problemático',
              detail: `${r.concept}: ${r.errors} errores recientes (mastery ${Math.round(r.mastery)}).`,
              concept: r.concept,
            });
          }
        }

        const last = own.length ? new Date(own[own.length - 1].created_at).getTime() : 0;
        const days = last ? Math.floor((now - last) / 86400000) : 999;
        if (days >= inactivityDays) {
          alerts.push({
            kind: 'inactive', alias: m.alias, student_id: m.id,
            title: 'Sin actividad reciente',
            detail: last ? `Última actividad hace ${days} días.` : 'Todavía no ha empezado ninguna actividad.',
          });
        }

        if (own.length >= 16) {
          const firstHalf = own.slice(0, Math.floor(own.length / 2));
          const secondHalf = own.slice(Math.floor(own.length / 2));
          const a1 = firstHalf.filter((a) => a.correct).length / firstHalf.length;
          const a2 = secondHalf.filter((a) => a.correct).length / secondHalf.length;
          if (a2 - a1 >= 0.18) {
            alerts.push({
              kind: 'improve', alias: m.alias, student_id: m.id,
              title: 'Mejora notable',
              detail: `Precisión del ${Math.round(a1 * 100)} % al ${Math.round(a2 * 100)} %.`,
            });
          }
        }
      }
      const order = { support: 0, concept: 1, inactive: 2, improve: 3 };
      return alerts.sort((a, b) => order[a.kind] - order[b.kind]);
    },

    async studentDetail(studentId) {
      const p = publicProfile(data.profiles[studentId]);
      const attempts = sortBy(data.attempts.filter((a) => a.student_id === studentId), desc((a) => a.created_at));
      const masteryMap = await api.getMastery(studentId);
      return {
        profile: p,
        progress: data.progress[studentId] || emptyProgress(studentId),
        attempts,
        mastery: masteryMap,
        review: conceptsToReview(masteryMap, attempts),
        achievements: data.student_achievements.filter((a) => a.student_id === studentId),
        challenges: data.challenge_attempts.filter((a) => a.student_id === studentId),
      };
    },

    /* ==================================================== exportación == */

    async exportTables(classId, { pseudonymised = false } = {}) {
      const members = data.class_members.filter((m) => m.class_id === classId && m.active);
      const ids = members.map((m) => m.student_id);
      const cls = data.classes.find((c) => c.id === classId);
      const idOf = (id) => (pseudonymised ? pseudoId(id) : id);

      const students = ids.map((id) => {
        const p = data.profiles[id];
        const base = {
          student_uuid: idOf(id),
          alias: p.alias,
          degree: p.degree,
          class_code: cls?.class_code,
          joined_at: members.find((m) => m.student_id === id)?.joined_at,
        };
        if (!pseudonymised) {
          return { ...base, first_name: p.first_name, last_name: p.last_name, email: p.email, university_id: p.university_id };
        }
        return base;
      });

      const attempts = data.attempts.filter((a) => ids.includes(a.student_id)).map((a) => ({
        attempt_id: a.id, student_uuid: idOf(a.student_id), activity_id: a.activity_id,
        world_id: a.world_id, concept_id: a.concept_id, activity_type: a.activity_type,
        difficulty: a.difficulty, score: a.score, correct: a.correct ? 1 : 0,
        attempt_number: a.attempt_number, hints_used: a.hints_used,
        time_seconds: a.time_seconds, xp_earned: a.xp_earned, source: a.source,
        created_at: a.created_at,
      }));

      const progress = ids.map((id) => {
        const pr = data.progress[id] || emptyProgress(id);
        return {
          student_uuid: idOf(id), xp: pr.xp, level: pr.level, streak_days: pr.streak_days,
          longest_streak: pr.longest_streak, last_active_date: pr.last_active_date,
          total_time_seconds: pr.total_time_seconds, activities_completed: pr.activities_completed,
          challenges_completed: pr.challenges_completed, current_world: pr.current_world,
        };
      });

      const challengeAttempts = data.challenge_attempts
        .filter((a) => ids.includes(a.student_id))
        .map((a) => {
          const ch = data.challenges.find((c) => c.id === a.challenge_id);
          return {
            attempt_id: a.id, student_uuid: idOf(a.student_id),
            challenge_id: a.challenge_id, challenge_number: ch?.number, challenge_type: ch?.challenge_type,
            attempt_number: a.attempt_number, rank_eligible: a.rank_eligible ? 1 : 0,
            practice_mode: a.practice_mode ? 1 : 0,
            score: a.score, challenge_points: a.challenge_points,
            accuracy_points: a.points_breakdown?.accuracy?.points ?? null,
            efficiency_points: a.points_breakdown?.efficiency?.points ?? null,
            time_points: a.points_breakdown?.time?.points ?? null,
            hints_points: a.points_breakdown?.hints?.points ?? null,
            active_time_seconds: a.active_time_seconds, errors: a.errors, hints_used: a.hints_used,
            xp_earned: a.xp_earned, started_at: a.started_at, completed_at: a.completed_at,
          };
        });

      const challengeSteps = data.challenge_steps
        .filter((s) => challengeAttempts.some((a) => a.attempt_id === s.attempt_id))
        .map((s) => {
          const att = data.challenge_attempts.find((a) => a.id === s.attempt_id);
          return {
            attempt_id: s.attempt_id, student_uuid: idOf(att.student_id),
            challenge_id: att.challenge_id, step_id: s.step_id, step_index: s.step_index,
            concept_id: s.concept_id, weight: s.weight, score: s.score,
            correct: s.correct ? 1 : 0, errors: s.errors, hints_used: s.hints_used,
            time_seconds: s.time_seconds,
          };
        });

      const weeklyRankings = [];
      for (const ch of data.challenges.filter((c) => c.class_id === classId)) {
        const rk = await api.weeklyRanking(ch.id);
        rk.forEach((r) => weeklyRankings.push({
          challenge_id: ch.id, challenge_number: ch.number, position: r.position,
          alias: r.alias, student_uuid: idOf(r.student_id),
          challenge_points: r.challenge_points, active_time_seconds: r.active_time_seconds,
          errors: r.errors, hints_used: r.hints_used, perfect_run: r.perfect_run ? 1 : 0,
        }));
      }

      const seasonal = (await api.seasonalRanking(classId)).map((r) => ({
        position: r.position, alias: r.alias, student_uuid: idOf(r.student_id),
        total_points: r.total_points, challenges_counted: r.challenges_counted,
        challenges_done: r.challenges_done, avg_points: r.avg_points,
      }));

      const masteryRows = [];
      for (const id of ids) {
        for (const m of Object.values(data.mastery[id] || {})) {
          masteryRows.push({
            student_uuid: idOf(id), concept_id: m.concept_id,
            mastery: m.mastery, n_responses: m.n_responses, updated_at: m.updated_at,
          });
        }
      }

      const summary = await api.classSummary(classId);
      const difficulty = await api.conceptDifficulty(classId);

      return {
        'students.csv': students,
        'attempts.csv': attempts,
        'progress.csv': progress,
        'challenge_attempts.csv': challengeAttempts,
        'challenge_steps.csv': challengeSteps,
        'weekly_rankings.csv': weeklyRankings,
        'seasonal_rankings.csv': seasonal,
        'concept_mastery.csv': masteryRows,
        'class_summary.csv': [{ ...summary, class_name: cls?.class_name, academic_year: cls?.academic_year }],
        'concept_difficulty.csv': difficulty,
      };
    },
  };

  /* ================================================ helpers internos == */

  function publicChallenge(c) {
    const { solution, ...rest } = c;
    return { ...rest, solution_available: solutionAvailable(c) };
  }

  function updateMasteryFor(studentId, row) {
    data.mastery[studentId] = data.mastery[studentId] || {};
    const all = data.attempts.filter((a) => a.student_id === studentId);
    for (const c of row.concepts) {
      const rows = all.filter((a) => (a.concepts || []).includes(c))
        .sort((x, y) => new Date(x.created_at) - new Date(y.created_at))
        .map((a) => ({
          correct: a.correct, partial: a.score, attempts: a.attempt_number,
          hintsUsed: a.hints_used, difficulty: a.difficulty,
        }));
      const m = conceptMastery(rows);
      data.mastery[studentId][c] = {
        student_id: studentId, concept_id: c, mastery: m.value,
        n_responses: m.n, last_correct: row.correct, updated_at: nowIso(),
      };
    }
  }

  function awardRankBonuses(challengeId) {
    if (data.bonuses.some((b) => b.challenge_id === challengeId && b.kind === 'rank')) return;
    const rows = data.challenge_attempts
      .filter((a) => a.challenge_id === challengeId && a.completed && a.rank_eligible)
      .sort((a, b) => b.challenge_points - a.challenge_points);
    rows.slice(0, 3).forEach((a, i) => {
      const xp = rankBonusXp(i + 1);
      data.bonuses.push({
        id: uuid(), challenge_id: challengeId, student_id: a.student_id,
        position: i + 1, kind: 'rank', xp, awarded_at: nowIso(),
      });
      if (data.progress[a.student_id]) {
        data.progress[a.student_id].xp += xp;
        data.progress[a.student_id].level = levelFromXp(data.progress[a.student_id].xp).level;
      }
    });
  }

  async function worldsWithCounts() {
    const ws = content.worlds;
    return ws.map((w) => ({
      ...w,
      activityCount: content.activities.filter((a) => a.world === w.id).length,
    }));
  }

  return api;
}

/* ============================================== funciones de módulo ===== */

function emptyProgress(id) {
  return {
    student_id: id, xp: 0, level: 1, streak_days: 0, longest_streak: 0,
    last_active_date: null, total_time_seconds: 0, activities_completed: 0,
    challenges_completed: 0, current_world: 'w01', last_activity_id: null,
    updated_at: nowIso(),
  };
}

function defaultScoring() {
  return {
    maxTotal: 1000, accuracyMax: 700, efficiencyMax: 150, timeMax: 100, hintsMax: 50,
    timeFloor: 25, timeExponent: 1.35, errorRefDivisor: 2, errorRefMin: 2,
  };
}

/**
 * Corrección local de un paso. Es la misma lógica que `statlab_grade_step`
 * en SQL y que los tipos de actividad en el cliente: se mantiene aquí para
 * que el modo demo no necesite servidor.
 */
export function gradeStepLocally(step, answer) {
  if (!step || answer === null || answer === undefined) return 0;
  const clamp01 = (x) => Math.min(1, Math.max(0, x));

  const multi = (selected, correctIds, allIds) => {
    const sel = new Set(selected || []);
    const cor = new Set(correctIds || []);
    let hits = 0, fp = 0;
    for (const id of allIds) {
      if (sel.has(id) && cor.has(id)) hits++;
      if (sel.has(id) && !cor.has(id)) fp++;
    }
    return cor.size ? clamp01((hits - fp) / cor.size) : 0;
  };

  switch (step.type) {
    case 'mcq':
    case 'chart-pick':
      return answer === step.answer ? 1 : 0;

    case 'multi':
    case 'chart-fix': {
      const opts = step.options || [];
      const correctIds = step.answer || opts.filter((o) => o.correct).map((o) => o.id);
      return multi(answer, correctIds, opts.map((o) => o.id));
    }

    case 'numeric':
      return Number.isFinite(answer) && Math.abs(answer - step.answer) <= (step.tolerance || 0) + 1e-9 ? 1 : 0;

    case 'classify': {
      const items = step.items || [];
      if (!items.length) return 0;
      return items.filter((it) => answer[it.id] === it.bin).length / items.length;
    }

    case 'claim-audit': {
      const claims = step.claims || [];
      if (!claims.length) return 0;
      return claims.filter((c) => answer[c.id] === c.correct).length / claims.length;
    }

    case 'order': {
      const items = step.items || [];
      const truth = new Map(items.map((i) => [i.id, i.pos]));
      const arr = answer || [];
      let pairs = 0, conc = 0;
      for (let i = 0; i < arr.length; i++) {
        for (let j = i + 1; j < arr.length; j++) {
          pairs++;
          if ((truth.get(arr[i]) ?? 0) < (truth.get(arr[j]) ?? 0)) conc++;
        }
      }
      return pairs ? conc / pairs : 0;
    }

    case 'decision': {
      const primary = answer.chosen === step.answer ? 1
        : (step.acceptable || []).includes(answer.chosen) ? 0.6 : 0;
      if (!step.justify) return primary;
      const opts = step.justify.options || [];
      const j = multi(answer.justification, opts.filter((o) => o.correct).map((o) => o.id), opts.map((o) => o.id));
      return 0.7 * primary + 0.3 * j;
    }

    case 'table2x2': {
      const keys = ['tp', 'fp', 'fn', 'tn'];
      const ok = keys.filter((k) => Number(answer?.cells?.[k]) === Number(step.answer[k])).length;
      return ok / keys.length;
    }

    default:
      return 0;
  }
}

const randomCode = () => {
  const A = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  let out = '';
  for (let i = 0; i < 6; i++) out += A[Math.floor(Math.random() * A.length)];
  return out;
};

const round1 = (x) => Math.round(x * 10) / 10;
const round2 = (x) => Math.round(x * 100) / 100;

function median(sorted) {
  if (!sorted.length) return 0;
  const m = sorted.length >> 1;
  return sorted.length % 2 ? sorted[m] : Math.round((sorted[m - 1] + sorted[m]) / 2);
}

function histogramBuckets(points, buckets = 5) {
  const edges = [0, 200, 400, 600, 800, 1000];
  const out = [];
  for (let i = 0; i < edges.length - 1; i++) {
    out.push({
      from: edges[i], to: edges[i + 1],
      label: `${edges[i]}–${edges[i + 1]}`,
      count: points.filter((p) => p >= edges[i] && (i === edges.length - 2 ? p <= edges[i + 1] : p < edges[i + 1])).length,
    });
  }
  void buckets;
  return out;
}

/** Pseudonimización estable: hash del id → UUID determinista. */
function pseudoId(id) {
  let h1 = 0x811c9dc5, h2 = 0x01000193;
  const s = 'statlab-pseudo:' + id;
  for (let i = 0; i < s.length; i++) {
    h1 ^= s.charCodeAt(i); h1 = Math.imul(h1, 16777619) >>> 0;
    h2 = Math.imul(h2 ^ s.charCodeAt(i), 2654435761) >>> 0;
  }
  const hex = (n) => n.toString(16).padStart(8, '0');
  return `${hex(h1)}-${hex(h2).slice(0, 4)}-4${hex(h1).slice(1, 4)}-a${hex(h2).slice(4, 7)}-${hex(h1)}${hex(h2).slice(0, 4)}`;
}

export { pseudoId };
