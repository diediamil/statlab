/**
 * STATLAB — implementación SUPABASE de la capa de datos
 * ---------------------------------------------------------------------------
 * Misma interfaz que `demoStore.js`, contra Supabase (auth + PostgreSQL con
 * Row Level Security). El cliente se importa por CDN como módulo ES, así que
 * el proyecto sigue sin necesitar bundler ni paso de compilación.
 *
 * PRINCIPIOS
 *  · Solo se usa la ANON key. La `service_role` no aparece en ninguna parte.
 *  · No se envía nunca `student_id` desde el cliente: las políticas RLS lo
 *    derivan de `auth.uid()`. Se incluye solo cuando la política lo exige y
 *    siempre con el id de la sesión, nunca con uno recibido por parámetro.
 *  · La corrección de los retos y el cálculo de los Challenge Points ocurren
 *    en el servidor (RPC). El cliente solo pinta el resultado.
 *  · Los rankings se leen de vistas que proyectan alias, no nombres.
 */

import {
  getWorlds, getAllActivities, getAchievements, getBuiltInChallenges,
} from '../content.js';
import { conceptMastery, conceptsToReview } from '../mastery.js';
import { levelFromXp, updateStreak, activityXp, evaluateAchievements, buildStudentContext, worldStates } from '../progress.js';
import { solutionAvailable, challengeState } from '../challenges.js';
import { nowIso, sortBy, desc, groupBy } from '../utils.js';

const SUPABASE_ESM = 'https://esm.sh/@supabase/supabase-js@2.45.4';

