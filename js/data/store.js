/**
 * STATLAB — fachada de la capa de datos
 * ---------------------------------------------------------------------------
 * Ninguna vista importa Supabase directamente. Todas hablan con este módulo,
 * que delega en una de dos implementaciones con la MISMA interfaz:
 *
 *   demoStore      → localStorage + datos ficticios (modo demo, sin backend)
 *   supabaseStore  → Supabase (auth + PostgreSQL con RLS)
 *
 * Beneficios de esta indirección:
 *   · `?demo=1` funciona sin tocar una línea de las vistas;
 *   · se puede probar la app sin backend (y sin coste);
 *   · si algún día se cambia de backend, solo se escribe un adaptador nuevo;
 *   · los tests pueden ejercitar la lógica con el store demo.
 *
 * CONTRATO (todas las funciones devuelven promesas):
 *
 *  Autenticación
 *    signUp({email,password,firstName,lastName,degree,universityId,alias})
 *    signIn({email,password}) · signOut() · resetPassword(email)
 *    currentUser() → perfil o null · onAuthChange(fn)
 *    updateProfile(patch)
 *
 *  Clases
 *    createClass({className,academicYear,rankingEnabled,seasonBestN})
 *    updateClass(id, patch) · deleteClass(id)
 *    listMyClasses() → clases del profesor autenticado
 *    listMyEnrolments() → clases del alumno autenticado
 *    joinClassByCode(code) · listClassMembers(classId)
 *    regenerateClassCode(classId)
 *
 *  Actividad y progreso
 *    recordAttempt(attempt) · listAttempts({studentId,classId,since,limit})
 *    getProgress(studentId) · getMastery(studentId)
 *    listAchievements() · listStudentAchievements(studentId) · awardAchievement(code)
 *    touchSession(seconds)
 *
 *  Asignaciones
 *    createAssignment(a) · updateAssignment(id,patch) · deleteAssignment(id)
 *    listAssignments({classId}) · listMyAssignments()
 *
 *  Retos semanales
 *    createChallenge(c) · updateChallenge(id,patch) · deleteChallenge(id)
 *    listChallenges({classId,onlyPublished}) · getChallenge(id)
 *    listMyChallenges() · startChallengeAttempt(challengeId)
 *    saveChallengeStep(attemptId, step) · finishChallengeAttempt(attemptId, payload)
 *    listChallengeAttempts(challengeId) · myChallengeAttempts(challengeId)
 *
 *  Rankings y analítica
 *    weeklyRanking(challengeId) · seasonalRanking(classId)
 *    classSummary(classId) · conceptDifficulty(classId)
 *    challengeAnalytics(challengeId) · pedagogicalAlerts(classId)
 *
 *  Exportación
 *    exportTables(classId, { pseudonymised })
 */

import { getConfig } from '../config.js';

let impl = null;
let mode = null;

export async function initStore() {
  if (impl) return impl;
  const cfg = await getConfig();
  if (cfg.demo) {
    const m = await import('./demoStore.js');
    impl = await m.createDemoStore(cfg);
    mode = 'demo';
  } else {
    const m = await import('./supabaseStore.js');
    impl = await m.createSupabaseStore(cfg);
    mode = 'supabase';
  }
  return impl;
}

export const storeMode = () => mode;
export const isDemo = () => mode === 'demo';

/** Proxy: expone dinámicamente toda la interfaz de la implementación activa. */
export const db = new Proxy({}, {
  get(_t, prop) {
    if (prop === 'then') return undefined;             // no es una promesa
    return (...args) => {
      if (!impl) throw new Error('initStore() no ha terminado todavía');
      const fn = impl[prop];
      if (typeof fn !== 'function') throw new Error(`El store no implementa "${String(prop)}"`);
      return fn.apply(impl, args);
    };
  },
});
