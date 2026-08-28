/**
 * STATLAB — sesión y autorización en el cliente
 * ---------------------------------------------------------------------------
 * IMPORTANTE: esto es COMODIDAD DE INTERFAZ, no seguridad. La seguridad real
 * está en las políticas RLS de `supabase_schema.sql`. Aquí solo se decide qué
 * pantallas se pintan; si alguien manipula este objeto, el servidor seguirá
 * devolviendo únicamente los datos que le corresponden.
 */

import { db, initStore, isDemo } from './data/store.js';
import { isEmail, isValidAlias, passwordIssues } from './utils.js';
import { t } from './i18n.js';
import { config } from './config.js';

let currentProfile = null;
const listeners = new Set();

export async function initAuth() {
  await initStore();
  currentProfile = await db.currentUser();
  db.onAuthChange((p) => {
    currentProfile = p;
    listeners.forEach((fn) => fn(p));
  });
  return currentProfile;
}

export const user = () => currentProfile;
export const isAuthenticated = () => Boolean(currentProfile);
export const isTeacher = () => currentProfile?.role === 'teacher' || currentProfile?.role === 'admin';
export const isStudent = () => currentProfile?.role === 'student';

export function onUserChange(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export async function refreshUser() {
  currentProfile = await db.currentUser();
  listeners.forEach((fn) => fn(currentProfile));
  return currentProfile;
}

/* ------------------------------------------------------------ validación -- */

/** Valida el formulario de registro. Devuelve { ok, errors: {campo: mensaje} }. */
export function validateRegistration(form) {
  const errors = {};
  const cfg = config();

  if (!form.firstName?.trim()) errors.firstName = t('auth.errors.required');
  if (!form.lastName?.trim()) errors.lastName = t('auth.errors.required');

  if (!isEmail(form.email)) errors.email = t('auth.errors.invalidEmail');
  else if (cfg.ALLOWED_EMAIL_DOMAIN
    && !String(form.email).toLowerCase().endsWith('@' + String(cfg.ALLOWED_EMAIL_DOMAIN).toLowerCase())) {
    errors.email = t('auth.errors.domain', { domain: cfg.ALLOWED_EMAIL_DOMAIN });
  }

  const pw = passwordIssues(form.password);
  if (pw.length) errors.password = t(`auth.errors.${pw[0]}`);
  if (form.password !== form.password2) errors.password2 = t('auth.errors.mismatch');

  if (!form.alias?.trim()) errors.alias = t('auth.errors.required');
  else if (!isValidAlias(form.alias)) errors.alias = t('auth.errors.aliasFormat');

  if (!form.degree) errors.degree = t('auth.errors.required');
  if (!form.privacy) errors.privacy = t('auth.errors.privacy');

  return { ok: Object.keys(errors).length === 0, errors };
}

export function validateLogin(form) {
  const errors = {};
  if (!isEmail(form.email)) errors.email = t('auth.errors.invalidEmail');
  if (!form.password) errors.password = t('auth.errors.required');
  return { ok: Object.keys(errors).length === 0, errors };
}

/* ------------------------------------------------------------ operaciones -- */

export async function register(form) {
  const check = validateRegistration(form);
  if (!check.ok) return { ok: false, errors: check.errors };

  const free = await db.aliasAvailable(form.alias.trim());
  if (!free) return { ok: false, errors: { alias: t('auth.errors.aliasTaken') } };

  try {
    const out = await db.signUp({
      email: form.email.trim(),
      password: form.password,
      firstName: form.firstName.trim(),
      lastName: form.lastName.trim(),
      degree: form.degree,
      universityId: form.universityId?.trim() || null,
      alias: form.alias.trim(),
    });
    await refreshUser();
    return {
      ok: true,
      // Supabase puede requerir confirmación por correo antes de la sesión.
      needsEmailConfirmation: !isDemo() && !out?.session,
      profile: currentProfile,
    };
  } catch (err) {
    const msg = /already registered|already exists|duplicate/i.test(err.message)
      ? t('auth.errors.emailTaken') : (err.message || t('auth.errors.generic'));
    return { ok: false, errors: { email: msg } };
  }
}

export async function login(form) {
  const check = validateLogin(form);
  if (!check.ok) return { ok: false, errors: check.errors };
  try {
    await db.signIn({ email: form.email.trim(), password: form.password });
    await refreshUser();
    return { ok: true, profile: currentProfile };
  } catch (err) {
    const msg = /invalid login|credentials/i.test(err.message)
      ? t('auth.errors.badCredentials') : (err.message || t('auth.errors.generic'));
    return { ok: false, errors: { password: msg } };
  }
}

export async function logout() {
  await db.signOut();
  currentProfile = null;
  listeners.forEach((fn) => fn(null));
}

export async function requestPasswordReset(email) {
  if (!isEmail(email)) return { ok: false, errors: { email: t('auth.errors.invalidEmail') } };
  try {
    await db.resetPassword(email.trim());
    return { ok: true };
  } catch {
    // No se revela si el correo existe (evita enumeración de usuarios).
    return { ok: true };
  }
}

/** Guarda cambios del perfil, validando el alias. */
export async function saveProfile(patch) {
  if (patch.alias !== undefined) {
    if (!isValidAlias(patch.alias)) return { ok: false, errors: { alias: t('auth.errors.aliasFormat') } };
    const free = await db.aliasAvailable(patch.alias);
    if (!free && patch.alias !== currentProfile.alias) {
      return { ok: false, errors: { alias: t('auth.errors.aliasTaken') } };
    }
  }
  await db.updateProfile(patch);
  await refreshUser();
  return { ok: true, profile: currentProfile };
}

/** Guarda de ruta: devuelve la ruta de redirección o null si puede pasar. */
export function guard(requires) {
  if (!requires) return null;
  if (requires === 'auth' && !isAuthenticated()) return '/login';
  if (requires === 'teacher' && !isTeacher()) return isAuthenticated() ? '/student' : '/login';
  if (requires === 'student' && !isAuthenticated()) return '/login';
  return null;
}