export async function createSupabaseStore(cfg) {
  const { createClient } = await import(/* @vite-ignore */ SUPABASE_ESM);

  const sb = createClient(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
    global: { headers: { 'x-application-name': 'statlab' } },
  });

  const content = {
    worlds: await getWorlds(),
    activities: await getAllActivities(),
    achievements: await getAchievements(),
    challenges: await getBuiltInChallenges(),
  };

  let cachedProfile = null;
  const authListeners = new Set();

  sb.auth.onAuthStateChange(async (event) => {
    cachedProfile = null;
    if (event === 'SIGNED_OUT') {
      authListeners.forEach((fn) => fn(null));
    } else {
      const p = await api.currentUser();
      authListeners.forEach((fn) => fn(p));
    }
  });

  /** Lanza un error legible a partir del error de Supabase. */
  const check = ({ data, error }) => {
    if (error) {
      const e = new Error(error.message || 'Error de base de datos');
      e.code = error.code;
      e.details = error.details;
      throw e;
    }
    return data;
  };

  const uid = async () => (await sb.auth.getUser()).data.user?.id || null;

  const api = {
    isDemo: () => false,
    client: () => sb,

    /* ==================================================== autenticación == */

    async signUp({ email, password, firstName, lastName, degree, universityId, alias }) {
      const redirect = cfg.REDIRECT_URL || location.href.split('#')[0];
      const out = check(await sb.auth.signUp({
        email, password,
        options: {
          emailRedirectTo: redirect,
          // Estos metadatos los recoge el trigger handle_new_user(), que
          // SIEMPRE fuerza role='student': el cliente no puede escalar rol.
          data: {
            first_name: firstName || '', last_name: lastName || '',
            degree: degree || null, university_id: universityId || null,
            alias: alias || null,
          },
        },
      }));
      return out;
    },

    async signIn({ email, password }) {
      check(await sb.auth.signInWithPassword({ email, password }));
      cachedProfile = null;
      return api.currentUser();
    },

    async signOut() {
      await sb.auth.signOut();
      cachedProfile = null;
      return true;
    },

    async resetPassword(email) {
      const redirect = cfg.REDIRECT_URL || location.href.split('#')[0];
      check(await sb.auth.resetPasswordForEmail(email, { redirectTo: redirect }));
      return true;
    },

    async currentUser() {
      if (cachedProfile) return cachedProfile;
      const id = await uid();
      if (!id) return null;
      const rows = check(await sb.from('profiles').select('*').eq('id', id).limit(1));
      cachedProfile = rows?.[0] || null;
      return cachedProfile;
    },

    onAuthChange(fn) { authListeners.add(fn); return () => authListeners.delete(fn); },

    async updateProfile(patch) {
      const id = await uid();
      const allowed = {};
      for (const k of ['first_name', 'last_name', 'degree', 'university_id', 'alias', 'locale']) {
        if (k in patch) allowed[k] = patch[k];
      }
      const rows = check(await sb.from('profiles').update(allowed).eq('id', id).select());
      cachedProfile = rows?.[0] || cachedProfile;
      return cachedProfile;
    },

    async aliasAvailable(alias) {
      return check(await sb.rpc('statlab_alias_available', { p_alias: alias }));
    },

    /* ========================================================== clases == */

    async listMyClasses() {
      const id = await uid();
      return check(await sb.from('classes').select('*').eq('teacher_id', id).order('created_at', { ascending: false })) || [];
    },

    async listMyEnrolments() {
      const rows = check(await sb.from('class_members').select('class_id, classes(*)').eq('active', true)) || [];
      return rows.map((r) => r.classes).filter(Boolean);
    },

    async createClass({ className, academicYear, rankingEnabled = true, seasonBestN = 10 }) {
      const id = await uid();
      const rows = check(await sb.from('classes').insert({
        teacher_id: id, class_name: className,
        academic_year: academicYear || '2025-2026',
        ranking_enabled: rankingEnabled, season_best_n: seasonBestN,
      }).select());
      return rows[0];
    },

    async updateClass(classId, patch) {
      const rows = check(await sb.from('classes').update(patch).eq('id', classId).select());
      return rows[0];
    },

    async regenerateClassCode(classId) {
      const code = check(await sb.rpc('statlab_new_class_code'));
      const rows = check(await sb.from('classes').update({ class_code: code }).eq('id', classId).select());
      return rows[0].class_code;
    },

    async deleteClass(classId) {
      check(await sb.from('classes').delete().eq('id', classId));
      return true;
    },

    async joinClassByCode(code) {
      try {
        return check(await sb.rpc('statlab_join_class', { p_code: code }));
      } catch (err) {
        if (/CODIGO_NO_VALIDO/.test(err.message)) { err.code = 'CODIGO_NO_VALIDO'; }
        throw err;
      }
    },

    async listClassMembers(classId) {
      const members = check(await sb.from('class_members')
        .select('student_id, joined_at, profiles(*)')
        .eq('class_id', classId).eq('active', true)) || [];

      const ids = members.map((m) => m.student_id);
      if (!ids.length) return [];

      const progress = check(await sb.from('student_progress').select('*').in('student_id', ids)) || [];
      const mastery = check(await sb.from('concept_mastery').select('student_id, mastery').in('student_id', ids)) || [];
      const attempts = check(await sb.from('attempts')
        .select('student_id, correct, attempt_number').in('student_id', ids)) || [];

      const byStudent = groupBy(attempts, (a) => a.student_id);
      const mByStudent = groupBy(mastery, (m) => m.student_id);

      return members.map((m) => {
        const own = byStudent.get(m.student_id) || [];
        const mast = mByStudent.get(m.student_id) || [];
        const pr = progress.find((p) => p.student_id === m.student_id) || {};
        return {
          ...m.profiles,
          progress: pr,
          attempts: own.length,
          accuracy: own.length ? own.filter((a) => a.correct).length / own.length : 0,
          firstTryAccuracy: own.length
            ? own.filter((a) => a.correct && a.attempt_number === 1).length / own.length : 0,
          meanMastery: mast.length ? mast.reduce((s, x) => s + Number(x.mastery), 0) / mast.length : 0,
          lastActive: pr.last_active_date || null,
        };
      });
    },

    /* ====================================================== actividades == */

    async recordAttempt(attempt) {
      const id = await uid();
      const xp = activityXp({ xp: attempt.xpBase ?? 10, difficulty: attempt.difficulty ?? 1 }, {
        correct: attempt.correct, score: attempt.score, attempts: attempt.attempts, hintsUsed: attempt.hintsUsed,
      });

      const row = {
        student_id: id,
        class_id: attempt.classId || null,
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
        xp_earned: xp,
        seed: attempt.seed || null,
        source: attempt.source || 'practice',
        assignment_id: attempt.assignmentId || null,
      };
      const inserted = check(await sb.from('attempts').insert(row).select());

      // Progreso y racha
      const prRows = check(await sb.from('student_progress').select('*').eq('student_id', id).limit(1));
      const pr = prRows?.[0] || null;
      const streak = updateStreak(pr || {});
      const newXp = (pr?.xp || 0) + xp + streak.bonusXp;
      const patch = {
        student_id: id,
        xp: newXp,
        level: levelFromXp(newXp).level,
        streak_days: streak.streak,
        longest_streak: Math.max(pr?.longest_streak || 0, streak.streak),
        last_active_date: streak.date,
        total_time_seconds: (pr?.total_time_seconds || 0) + (row.time_seconds || 0),
        activities_completed: (pr?.activities_completed || 0) + (row.correct ? 1 : 0),
        current_world: row.world_id || pr?.current_world || 'w01',
        last_activity_id: row.activity_id,
      };
      check(await sb.from('student_progress').upsert(patch, { onConflict: 'student_id' }));

      await recomputeMastery(id, row.concepts);

      return {
        attempt: inserted?.[0] || row, xpEarned: xp,
        streakBonus: streak.bonusXp, streak: streak.streak, level: patch.level,
      };
    },

    async listAttempts({ studentId = null, classId = null, since = null, limit = 500 } = {}) {
      let q = sb.from('attempts').select('*').order('created_at', { ascending: false }).limit(limit);
      if (studentId) q = q.eq('student_id', studentId);
      else q = q.eq('student_id', await uid());
      if (classId) q = q.eq('class_id', classId);
      if (since) q = q.gte('created_at', since);
      return check(await q) || [];
    },

    async listClassAttempts(classId, { since = null } = {}) {
      const members = check(await sb.from('class_members').select('student_id').eq('class_id', classId)) || [];
      const ids = members.map((m) => m.student_id);
      if (!ids.length) return [];
      let q = sb.from('attempts').select('*').in('student_id', ids);
      if (since) q = q.gte('created_at', since);
      return check(await q) || [];
    },

    async getProgress(studentId = null) {
      const id = studentId || await uid();
      const rows = check(await sb.from('student_progress').select('*').eq('student_id', id).limit(1));
      return rows?.[0] || {
        student_id: id, xp: 0, level: 1, streak_days: 0, longest_streak: 0,
        last_active_date: null, total_time_seconds: 0, activities_completed: 0,
        challenges_completed: 0, current_world: 'w01',
      };
    },

    async getMastery(studentId = null) {
      const id = studentId || await uid();
      const rows = check(await sb.from('concept_mastery').select('*').eq('student_id', id)) || [];
      const map = new Map();
      for (const r of rows) {
        map.set(r.concept_id, { value: Number(r.mastery), n: r.n_responses, evidence: r.n_responses });
      }
      return map;
    },

    async recordGameScore(gameId, points) {
      // Los minijuegos se registran como intentos con source='game'.
      const id = await uid();
      check(await sb.from('attempts').insert({
        student_id: id, activity_id: `game:${gameId}`, activity_type: 'game',
        score: 1, correct: true, difficulty: 1, time_seconds: 0,
        xp_earned: 0, source: 'game', answer: { points },
      }));
      return points;
    },

    async getGameBest(studentId = null) {
      const id = studentId || await uid();
      const rows = check(await sb.from('attempts')
        .select('activity_id, answer').eq('student_id', id).eq('source', 'game')) || [];
      const best = new Map();
      for (const r of rows) {
        const g = String(r.activity_id || '').replace('game:', '');
        const p = r.answer?.points || 0;
        best.set(g, Math.max(best.get(g) || 0, p));
      }
      return best;
    },

    async touchSession(seconds, context = null) {
      const id = await uid();
      check(await sb.from('study_sessions').insert({
        student_id: id, active_seconds: seconds, ended_at: nowIso(), context,
      }));
      return true;
    },

    /* ========================================================== logros == */

    async listAchievements() { return content.achievements; },

    async listStudentAchievements(studentId = null) {
      const id = studentId || await uid();
      return check(await sb.from('student_achievements').select('*').eq('student_id', id)) || [];
    },

    async awardAchievement(code, context = null) {
      const id = await uid();
      const rows = check(await sb.from('student_achievements')
        .upsert({ student_id: id, achievement_code: code, context },
          { onConflict: 'student_id,achievement_code', ignoreDuplicates: true })
        .select());
      const ach = content.achievements.find((a) => a.code === code);
      if (rows?.length && ach?.xp) {
        const pr = await api.getProgress(id);
        const newXp = (pr.xp || 0) + ach.xp;
        check(await sb.from('student_progress')
          .upsert({ student_id: id, xp: newXp, level: levelFromXp(newXp).level }, { onConflict: 'student_id' }));
      }
      return rows?.[0] || null;
    },

    async syncAchievements() {
      const id = await uid();
      const attempts = await api.listAttempts({ limit: 1000 });
      const masteryMap = await api.getMastery(id);
      const ws = worldStates(content.worlds.map((w) => ({
        ...w, activityCount: content.activities.filter((a) => a.world === w.id).length,
      })), {
        activityResults: attempts.map((a) => ({ ...a, world: a.world_id })),
        masteryMap,
      });
      const ctx = buildStudentContext({
        attempts, masteryMap, worldStates: ws,
        progress: await api.getProgress(id),
        challengeAttempts: await api.myChallengeAttempts(),
        gameBest: await api.getGameBest(id),
      });
      const earned = (await api.listStudentAchievements(id)).map((a) => a.achievement_code);
      const newly = evaluateAchievements(content.achievements, ctx, earned);
      for (const a of newly) await api.awardAchievement(a.code);
      return newly;
    },

    /* ====================================================== asignaciones = */

    async listAssignments({ classId = null } = {}) {
      let q = sb.from('assignments').select('*').order('due_at', { ascending: true });
      if (classId) q = q.eq('class_id', classId);
      return check(await q) || [];
    },

    async listMyAssignments() {
      const rows = check(await sb.from('assignments').select('*').eq('published', true)) || [];
      const mine = check(await sb.from('assignment_progress').select('*').eq('student_id', await uid())) || [];
      return rows.map((a) => ({ ...a, myProgress: mine.find((p) => p.assignment_id === a.id) || null }));
    },

    async createAssignment(a) {
      const id = await uid();
      const rows = check(await sb.from('assignments').insert({ ...a, teacher_id: id }).select());
      return rows[0];
    },

    async updateAssignment(assignmentId, patch) {
      const rows = check(await sb.from('assignments').update(patch).eq('id', assignmentId).select());
      return rows[0];
    },

    async deleteAssignment(assignmentId) {
      check(await sb.from('assignments').delete().eq('id', assignmentId));
      return true;
    },

    async listAssignmentProgress(assignmentId) {
      return check(await sb.from('assignment_progress').select('*, profiles(alias)').eq('assignment_id', assignmentId)) || [];
    },

    /* ============================================================ retos == */

    async listChallenges({ classId = null, onlyPublished = false } = {}) {
      let q = sb.from('weekly_challenges').select('*').order('opens_at', { ascending: false });
      if (classId) q = q.eq('class_id', classId);
      if (onlyPublished) q = q.eq('published', true);
      const rows = check(await q) || [];
      return rows.map((c) => ({ ...c, solution_available: solutionAvailable(c) }));
    },

    async listMyChallenges() {
      const rows = check(await sb.from('v_student_challenges').select('*').order('opens_at', { ascending: false })) || [];
      return rows;
    },

    async getChallenge(id) {
      const rows = check(await sb.from('weekly_challenges').select('*').eq('id', id).limit(1));
      if (rows?.length) return { ...rows[0], solution_available: solutionAvailable(rows[0]) };
      const alt = check(await sb.from('v_student_challenges').select('*').eq('id', id).limit(1));
      return alt?.[0] || null;
    },

    async getChallengeSolution(id) {
      return check(await sb.rpc('statlab_challenge_solution', { p_challenge: id }));
    },

    async createChallenge(payload) {
      const id = await uid();
      const rows = check(await sb.from('weekly_challenges').insert({ ...payload, teacher_id: id }).select());
      return rows[0];
    },

    async updateChallenge(challengeId, patch) {
      const rows = check(await sb.from('weekly_challenges').update(patch).eq('id', challengeId).select());
      return rows[0];
    },

    async deleteChallenge(challengeId) {
      check(await sb.from('weekly_challenges').delete().eq('id', challengeId));
      return true;
    },

    async publishSolution(challengeId) {
      check(await sb.from('weekly_challenges').update({
        solution_policy: 'manual', solution_available_at: nowIso(),
      }).eq('id', challengeId));
      return true;
    },

    /* -- El ciclo del reto pasa ÍNTEGRAMENTE por funciones del servidor -- */

    async startChallengeAttempt(challengeId) {
      return check(await sb.rpc('statlab_start_challenge_attempt', { p_challenge: challengeId }));
    },

    async submitChallengeStep(attemptId, stepId, answer, { errors = 0, hints = 0, seconds = 0 } = {}) {
      return check(await sb.rpc('statlab_submit_challenge_step', {
        p_attempt: attemptId, p_step_id: stepId, p_answer: answer,
        p_errors: errors, p_hints: hints, p_seconds: seconds,
      }));
    },

    async finishChallengeAttempt(attemptId, activeSeconds) {
      const breakdown = check(await sb.rpc('statlab_finish_challenge_attempt', {
        p_attempt: attemptId, p_active_seconds: activeSeconds,
      }));
      const rows = check(await sb.from('weekly_challenge_attempts').select('*').eq('id', attemptId).limit(1));
      return { total: breakdown?.total ?? 0, components: breakdown, attempt: rows?.[0] || null, max: 1000 };
    },

    async myChallengeAttempts(challengeId = null) {
      let q = sb.from('weekly_challenge_attempts').select('*')
        .eq('student_id', await uid()).order('created_at', { ascending: false });
      if (challengeId) q = q.eq('challenge_id', challengeId);
      return check(await q) || [];
    },

    async listChallengeAttempts(challengeId) {
      return check(await sb.from('weekly_challenge_attempts').select('*').eq('challenge_id', challengeId)) || [];
    },

    async listChallengeSteps(attemptId) {
      return check(await sb.from('weekly_challenge_steps').select('*')
        .eq('attempt_id', attemptId).order('step_index', { ascending: true })) || [];
    },

    /* ========================================================= rankings == */

    async weeklyRanking(challengeId) {
      const myId = await uid();
      const rows = check(await sb.from('v_weekly_ranking').select('*')
        .eq('challenge_id', challengeId).order('position', { ascending: true })) || [];
      return rows.map((r) => ({ ...r, isMe: r.student_id === myId }));
    },

    async seasonalRanking(classId) {
      const myId = await uid();
      const rows = check(await sb.from('v_seasonal_ranking').select('*')
        .eq('class_id', classId).order('position', { ascending: true })) || [];
      return rows.map((r) => ({ ...r, isMe: r.student_id === myId }));
    },

    async mostImproved(classId) {
      const rows = check(await sb.from('v_most_improved').select('*')
        .eq('class_id', classId).order('improvement', { ascending: false })) || [];
      return rows;
    },

    /* ======================================================== analítica == */

    async classSummary(classId) {
      const rows = check(await sb.from('v_class_summary').select('*').eq('class_id', classId).limit(1));
      return rows?.[0] || null;
    },

    async conceptDifficulty(classId) {
      const rows = check(await sb.from('v_class_concept_difficulty').select('*')
        .eq('class_id', classId).order('correct_pct', { ascending: true })) || [];
      return rows;
    },

    async challengeAnalytics(challengeId) {
      const ch = await api.getChallenge(challengeId);
      if (!ch) return null;
      const attempts = await api.listChallengeAttempts(challengeId);
      const competitive = attempts.filter((a) => a.completed && a.rank_eligible && !a.practice_mode);
      const members = check(await sb.from('class_members').select('student_id, profiles(alias)')
        .eq('class_id', ch.class_id).eq('active', true)) || [];
      const stepRows = check(await sb.from('v_challenge_step_analytics').select('*')
        .eq('challenge_id', challengeId).order('step_index', { ascending: true })) || [];

      const participants = new Set(attempts.map((a) => a.student_id));
      const points = competitive.map((a) => a.challenge_points).sort((a, b) => a - b);
      const times = competitive.map((a) => a.active_time_seconds).sort((a, b) => a - b);

      let solution = null;
      try { solution = await api.getChallengeSolution(challengeId); } catch { /* sin permisos */ }
      const cfgSteps = ch.configuration?.steps || [];

      return {
        challenge: ch,
        participants: participants.size,
        nonParticipants: members.filter((m) => !participants.has(m.student_id)).length,
        nonParticipantAliases: members.filter((m) => !participants.has(m.student_id)).map((m) => m.profiles?.alias),
        completed: competitive.length,
        classSize: members.length,
        meanTime: avg(times),
        medianTime: med(times),
        meanScore: avg(points),
        medianScore: med(points),
        distribution: buckets(points),
        meanErrors: competitive.length ? round2(competitive.reduce((s, a) => s + a.errors, 0) / competitive.length) : 0,
        hintsTotal: competitive.reduce((s, a) => s + a.hints_used, 0),
        perfectRuns: competitive.filter((a) => a.errors === 0 && Number(a.score) >= 0.9999).length,
        perfectRunPct: competitive.length
          ? round1(100 * competitive.filter((a) => a.errors === 0 && Number(a.score) >= 0.9999).length / competitive.length) : 0,
        steps: stepRows.map((s) => ({
          ...s,
          prompt: (cfgSteps.find((x) => x.id === s.step_id) || {}).prompt || s.step_id,
        })),
        worstConcepts: [...stepRows].sort((a, b) => a.correct_pct - b.correct_pct).slice(0, 5),
        solution,
      };
    },

    async pedagogicalAlerts(classId, { inactivityDays = 10 } = {}) {
      const members = await api.listClassMembers(classId);
      const ids = members.map((m) => m.id);
      if (!ids.length) return [];
      const attempts = check(await sb.from('attempts').select('*').in('student_id', ids)) || [];
      const byStudent = groupBy(attempts, (a) => a.student_id);
      const alerts = [];
      const now = Date.now();

      for (const m of members) {
        const own = sortBy(byStudent.get(m.id) || [], (a) => a.created_at);
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
        for (const r of conceptsToReview(masteryMap, own, { limit: 2 })) {
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
          const h1 = own.slice(0, Math.floor(own.length / 2));
          const h2 = own.slice(Math.floor(own.length / 2));
          const a1 = h1.filter((a) => a.correct).length / h1.length;
          const a2 = h2.filter((a) => a.correct).length / h2.length;
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
      const profRows = check(await sb.from('profiles').select('*').eq('id', studentId).limit(1));
      const attempts = check(await sb.from('attempts').select('*')
        .eq('student_id', studentId).order('created_at', { ascending: false })) || [];
      const masteryMap = await api.getMastery(studentId);
      return {
        profile: profRows?.[0] || null,
        progress: await api.getProgress(studentId),
        attempts,
        mastery: masteryMap,
        review: conceptsToReview(masteryMap, attempts),
        achievements: await api.listStudentAchievements(studentId),
        challenges: check(await sb.from('weekly_challenge_attempts').select('*').eq('student_id', studentId)) || [],
      };
    },

    /* ======================================================= exportación = */

    async exportTables(classId, { pseudonymised = false } = {}) {
      const members = await api.listClassMembers(classId);
      const ids = members.map((m) => m.id);
      const cls = (check(await sb.from('classes').select('*').eq('id', classId).limit(1)))?.[0];
      const idOf = (id) => (pseudonymised ? pseudoId(id) : id);

      const attempts = ids.length
        ? (check(await sb.from('attempts').select('*').in('student_id', ids)) || []) : [];
      const progress = ids.length
        ? (check(await sb.from('student_progress').select('*').in('student_id', ids)) || []) : [];
      const mastery = ids.length
        ? (check(await sb.from('concept_mastery').select('*').in('student_id', ids)) || []) : [];
      const challenges = check(await sb.from('weekly_challenges').select('*').eq('class_id', classId)) || [];
      const chIds = challenges.map((c) => c.id);
      const chAttempts = chIds.length
        ? (check(await sb.from('weekly_challenge_attempts').select('*').in('challenge_id', chIds)) || []) : [];
      const attIds = chAttempts.map((a) => a.id);
      const chSteps = attIds.length
        ? (check(await sb.from('weekly_challenge_steps').select('*').in('attempt_id', attIds)) || []) : [];

      const weekly = [];
      for (const ch of challenges) {
        const rk = await api.weeklyRanking(ch.id);
        rk.forEach((r) => weekly.push({
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

      return {
        'students.csv': members.map((m) => {
          const base = {
            student_uuid: idOf(m.id), alias: m.alias, degree: m.degree,
            class_code: cls?.class_code, joined_at: m.joined_at || null,
          };
          return pseudonymised ? base
            : { ...base, first_name: m.first_name, last_name: m.last_name, email: m.email, university_id: m.university_id };
        }),
        'attempts.csv': attempts.map((a) => ({ ...a, student_uuid: idOf(a.student_id), student_id: undefined, answer: undefined })),
        'progress.csv': progress.map((p) => ({ ...p, student_uuid: idOf(p.student_id), student_id: undefined })),
        'challenge_attempts.csv': chAttempts.map((a) => ({
          attempt_id: a.id, student_uuid: idOf(a.student_id), challenge_id: a.challenge_id,
          attempt_number: a.attempt_number, rank_eligible: a.rank_eligible ? 1 : 0,
          practice_mode: a.practice_mode ? 1 : 0, score: a.score, challenge_points: a.challenge_points,
          accuracy_points: a.points_breakdown?.accuracy?.points ?? null,
          efficiency_points: a.points_breakdown?.efficiency?.points ?? null,
          time_points: a.points_breakdown?.time?.points ?? null,
          hints_points: a.points_breakdown?.hints?.points ?? null,
          active_time_seconds: a.active_time_seconds, errors: a.errors, hints_used: a.hints_used,
          xp_earned: a.xp_earned, started_at: a.started_at, completed_at: a.completed_at,
        })),
        'challenge_steps.csv': chSteps.map((s) => {
          const att = chAttempts.find((a) => a.id === s.attempt_id);
          return {
            attempt_id: s.attempt_id, student_uuid: idOf(att?.student_id),
            challenge_id: att?.challenge_id, step_id: s.step_id, step_index: s.step_index,
            concept_id: s.concept_id, weight: s.weight, score: s.score,
            correct: s.correct ? 1 : 0, errors: s.errors, hints_used: s.hints_used,
            time_seconds: s.time_seconds,
          };
        }),
        'weekly_rankings.csv': weekly,
        'seasonal_rankings.csv': seasonal,
        'concept_mastery.csv': mastery.map((m) => ({
          student_uuid: idOf(m.student_id), concept_id: m.concept_id,
          mastery: m.mastery, n_responses: m.n_responses, updated_at: m.updated_at,
        })),
        'class_summary.csv': [{ ...(await api.classSummary(classId)), class_name: cls?.class_name, academic_year: cls?.academic_year }],
        'concept_difficulty.csv': await api.conceptDifficulty(classId),
      };
    },
  };

  /* --------------------------------------------------------- internos --- */

  /**
   * Recalcula el mastery de los conceptos afectados. Se hace en el cliente
   * (con la fórmula documentada) y se guarda el resultado, para que el panel
   * del profesor pueda consultarlo sin recalcular nada.
   */
  async function recomputeMastery(studentId, concepts) {
    if (!concepts?.length) return;
    const rows = check(await sb.from('attempts')
      .select('concepts, correct, score, attempt_number, hints_used, difficulty, created_at')
      .eq('student_id', studentId)
      .overlaps('concepts', concepts)
      .order('created_at', { ascending: true })) || [];

    const payload = [];
    for (const c of concepts) {
      const list = rows.filter((r) => (r.concepts || []).includes(c)).map((r) => ({
        correct: r.correct, partial: Number(r.score), attempts: r.attempt_number,
        hintsUsed: r.hints_used, difficulty: r.difficulty,
      }));
      const m = conceptMastery(list);
      payload.push({
        student_id: studentId, concept_id: c, mastery: m.value,
        n_responses: m.n, last_correct: list.length ? list[list.length - 1].correct : null,
      });
    }
    if (payload.length) {
      check(await sb.from('concept_mastery').upsert(payload, { onConflict: 'student_id,concept_id' }));
    }
  }

  void challengeState;
  return api;
}

/* ------------------------------------------------------------ utilidades -- */

const avg = (a) => (a.length ? Math.round(a.reduce((s, x) => s + x, 0) / a.length) : 0);
const med = (sorted) => {
  if (!sorted.length) return 0;
  const m = sorted.length >> 1;
  return sorted.length % 2 ? sorted[m] : Math.round((sorted[m - 1] + sorted[m]) / 2);
};
const round1 = (x) => Math.round(x * 10) / 10;
const round2 = (x) => Math.round(x * 100) / 100;

function buckets(points) {
  const edges = [0, 200, 400, 600, 800, 1000];
  const out = [];
  for (let i = 0; i < edges.length - 1; i++) {
    out.push({
      from: edges[i], to: edges[i + 1], label: `${edges[i]}–${edges[i + 1]}`,
      count: points.filter((p) => p >= edges[i] && (i === edges.length - 2 ? p <= edges[i + 1] : p < edges[i + 1])).length,
    });
  }
  return out;
}

/** Misma pseudonimización que en el modo demo (hash estable, no reversible). */
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
