/**
 * STATLAB — configuración de despliegue
 * ---------------------------------------------------------------------------
 * 1. Copia este archivo como `config.js` (en la raíz del proyecto).
 * 2. Rellena SUPABASE_URL y SUPABASE_ANON_KEY con los valores de tu proyecto
 *    (Supabase → Project Settings → API).
 * 3. NUNCA pongas aquí la `service_role` key. Esa clave omite Row Level
 *    Security y, en un archivo servido al navegador, equivale a publicar la
 *    base de datos entera. La clave `anon` sí es pública por diseño: la
 *    seguridad real la aportan las políticas RLS de `supabase_schema.sql`.
 * 4. `config.js` está en .gitignore por comodidad, aunque la anon key no es
 *    un secreto. Si prefieres versionarla, elimina la línea del .gitignore.
 *
 * Si `config.js` no existe, STATLAB arranca automáticamente en MODO DEMO
 * (datos locales en localStorage, sin backend). Puedes forzarlo con `?demo=1`.
 */
window.STATLAB_CONFIG = {
  SUPABASE_URL: 'https://TU-PROYECTO.supabase.co',
  SUPABASE_ANON_KEY: 'TU_ANON_KEY_PUBLICA',

  // ---- Opcionales -------------------------------------------------------
  // Idioma por defecto de la interfaz ('es-ES' | 'en').
  DEFAULT_LOCALE: 'es-ES',

  // Permite el modo demo aunque haya backend configurado (?demo=1).
  ALLOW_DEMO: true,

  // Dominio de correo permitido en el registro (null = cualquiera).
  // Ej.: 'uloyola.es' restringe el alta a correos institucionales.
  ALLOWED_EMAIL_DOMAIN: null,

  // URL a la que Supabase redirige tras confirmar el correo o restablecer
  // la contraseña. Debe estar en la allowlist de Supabase → Authentication →
  // URL Configuration. Si es null se usa la URL actual.
  REDIRECT_URL: null,
};
