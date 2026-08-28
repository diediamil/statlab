-- ===========================================================================
-- STATLAB — esquema completo para Supabase / PostgreSQL
-- ===========================================================================
-- Ejecutar UNA VEZ en Supabase → SQL Editor (o con `supabase db push`).
-- El script es idempotente en lo esencial: usa IF NOT EXISTS y CREATE OR
-- REPLACE, así que puede volverse a ejecutar sin destruir datos.
--
-- PRINCIPIOS DE SEGURIDAD APLICADOS
-- ---------------------------------------------------------------------------
-- 1. Row Level Security ACTIVADA en todas las tablas con datos de personas.
--    La seguridad NO depende del frontend: aunque alguien use la anon key con
--    curl, solo verá lo que las políticas permitan.
-- 2. El alumno solo ve SUS filas. El profesor solo ve las de SUS clases.
-- 3. Los rankings se exponen mediante VISTAS que proyectan únicamente
--    alias + puntuación + posición. El nombre y el correo no salen nunca de
--    la tabla `profiles`, y `profiles` solo es legible por su dueño, por el
--    profesor de su clase y (alias solo) a través de las vistas de ranking.
-- 4. El rol NO se puede cambiar desde el cliente: el trigger de alta fuerza
--    'student' y una política impide modificar la columna `role`. Convertir a
--    alguien en profesor requiere SQL administrativo (ver el final del script).
-- 5. La corrección de los retos ocurre EN EL SERVIDOR (funciones
--    SECURITY DEFINER). Las respuestas correctas viven en la columna
--    `solution`, que ninguna política expone a los estudiantes hasta que el
--    reto se cierra. Así no se puede «ver la solución» desde el navegador.
-- 6. Ningún identificador enviado por el cliente se usa sin validar:
--    las funciones comprueban pertenencia y ventanas temporales.
-- 7. NUNCA se pone la service_role key en el cliente. Este script no la usa.
-- ===========================================================================

-- Extensiones necesarias -----------------------------------------------------
create extension if not exists "pgcrypto";      -- gen_random_uuid()

-- ===========================================================================
-- 1. PERFILES Y ROLES
-- ===========================================================================

do $$ begin
  create type statlab_role as enum ('student', 'teacher', 'admin');
exception when duplicate_object then null; end $$;

create table if not exists public.profiles (
  id            uuid primary key references auth.users(id) on delete cascade,
  first_name    text not null default '',
  last_name     text not null default '',
  email         text not null,
  degree        text,
  university_id text,                              -- opcional (minimización)
  alias         text,                              -- único identificador público
  role          statlab_role not null default 'student',
  locale        text not null default 'es-ES',
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  constraint profiles_alias_format check (alias is null or char_length(alias) between 3 and 16)
);

create unique index if not exists profiles_alias_unique_ci
  on public.profiles (lower(alias)) where alias is not null;
create index if not exists profiles_role_idx on public.profiles (role);

comment on table public.profiles is
  'Datos académicos mínimos. No se almacena ningún dato de salud del estudiante.';
comment on column public.profiles.alias is
  'Nombre público usado en los rankings. Nunca se muestran nombre ni correo.';

-- ---------------------------------------------------------------------------
-- Alta automática de perfil al registrarse. Fuerza role='student' SIEMPRE:
-- el cliente no puede autoproclamarse profesor pasando metadatos.
-- ---------------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, email, first_name, last_name, degree, university_id, alias, role)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data ->> 'first_name', ''),
    coalesce(new.raw_user_meta_data ->> 'last_name', ''),
    nullif(new.raw_user_meta_data ->> 'degree', ''),
    nullif(new.raw_user_meta_data ->> 'university_id', ''),
    nullif(new.raw_user_meta_data ->> 'alias', ''),
    'student'                                        -- ← nunca se toma del cliente
  )
  on conflict (id) do nothing;

  insert into public.student_progress (student_id) values (new.id)
  on conflict (student_id) do nothing;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- updated_at automático ------------------------------------------------------
create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

drop trigger if exists profiles_touch on public.profiles;
create trigger profiles_touch before update on public.profiles
  for each row execute function public.touch_updated_at();

-- ===========================================================================
-- 2. CLASES
-- ===========================================================================

create or replace function public.statlab_new_class_code()
returns text language plpgsql as $$
declare
  alphabet text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';   -- sin 0/O/1/I/L
  code text;
  i int;
begin
  loop
    code := '';
    for i in 1..6 loop
      code := code || substr(alphabet, 1 + floor(random() * length(alphabet))::int, 1);
    end loop;
    exit when not exists (select 1 from public.classes c where c.class_code = code);
  end loop;
  return code;
end $$;

create table if not exists public.classes (
  id              uuid primary key default gen_random_uuid(),
  teacher_id      uuid not null references public.profiles(id) on delete cascade,
  class_name      text not null,
  academic_year   text not null default '2025-2026',
  class_code      text not null unique default public.statlab_new_class_code(),
  ranking_enabled boolean not null default true,
  ranking_mode    text not null default 'public'
                  check (ranking_mode in ('public', 'private')),  -- 'private' = solo yo ± vecinos
  season_best_n   int not null default 10 check (season_best_n between 1 and 50),
  archived        boolean not null default false,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index if not exists classes_teacher_idx on public.classes (teacher_id);
create index if not exists classes_code_idx on public.classes (class_code);

drop trigger if exists classes_touch on public.classes;
create trigger classes_touch before update on public.classes
  for each row execute function public.touch_updated_at();

create table if not exists public.class_members (
  id         uuid primary key default gen_random_uuid(),
  class_id   uuid not null references public.classes(id) on delete cascade,
  student_id uuid not null references public.profiles(id) on delete cascade,
  joined_at  timestamptz not null default now(),
  active     boolean not null default true,
  unique (class_id, student_id)
);

create index if not exists class_members_class_idx on public.class_members (class_id);
create index if not exists class_members_student_idx on public.class_members (student_id);

-- ---------------------------------------------------------------------------
-- Helpers de autorización. SECURITY DEFINER + STABLE para poder usarlos en
-- políticas sin provocar recursión infinita de RLS.
-- ---------------------------------------------------------------------------
create or replace function public.statlab_is_teacher()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles p where p.id = auth.uid() and p.role in ('teacher','admin'));
$$;

create or replace function public.statlab_owns_class(p_class uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.classes c where c.id = p_class and c.teacher_id = auth.uid());
$$;

create or replace function public.statlab_is_member(p_class uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.class_members m
    where m.class_id = p_class and m.student_id = auth.uid() and m.active
  );
$$;

/* ¿Es el usuario actual profesor de alguna clase en la que esté p_student? */
create or replace function public.statlab_teaches_student(p_student uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1
    from public.class_members m
    join public.classes c on c.id = m.class_id
    where m.student_id = p_student and c.teacher_id = auth.uid()
  );
$$;

/* Clases del alumno actual (para políticas y vistas). */
create or replace function public.statlab_my_class_ids()
returns setof uuid language sql stable security definer set search_path = public as $$
  select class_id from public.class_members where student_id = auth.uid() and active;
$$;

-- ===========================================================================
-- 3. CONTENIDO (mundos, conceptos, niveles, actividades)
-- ===========================================================================
-- El contenido base vive en data/*.json y se sirve como archivos estáticos.
-- Estas tablas existen para (a) integridad referencial de los intentos,
-- (b) contenido creado por el profesorado y (c) analítica agregada en SQL.
-- Son de LECTURA PÚBLICA (contenido docente, no personal).

create table if not exists public.worlds (
  id        text primary key,                    -- 'w01'
  num       int not null,
  title     text not null,
  subtitle  text,
  icon      text,
  requires  text references public.worlds(id),
  created_at timestamptz not null default now()
);

create table if not exists public.concepts (
  id            text primary key,                -- 'p-valor'
  world_id      text not null references public.worlds(id) on delete cascade,
  label         text not null,
  misconception text
);

create index if not exists concepts_world_idx on public.concepts (world_id);

create table if not exists public.levels (
  id       uuid primary key default gen_random_uuid(),
  world_id text not null references public.worlds(id) on delete cascade,
  num      int not null,
  title    text not null,
  unique (world_id, num)
);

create table if not exists public.activities (
  id         text primary key,                   -- 'w03-04' o uuid textual
  world_id   text references public.worlds(id) on delete set null,
  level_id   uuid references public.levels(id) on delete set null,
  concept_id text references public.concepts(id) on delete set null,
  concepts   text[] not null default '{}',
  type       text not null,
  difficulty int not null default 1 check (difficulty between 1 and 3),
  xp         int not null default 10,
  is_builtin boolean not null default true,
  created_by uuid references public.profiles(id) on delete set null,
  payload    jsonb not null default '{}'::jsonb, -- enunciado, opciones, pistas…
  created_at timestamptz not null default now()
);

create index if not exists activities_world_idx on public.activities (world_id);
create index if not exists activities_concept_idx on public.activities (concept_id);

-- ===========================================================================
-- 4. INTENTOS, PROGRESO Y MASTERY
-- ===========================================================================

create table if not exists public.attempts (
  id             uuid primary key default gen_random_uuid(),
  student_id     uuid not null references public.profiles(id) on delete cascade,
  class_id       uuid references public.classes(id) on delete set null,
  activity_id    text,                            -- puede ser generada proceduralmente
  world_id       text references public.worlds(id) on delete set null,
  concept_id     text references public.concepts(id) on delete set null,
  concepts       text[] not null default '{}',
  activity_type  text,
  difficulty     int not null default 1,
  score          numeric(5,4) not null default 0 check (score between 0 and 1),
  correct        boolean not null default false,
  attempt_number int not null default 1,
  hints_used     int not null default 0,
  time_seconds   int not null default 0,
  xp_earned      int not null default 0,
  seed           text,
  answer         jsonb,
  source         text not null default 'practice'
                 check (source in ('practice','campaign','assignment','challenge','game','quick')),
  assignment_id  uuid,
  created_at     timestamptz not null default now()
);

create index if not exists attempts_student_idx on public.attempts (student_id, created_at desc);
create index if not exists attempts_class_idx on public.attempts (class_id, created_at desc);
create index if not exists attempts_concept_idx on public.attempts (concept_id);
create index if not exists attempts_world_idx on public.attempts (world_id);
create index if not exists attempts_concepts_gin on public.attempts using gin (concepts);

create table if not exists public.student_progress (
  student_id           uuid primary key references public.profiles(id) on delete cascade,
  xp                   int not null default 0 check (xp >= 0),
  level                int not null default 1,
  streak_days          int not null default 0,
  longest_streak       int not null default 0,
  last_active_date     date,
  total_time_seconds   int not null default 0,
  activities_completed int not null default 0,
  challenges_completed int not null default 0,
  current_world        text references public.worlds(id) on delete set null,
  last_activity_id     text,
  updated_at           timestamptz not null default now()
);

drop trigger if exists progress_touch on public.student_progress;
create trigger progress_touch before update on public.student_progress
  for each row execute function public.touch_updated_at();

comment on table public.student_progress is
  'XP y nivel son indicadores formativos de progresión. NO son calificación académica.';

create table if not exists public.concept_mastery (
  student_id   uuid not null references public.profiles(id) on delete cascade,
  concept_id   text not null,
  mastery      numeric(5,2) not null default 0 check (mastery between 0 and 100),
  n_responses  int not null default 0,
  last_correct boolean,
  updated_at   timestamptz not null default now(),
  primary key (student_id, concept_id)
);

create index if not exists mastery_concept_idx on public.concept_mastery (concept_id);

comment on table public.concept_mastery is
  'Mastery 0-100 calculado con la fórmula documentada en docs/mastery.md. No es una nota.';

create table if not exists public.study_sessions (
  id             uuid primary key default gen_random_uuid(),
  student_id     uuid not null references public.profiles(id) on delete cascade,
  started_at     timestamptz not null default now(),
  ended_at       timestamptz,
  active_seconds int not null default 0,
  context        text,
  world_id       text references public.worlds(id) on delete set null
);

create index if not exists sessions_student_idx on public.study_sessions (student_id, started_at desc);

comment on column public.study_sessions.active_seconds is
  'Tiempo ACTIVO estimado por interacción, no tiempo con la pestaña abierta.';

-- ===========================================================================
-- 5. LOGROS
-- ===========================================================================

create table if not exists public.achievements (
  code        text primary key,
  name        text not null,
  description text not null,
  icon        text,
  kind        text not null default 'aggregate',
  xp          int not null default 0,
  rule        jsonb not null default '{}'::jsonb,
  active      boolean not null default true
);

create table if not exists public.student_achievements (
  id               uuid primary key default gen_random_uuid(),
  student_id       uuid not null references public.profiles(id) on delete cascade,
  achievement_code text not null references public.achievements(code) on delete cascade,
  earned_at        timestamptz not null default now(),
  context          jsonb,
  unique (student_id, achievement_code)
);

create index if not exists student_ach_idx on public.student_achievements (student_id);

-- ===========================================================================
-- 6. ACTIVIDADES ASIGNADAS (MODO CLASE)
-- ===========================================================================

create table if not exists public.assignments (
  id            uuid primary key default gen_random_uuid(),
  class_id      uuid not null references public.classes(id) on delete cascade,
  teacher_id    uuid not null references public.profiles(id) on delete cascade,
  title         text not null,
  description   text,
  world_id      text references public.worlds(id) on delete set null,
  concepts      text[] not null default '{}',
  difficulty    int check (difficulty between 1 and 3),
  n_exercises   int not null default 5 check (n_exercises between 1 and 50),
  max_attempts  int not null default 3,
  feedback_mode text not null default 'immediate' check (feedback_mode in ('immediate','after')),
  opens_at      timestamptz,
  due_at        timestamptz,
  published     boolean not null default false,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index if not exists assignments_class_idx on public.assignments (class_id, due_at);

drop trigger if exists assignments_touch on public.assignments;
create trigger assignments_touch before update on public.assignments
  for each row execute function public.touch_updated_at();

create table if not exists public.assignment_progress (
  id              uuid primary key default gen_random_uuid(),
  assignment_id   uuid not null references public.assignments(id) on delete cascade,
  student_id      uuid not null references public.profiles(id) on delete cascade,
  completed_count int not null default 0,
  correct_count   int not null default 0,
  score           numeric(5,4),
  time_seconds    int not null default 0,
  completed_at    timestamptz,
  updated_at      timestamptz not null default now(),
  unique (assignment_id, student_id)
);

-- ===========================================================================
-- 7. RETO DE LA SEMANA
-- ===========================================================================
-- SEPARACIÓN CRÍTICA:
--   `configuration` → parte visible por el alumno (briefing, pasos SIN respuestas)
--   `solution`      → respuestas y explicaciones. NINGUNA política la expone
--                     a los estudiantes antes de `solution_available_at`.
-- La corrección se hace con funciones SECURITY DEFINER que leen `solution`
-- sin devolverla.

create table if not exists public.weekly_challenges (
  id                     uuid primary key default gen_random_uuid(),
  class_id               uuid not null references public.classes(id) on delete cascade,
  teacher_id             uuid not null references public.profiles(id) on delete cascade,
  number                 int,                       -- «Reto #7»
  title                  text not null,
  description            text,
  challenge_type         text not null default 'clinical_case'
                         check (challenge_type in ('clinical_case','detective','mystery_chart','bayes',
                                                   'diagnostic','data','research','regression','reviewer2')),
  world_id               text references public.worlds(id) on delete set null,
  concepts               text[] not null default '{}',
  difficulty             int not null default 2 check (difficulty between 1 and 3),
  configuration          jsonb not null default '{}'::jsonb,
  solution               jsonb not null default '{}'::jsonb,
  builtin_template       text,                      -- id de plantilla de data/challenges
  opens_at               timestamptz not null default now(),
  closes_at              timestamptz not null default (now() + interval '7 days'),
  recommended_seconds    int not null default 900 check (recommended_seconds > 0),
  max_attempts           int not null default 3 check (max_attempts between 1 and 20),
  competitive_attempts   text not null default 'first'
                         check (competitive_attempts in ('first','best','single','all')),
  allow_hints            boolean not null default true,
  solution_policy        text not null default 'on_close'
                         check (solution_policy in ('immediate','on_close','manual')),
  solution_available_at  timestamptz,
  show_ranking           boolean not null default true,
  counts_for_season      boolean not null default true,
  scoring_config         jsonb not null default '{}'::jsonb,  -- pesos personalizados
  published              boolean not null default false,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now(),
  constraint challenge_window check (closes_at > opens_at)
);

create index if not exists challenges_class_idx on public.weekly_challenges (class_id, opens_at desc);
create index if not exists challenges_open_idx on public.weekly_challenges (published, opens_at, closes_at);

drop trigger if exists challenges_touch on public.weekly_challenges;
create trigger challenges_touch before update on public.weekly_challenges
  for each row execute function public.touch_updated_at();

comment on column public.weekly_challenges.competitive_attempts is
  'Política del intento que cuenta para el ranking. Por defecto "first": el primer intento válido. '
  'Evita que se repita el reto memorizando respuestas antes de entrar en el ranking.';

create table if not exists public.weekly_challenge_attempts (
  id                  uuid primary key default gen_random_uuid(),
  challenge_id        uuid not null references public.weekly_challenges(id) on delete cascade,
  student_id          uuid not null references public.profiles(id) on delete cascade,
  attempt_number      int not null default 1,
  started_at          timestamptz not null default now(),
  completed_at        timestamptz,
  active_time_seconds int not null default 0,
  score               numeric(5,4) not null default 0 check (score between 0 and 1),
  challenge_points    int not null default 0 check (challenge_points between 0 and 1000),
  points_breakdown    jsonb not null default '{}'::jsonb,
  xp_earned           int not null default 0,
  errors              int not null default 0,
  hints_used          int not null default 0,
  completed           boolean not null default false,
  first_attempt       boolean not null default false,
  rank_eligible       boolean not null default false,
  practice_mode       boolean not null default false,
  created_at          timestamptz not null default now(),
  unique (challenge_id, student_id, attempt_number)
);

create index if not exists ch_attempts_challenge_idx on public.weekly_challenge_attempts (challenge_id, challenge_points desc);
create index if not exists ch_attempts_student_idx on public.weekly_challenge_attempts (student_id, completed_at desc);
create index if not exists ch_attempts_rank_idx on public.weekly_challenge_attempts (challenge_id, rank_eligible, challenge_points desc);

create table if not exists public.weekly_challenge_steps (
  id           uuid primary key default gen_random_uuid(),
  attempt_id   uuid not null references public.weekly_challenge_attempts(id) on delete cascade,
  step_id      text not null,
  step_index   int not null default 0,
  concept_id   text,
  weight       numeric(4,2) not null default 1,
  score        numeric(5,4) not null default 0 check (score between 0 and 1),
  correct      boolean not null default false,
  errors       int not null default 0,
  hints_used   int not null default 0,
  time_seconds int not null default 0,
  answer       jsonb,
  answered_at  timestamptz not null default now(),
  unique (attempt_id, step_id)
);

create index if not exists ch_steps_attempt_idx on public.weekly_challenge_steps (attempt_id, step_index);
create index if not exists ch_steps_step_idx on public.weekly_challenge_steps (step_id);

create table if not exists public.challenge_bonuses (
  id           uuid primary key default gen_random_uuid(),
  challenge_id uuid not null references public.weekly_challenges(id) on delete cascade,
  student_id   uuid not null references public.profiles(id) on delete cascade,
  position     int,
  kind         text not null default 'rank' check (kind in ('rank','most_improved','comeback')),
  xp           int not null default 0,
  awarded_at   timestamptz not null default now(),
  unique (challenge_id, student_id, kind)
);

-- ===========================================================================
-- 8. CORRECCIÓN EN EL SERVIDOR
-- ===========================================================================
-- Implementa las mismas fórmulas que js/scoring.js, pero del lado del
-- servidor, de modo que:
--   · el alumno nunca recibe las respuestas correctas antes de tiempo;
--   · no puede falsear su puntuación manipulando el JavaScript;
--   · el profesor puede auditar cómo se calculó cada punto.

/* Crédito parcial de selección múltiple: (aciertos − falsos positivos)/n_correctas */
create or replace function public.statlab_multi_score(p_selected jsonb, p_correct jsonb)
returns numeric language plpgsql immutable as $$
declare
  hits int := 0; fp int := 0; ncor int;
  v text;
begin
  ncor := coalesce(jsonb_array_length(p_correct), 0);
  if ncor = 0 then return 0; end if;
  for v in select jsonb_array_elements_text(coalesce(p_selected, '[]'::jsonb)) loop
    if p_correct @> to_jsonb(v) then hits := hits + 1; else fp := fp + 1; end if;
  end loop;
  return greatest(0, least(1, (hits - fp)::numeric / ncor));
end $$;

/* Corrige un paso. Devuelve la puntuación en [0,1]. */
create or replace function public.statlab_grade_step(p_step jsonb, p_answer jsonb)
returns numeric language plpgsql immutable as $$
declare
  t text := p_step ->> 'type';
  correct_ids jsonb;
  total int := 0; ok int := 0;
  item jsonb; claim jsonb; cell text;
  tol numeric; val numeric; target numeric;
  chosen text; primary_score numeric; just numeric;
  ids text[]; i int; j int; pairs int := 0; conc int := 0;
  pos_map jsonb;
begin
  if p_step is null or p_answer is null then return 0; end if;

  case t
    when 'mcq', 'chart-pick' then
      return case when (p_answer #>> '{}') = (p_step ->> 'answer') then 1 else 0 end;

    when 'multi', 'chart-fix' then
      correct_ids := p_step -> 'answer';
      if correct_ids is null or jsonb_typeof(correct_ids) <> 'array' then
        select coalesce(jsonb_agg(o ->> 'id'), '[]'::jsonb) into correct_ids
        from jsonb_array_elements(p_step -> 'options') o
        where (o ->> 'correct')::boolean is true;
      end if;
      return public.statlab_multi_score(p_answer, correct_ids);

    when 'numeric' then
      tol := coalesce((p_step ->> 'tolerance')::numeric, 0);
      target := (p_step ->> 'answer')::numeric;
      begin val := (p_answer #>> '{}')::numeric; exception when others then return 0; end;
      return case when abs(val - target) <= tol + 1e-9 then 1 else 0 end;

    when 'classify' then
      for item in select * from jsonb_array_elements(p_step -> 'items') loop
        total := total + 1;
        if (p_answer ->> (item ->> 'id')) = (item ->> 'bin') then ok := ok + 1; end if;
      end loop;
      return case when total = 0 then 0 else ok::numeric / total end;

    when 'claim-audit' then
      for claim in select * from jsonb_array_elements(p_step -> 'claims') loop
        total := total + 1;
        if (p_answer ->> (claim ->> 'id'))::boolean is not distinct from (claim ->> 'correct')::boolean
        then ok := ok + 1; end if;
      end loop;
      return case when total = 0 then 0 else ok::numeric / total end;

    when 'order' then
      select array_agg(x) into ids from jsonb_array_elements_text(p_answer) x;
      select jsonb_object_agg(it ->> 'id', it -> 'pos') into pos_map
        from jsonb_array_elements(p_step -> 'items') it;
      if ids is null or array_length(ids, 1) is null then return 0; end if;
      for i in 1 .. array_length(ids, 1) loop
        for j in i + 1 .. array_length(ids, 1) loop
          pairs := pairs + 1;
          if (pos_map ->> ids[i])::int < (pos_map ->> ids[j])::int then conc := conc + 1; end if;
        end loop;
      end loop;
      return case when pairs = 0 then 0 else conc::numeric / pairs end;

    when 'decision' then
      chosen := p_answer ->> 'chosen';
      primary_score := case
        when chosen = (p_step ->> 'answer') then 1
        when coalesce(p_step -> 'acceptable', '[]'::jsonb) @> to_jsonb(chosen) then 0.6
        else 0 end;
      if p_step -> 'justify' is null then return primary_score; end if;
      select coalesce(jsonb_agg(o ->> 'id'), '[]'::jsonb) into correct_ids
        from jsonb_array_elements(p_step -> 'justify' -> 'options') o
        where (o ->> 'correct')::boolean is true;
      just := public.statlab_multi_score(p_answer -> 'justification', correct_ids);
      return round(0.7 * primary_score + 0.3 * just, 4);

    when 'table2x2' then
      total := 0; ok := 0;
      foreach cell in array array['tp','fp','fn','tn'] loop
        total := total + 1;
        if (p_answer -> 'cells' ->> cell)::numeric
           = (p_step -> 'answer' ->> cell)::numeric then ok := ok + 1; end if;
      end loop;
      return case when total = 0 then 0 else ok::numeric / total end;

    else
      return 0;
  end case;
exception when others then
  return 0;                                    -- una respuesta malformada vale 0, no rompe
end $$;

comment on function public.statlab_grade_step is
  'Corrección de un paso de reto en el servidor. Mismas fórmulas que js/scoring.js.';

/* ---------------------------------------------------------------------------
 * Iniciar un intento de reto. Valida ventana temporal, pertenencia a la clase
 * y número de intentos. Determina rank_eligible según la política del reto.
 * Devuelve la parte VISIBLE del reto (configuration), nunca la solución.
 * ------------------------------------------------------------------------- */
create or replace function public.statlab_start_challenge_attempt(p_challenge uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  ch public.weekly_challenges;
  n_prev int;
  eligible boolean;
  practice boolean := false;
  att public.weekly_challenge_attempts;
begin
  select * into ch from public.weekly_challenges where id = p_challenge and published;
  if not found then raise exception 'Reto no disponible'; end if;
  if not public.statlab_is_member(ch.class_id) then
    raise exception 'No perteneces a la clase de este reto';
  end if;
  if now() < ch.opens_at then raise exception 'El reto todavía no está abierto'; end if;

  select count(*) into n_prev
  from public.weekly_challenge_attempts a
  where a.challenge_id = p_challenge and a.student_id = auth.uid();

  if n_prev >= ch.max_attempts then raise exception 'Has agotado los intentos de este reto'; end if;

  -- Fuera de plazo se permite practicar, pero nunca puntúa para el ranking.
  if now() > ch.closes_at then practice := true; end if;

  eligible := case
    when practice then false
    when ch.competitive_attempts in ('first','single') then n_prev = 0
    when ch.competitive_attempts = 'best' then true
    when ch.competitive_attempts = 'all' then true
    else n_prev = 0 end;

  insert into public.weekly_challenge_attempts
    (challenge_id, student_id, attempt_number, first_attempt, rank_eligible, practice_mode)
  values (p_challenge, auth.uid(), n_prev + 1, n_prev = 0, eligible, practice)
  returning * into att;

  return jsonb_build_object(
    'attempt_id', att.id,
    'attempt_number', att.attempt_number,
    'rank_eligible', att.rank_eligible,
    'practice_mode', att.practice_mode,
    'started_at', att.started_at,
    'recommended_seconds', ch.recommended_seconds,
    'allow_hints', ch.allow_hints,
    'configuration', ch.configuration
  );
end $$;

/* ---------------------------------------------------------------------------
 * Enviar la respuesta de un paso. Corrige en el servidor y guarda.
 * Devuelve solo la puntuación (y la explicación únicamente si la solución ya
 * está disponible, según la política del reto).
 * ------------------------------------------------------------------------- */
create or replace function public.statlab_submit_challenge_step(
  p_attempt uuid,
  p_step_id text,
  p_answer jsonb,
  p_errors int default 0,
  p_hints int default 0,
  p_seconds int default 0
) returns jsonb language plpgsql security definer set search_path = public as $$
declare
  att public.weekly_challenge_attempts;
  ch public.weekly_challenges;
  step jsonb;
  idx int;
  s numeric;
  reveal boolean;
begin
  select * into att from public.weekly_challenge_attempts where id = p_attempt;
  if not found or att.student_id <> auth.uid() then raise exception 'Intento no encontrado'; end if;
  if att.completed then raise exception 'El intento ya está cerrado'; end if;

  select * into ch from public.weekly_challenges where id = att.challenge_id;

  select value, ordinality - 1 into step, idx
  from jsonb_array_elements(ch.solution -> 'steps') with ordinality
  where value ->> 'id' = p_step_id
  limit 1;

  if step is null then raise exception 'Paso desconocido'; end if;

  s := public.statlab_grade_step(step, p_answer);

  insert into public.weekly_challenge_steps
    (attempt_id, step_id, step_index, concept_id, weight, score, correct, errors, hints_used, time_seconds, answer)
  values (
    p_attempt, p_step_id, coalesce(idx, 0), step ->> 'concept',
    coalesce((step ->> 'weight')::numeric, 1),
    s, s >= 0.999, greatest(0, p_errors), greatest(0, p_hints), greatest(0, p_seconds), p_answer
  )
  on conflict (attempt_id, step_id) do update
    set score = excluded.score, correct = excluded.correct,
        errors = public.weekly_challenge_steps.errors + excluded.errors,
        hints_used = greatest(public.weekly_challenge_steps.hints_used, excluded.hints_used),
        time_seconds = excluded.time_seconds, answer = excluded.answer, answered_at = now();

  reveal := public.statlab_solution_available(ch.solution_policy, ch.closes_at, ch.solution_available_at);

  return jsonb_build_object(
    'score', s,
    'correct', s >= 0.999,
    'explanation', case when reveal then step ->> 'explanation' else null end
  );
end $$;

/* ¿Está disponible la solución de este reto?
   Recibe columnas escalares (no la fila completa) A PROPÓSITO: si tomara el
   tipo compuesto `weekly_challenges`, una vista que la invocara necesitaría
   privilegio SELECT sobre TODAS las columnas, incluida `solution`, que está
   revocada. Con escalares la vista del alumno funciona sin poder ver nunca
   las respuestas. */
create or replace function public.statlab_solution_available(
  p_policy text,
  p_closes timestamptz,
  p_available timestamptz
) returns boolean language sql stable as $$
  select case p_policy
    when 'immediate' then true
    when 'on_close'  then now() > p_closes
    when 'manual'    then p_available is not null and now() >= p_available
    else false end;
$$;

/* ---------------------------------------------------------------------------
 * Cerrar el intento y calcular los CHALLENGE POINTS (máx. 1.000).
 *   exactitud    700 · Σ(w·s)/Σ(w)
 *   eficiencia   150 · E/(E+errores),  E = max(2, pasos/2)
 *   tiempo       100 si t ≤ t_ref; después 100/(1+(t/t_ref−1)^1.35), suelo 25
 *   pistas        50 · (1 − usadas/disponibles)
 * Las mismas fórmulas que js/scoring.js y docs/scoring.md.
 * ------------------------------------------------------------------------- */
create or replace function public.statlab_finish_challenge_attempt(
  p_attempt uuid,
  p_active_seconds int
) returns jsonb language plpgsql security definer set search_path = public as $$
declare
  att public.weekly_challenge_attempts;
  ch public.weekly_challenges;
  cfg jsonb;
  acc_max numeric; eff_max numeric; tim_max numeric; hin_max numeric;
  tim_floor numeric; tim_exp numeric;
  n_steps int; sum_w numeric; sum_ws numeric;
  tot_err int; tot_hints int; avail_hints int;
  frac numeric; e_ref numeric; ratio numeric;
  acc numeric; eff numeric; tim numeric; hin numeric; total int;
  v_xp int;
begin
  select * into att from public.weekly_challenge_attempts where id = p_attempt;
  if not found or att.student_id <> auth.uid() then raise exception 'Intento no encontrado'; end if;
  if att.completed then return att.points_breakdown; end if;

  select * into ch from public.weekly_challenges where id = att.challenge_id;
  cfg := coalesce(nullif(ch.scoring_config, '{}'::jsonb), '{}'::jsonb);

  acc_max   := coalesce((cfg ->> 'accuracyMax')::numeric, 700);
  eff_max   := coalesce((cfg ->> 'efficiencyMax')::numeric, 150);
  tim_max   := coalesce((cfg ->> 'timeMax')::numeric, 100);
  hin_max   := coalesce((cfg ->> 'hintsMax')::numeric, 50);
  tim_floor := coalesce((cfg ->> 'timeFloor')::numeric, 25);
  tim_exp   := coalesce((cfg ->> 'timeExponent')::numeric, 1.35);

  select count(*), coalesce(sum(weight), 0), coalesce(sum(weight * score), 0),
         coalesce(sum(errors), 0), coalesce(sum(hints_used), 0)
    into n_steps, sum_w, sum_ws, tot_err, tot_hints
  from public.weekly_challenge_steps where attempt_id = p_attempt;

  select coalesce(sum(coalesce(jsonb_array_length(s -> 'hints'), 0)), 0) into avail_hints
  from jsonb_array_elements(ch.solution -> 'steps') s;

  frac  := case when sum_w > 0 then sum_ws / sum_w else 0 end;
  acc   := acc_max * frac;

  e_ref := greatest(2, n_steps::numeric / 2);
  eff   := eff_max * (e_ref / (e_ref + greatest(0, tot_err)));

  ratio := case when ch.recommended_seconds > 0
                then greatest(0, p_active_seconds)::numeric / ch.recommended_seconds else 0 end;
  -- El suelo nunca supera el máximo (si el profesor pone timeMax = 0, el
  -- componente temporal vale 0, no el suelo por defecto).
  tim   := case when ratio <= 1 then tim_max
                else greatest(least(tim_floor, tim_max), tim_max / (1 + power(ratio - 1, tim_exp))) end;

  hin   := case when coalesce(avail_hints, 0) = 0 or not ch.allow_hints then hin_max
                else hin_max * (1 - least(1, tot_hints::numeric / avail_hints)) end;

  total := round(acc + eff + tim + hin);
  total := greatest(0, least(1000, total));
  v_xp  := round(40 + 60 * frac);

  update public.weekly_challenge_attempts set
    completed = true,
    completed_at = now(),
    active_time_seconds = greatest(0, p_active_seconds),
    score = round(frac, 4),
    challenge_points = total,
    errors = tot_err,
    hints_used = tot_hints,
    xp_earned = v_xp,
    points_breakdown = jsonb_build_object(
      'accuracy', jsonb_build_object('points', round(acc, 1), 'max', acc_max, 'fraction', round(frac, 4)),
      'efficiency', jsonb_build_object('points', round(eff, 1), 'max', eff_max, 'errors', tot_err, 'reference', round(e_ref, 2)),
      'time', jsonb_build_object('points', round(tim, 1), 'max', tim_max, 'activeSeconds', p_active_seconds,
                                 'referenceSeconds', ch.recommended_seconds, 'ratio', round(ratio, 3)),
      'hints', jsonb_build_object('points', round(hin, 1), 'max', hin_max, 'used', tot_hints, 'available', avail_hints),
      'total', total, 'perfectRun', (tot_err = 0 and frac >= 0.9999), 'noHints', (tot_hints = 0)
    )
  where id = p_attempt;

  -- XP a la progresión general (separado de los Challenge Points)
  update public.student_progress p
     set xp = p.xp + v_xp,
         challenges_completed = p.challenges_completed + 1
   where p.student_id = auth.uid();

  select points_breakdown into cfg from public.weekly_challenge_attempts where id = p_attempt;
  return cfg;
end $$;

-- ===========================================================================
-- 9. VISTAS DE RANKING Y ANALÍTICA
-- ===========================================================================
-- Los rankings se exponen SOLO por estas vistas, que proyectan alias,
-- puntuación y posición. Nunca nombre ni correo.

create or replace view public.v_weekly_ranking as
select
  a.challenge_id,
  c.class_id,
  rank() over (partition by a.challenge_id order by a.challenge_points desc, a.active_time_seconds asc) as position,
  coalesce(p.alias, 'Anónimo') as alias,
  a.challenge_points,
  a.active_time_seconds,
  a.errors,
  a.hints_used,
  (a.errors = 0 and a.score >= 0.9999) as perfect_run,
  a.student_id                                  -- solo para resaltar «tú»
from public.weekly_challenge_attempts a
join public.weekly_challenges c on c.id = a.challenge_id
join public.profiles p on p.id = a.student_id
where a.completed and a.rank_eligible and not a.practice_mode
  and c.published
  -- FILTRO DE ACCESO DENTRO DE LA VISTA. Esta vista se ejecuta con los
  -- privilegios de su propietario (semántica «definer»), porque de otro modo
  -- el alumno solo podría leer SU fila de `profiles` y el ranking quedaría
  -- vacío. Para compensar, el acceso se restringe aquí explícitamente: solo
  -- se devuelven filas de clases donde el usuario es miembro (y el ranking
  -- está activado) o donde es el profesor. Se proyecta el ALIAS, nunca el
  -- nombre ni el correo.
  and (
    (c.show_ranking and public.statlab_is_member(c.class_id)
       and exists (select 1 from public.classes cl where cl.id = c.class_id and cl.ranking_enabled))
    or c.teacher_id = auth.uid()
  );

comment on view public.v_weekly_ranking is
  'Ranking semanal por reto: alias, puntos y posición. Filtra el acceso a la propia clase dentro de la vista.';

/* Mejor intento competitivo por reto y estudiante (base de la temporada). */
create or replace view public.v_challenge_best as
select distinct on (a.challenge_id, a.student_id)
  a.challenge_id, a.student_id, c.class_id, c.counts_for_season,
  a.challenge_points, a.active_time_seconds, a.score, a.errors, a.hints_used
from public.weekly_challenge_attempts a
join public.weekly_challenges c on c.id = a.challenge_id
where a.completed and a.rank_eligible and not a.practice_mode
  and (public.statlab_is_member(c.class_id) or c.teacher_id = auth.uid())
order by a.challenge_id, a.student_id, a.challenge_points desc, a.completed_at asc;

/* ---------------------------------------------------------------------------
 * RANKING DE TEMPORADA — «mejores N retos» (N configurable por clase).
 * Se calcula dinámicamente: no se almacena, así que nunca queda desfasado.
 * Una ausencia puntual no hunde la clasificación porque solo cuentan los N
 * mejores resultados de cada estudiante.
 * ------------------------------------------------------------------------- */
create or replace view public.v_seasonal_ranking as
with visible as (
  select a.challenge_id, a.student_id, c.class_id, c.counts_for_season,
         a.challenge_points, a.completed_at
  from public.weekly_challenge_attempts a
  join public.weekly_challenges c on c.id = a.challenge_id
  where a.completed and a.rank_eligible and not a.practice_mode and c.published
    and (
      (c.show_ranking and public.statlab_is_member(c.class_id))
      or c.teacher_id = auth.uid()
    )
),
best as (
  select distinct on (challenge_id, student_id)
    challenge_id, student_id, class_id, counts_for_season, challenge_points
  from visible
  order by challenge_id, student_id, challenge_points desc, completed_at asc
),
ranked as (
  select b.class_id, b.student_id, b.challenge_points,
         row_number() over (partition by b.class_id, b.student_id order by b.challenge_points desc) as rn,
         cl.season_best_n
  from best b
  join public.classes cl on cl.id = b.class_id
  where b.counts_for_season
),
kept as (
  select class_id, student_id, sum(challenge_points) as total_points, count(*) as counted
  from ranked
  where rn <= season_best_n
  group by class_id, student_id
),
allc as (
  select class_id, student_id, count(*) as challenges_done, avg(challenge_points) as avg_points
  from best
  group by class_id, student_id
)
select
  k.class_id,
  rank() over (partition by k.class_id order by k.total_points desc) as position,
  coalesce(p.alias, 'Anónimo') as alias,
  k.total_points,
  k.counted as challenges_counted,
  a.challenges_done,
  round(a.avg_points, 1) as avg_points,
  k.student_id
from kept k
join allc a on a.class_id = k.class_id and a.student_id = k.student_id
join public.profiles p on p.id = k.student_id;

comment on view public.v_seasonal_ranking is
  'Acumula los mejores N retos de cada estudiante (classes.season_best_n). Protege de una semana mala.';

/* MOST IMPROVED: compara el último reto con la media de los anteriores.
   Reconocimiento independiente del ranking, para que no gane siempre quien
   partía mejor. */
create or replace view public.v_most_improved as
with visible as (
  select a.student_id, c.class_id, a.challenge_id, a.challenge_points, a.completed_at,
         row_number() over (partition by a.student_id order by a.completed_at desc) as rn
  from public.weekly_challenge_attempts a
  join public.weekly_challenges c on c.id = a.challenge_id
  where a.completed and a.rank_eligible and not a.practice_mode
    and (public.statlab_is_member(c.class_id) or c.teacher_id = auth.uid())
),
latest as (select * from visible where rn = 1),
history as (
  select student_id, avg(challenge_points) as prev_avg, count(*) as n_prev
  from visible where rn > 1 group by student_id
)
select
  l.class_id, l.challenge_id, coalesce(p.alias, 'Anónimo') as alias, l.student_id,
  l.challenge_points as latest_points,
  round(h.prev_avg, 1) as previous_average,
  round(l.challenge_points - h.prev_avg, 1) as improvement,
  h.n_prev
from latest l
join history h on h.student_id = l.student_id and h.n_prev >= 1
join public.profiles p on p.id = l.student_id
where l.challenge_points > h.prev_avg;

/* ¿DÓNDE FALLÓ LA CLASE? Porcentaje de acierto por paso. SOLO PROFESORADO. */
create or replace view public.v_challenge_step_analytics as
select
  a.challenge_id,
  s.step_id,
  min(s.step_index) as step_index,
  max(s.concept_id) as concept_id,
  count(*) as answered,
  round(avg(s.score) * 100, 1) as mean_score_pct,
  round(100.0 * sum(case when s.correct then 1 else 0 end) / count(*), 1) as correct_pct,
  round(avg(s.errors), 2) as mean_errors,
  sum(s.hints_used) as hints_used
from public.weekly_challenge_steps s
join public.weekly_challenge_attempts a on a.id = s.attempt_id
join public.weekly_challenges c on c.id = a.challenge_id
where a.rank_eligible and not a.practice_mode
  and c.teacher_id = auth.uid()                 -- restricción de acceso en la vista
group by a.challenge_id, s.step_id;

comment on view public.v_challenge_step_analytics is
  'Base de la pantalla «¿dónde falló la clase?». Solo la ve el profesor de la clase.';

/* Dificultad por concepto dentro de una clase. SOLO PROFESORADO. */
create or replace view public.v_class_concept_difficulty as
select
  m.class_id,
  t.concept_id,
  count(*) as attempts,
  round(100.0 * sum(case when t.correct then 1 else 0 end) / count(*), 1) as correct_pct,
  round(avg(t.score) * 100, 1) as mean_score_pct,
  round(avg(t.hints_used), 2) as mean_hints,
  count(distinct t.student_id) as students
from public.attempts t
join public.class_members m on m.student_id = t.student_id
join public.classes cl on cl.id = m.class_id
where t.concept_id is not null and cl.teacher_id = auth.uid()
group by m.class_id, t.concept_id;

/* Resumen de clase. SOLO PROFESORADO. */
create or replace view public.v_class_summary as
select
  c.id as class_id,
  c.class_name,
  count(distinct m.student_id) as students,
  count(distinct case when t.created_at > now() - interval '7 days' then t.student_id end) as active_7d,
  coalesce(round(avg(cm.mastery), 1), 0) as mean_mastery,
  coalesce(round(100.0 * sum(case when t.correct then 1 else 0 end) / nullif(count(t.id), 0), 1), 0) as mean_accuracy_pct,
  coalesce(sum(t.time_seconds), 0) as total_time_seconds
from public.classes c
left join public.class_members m on m.class_id = c.id and m.active
left join public.attempts t on t.student_id = m.student_id
left join public.concept_mastery cm on cm.student_id = m.student_id
where c.teacher_id = auth.uid()
group by c.id, c.class_name;

/* Vista de retos para el alumno. NO contiene la columna `solution`: las
   respuestas se obtienen con statlab_challenge_solution(), que comprueba
   permisos y disponibilidad. */
create or replace view public.v_student_challenges
with (security_invoker = true) as
select
  ch.id, ch.class_id, ch.number, ch.title, ch.description, ch.challenge_type,
  ch.world_id, ch.concepts, ch.difficulty, ch.configuration,
  ch.opens_at, ch.closes_at, ch.recommended_seconds, ch.max_attempts,
  ch.competitive_attempts, ch.allow_hints, ch.show_ranking, ch.counts_for_season,
  ch.solution_policy, ch.solution_available_at,
  public.statlab_solution_available(ch.solution_policy, ch.closes_at, ch.solution_available_at) as solution_available
from public.weekly_challenges ch
where ch.published;

comment on view public.v_student_challenges is
  'Retos visibles por el alumnado. Sin columna de soluciones: se piden a statlab_challenge_solution().';

/* ---------------------------------------------------------------------------
 * Entrega de la solución de un reto. Es la ÚNICA vía de acceso a las
 * respuestas correctas:
 *   · el profesor de la clase siempre puede verla (para revisar y publicar);
 *   · el alumnado solo cuando la política del reto la ha liberado.
 * La columna `solution` está revocada para el rol `authenticated`, así que
 * ni un SELECT * ni un UPDATE ... RETURNING la devuelven.
 * ------------------------------------------------------------------------- */
create or replace function public.statlab_challenge_solution(p_challenge uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare ch public.weekly_challenges;
begin
  select * into ch from public.weekly_challenges where id = p_challenge;
  if not found then raise exception 'Reto no encontrado'; end if;

  if ch.teacher_id = auth.uid() then
    return ch.solution;
  end if;

  if public.statlab_is_member(ch.class_id) and ch.published
     and public.statlab_solution_available(ch.solution_policy, ch.closes_at, ch.solution_available_at) then
    return ch.solution;
  end if;

  raise exception 'SOLUCION_NO_DISPONIBLE';
end $$;

-- ===========================================================================
-- 10. ROW LEVEL SECURITY
-- ===========================================================================

alter table public.profiles              enable row level security;
alter table public.classes               enable row level security;
alter table public.class_members         enable row level security;
alter table public.worlds                enable row level security;
alter table public.concepts              enable row level security;
alter table public.levels                enable row level security;
alter table public.activities            enable row level security;
alter table public.attempts              enable row level security;
alter table public.student_progress      enable row level security;
alter table public.concept_mastery       enable row level security;
alter table public.study_sessions        enable row level security;
alter table public.achievements          enable row level security;
alter table public.student_achievements  enable row level security;
alter table public.assignments           enable row level security;
alter table public.assignment_progress   enable row level security;
alter table public.weekly_challenges     enable row level security;
alter table public.weekly_challenge_attempts enable row level security;
alter table public.weekly_challenge_steps    enable row level security;
alter table public.challenge_bonuses     enable row level security;

-- ---------------------------------------------------------------- profiles --
drop policy if exists profiles_select_own on public.profiles;
create policy profiles_select_own on public.profiles
  for select using (id = auth.uid());

drop policy if exists profiles_select_teacher on public.profiles;
create policy profiles_select_teacher on public.profiles
  for select using (public.statlab_teaches_student(id));

drop policy if exists profiles_update_own on public.profiles;
create policy profiles_update_own on public.profiles
  for update using (id = auth.uid())
  with check (
    id = auth.uid()
    -- El alumno NO puede cambiar su propio rol.
    and role = (select role from public.profiles p2 where p2.id = auth.uid())
  );

drop policy if exists profiles_insert_own on public.profiles;
create policy profiles_insert_own on public.profiles
  for insert with check (id = auth.uid() and role = 'student');

-- ----------------------------------------------------------------- classes --
drop policy if exists classes_teacher_all on public.classes;
create policy classes_teacher_all on public.classes
  for all using (teacher_id = auth.uid()) with check (teacher_id = auth.uid());

drop policy if exists classes_member_select on public.classes;
create policy classes_member_select on public.classes
  for select using (public.statlab_is_member(id));

-- ------------------------------------------------------------ class_members --
drop policy if exists members_self_select on public.class_members;
create policy members_self_select on public.class_members
  for select using (student_id = auth.uid() or public.statlab_owns_class(class_id));

drop policy if exists members_self_join on public.class_members;
create policy members_self_join on public.class_members
  for insert with check (student_id = auth.uid());

drop policy if exists members_teacher_manage on public.class_members;
create policy members_teacher_manage on public.class_members
  for delete using (public.statlab_owns_class(class_id));

drop policy if exists members_teacher_update on public.class_members;
create policy members_teacher_update on public.class_members
  for update using (public.statlab_owns_class(class_id));

-- ----------------------------------------------------- contenido (público) --
do $$
declare tname text;
begin
  foreach tname in array array['worlds','concepts','levels','activities','achievements'] loop
    execute format('drop policy if exists %I_read_all on public.%I', tname, tname);
    execute format('create policy %I_read_all on public.%I for select using (true)', tname, tname);
    execute format('drop policy if exists %I_teacher_write on public.%I', tname, tname);
    execute format($f$create policy %I_teacher_write on public.%I for all
                      using (public.statlab_is_teacher()) with check (public.statlab_is_teacher())$f$, tname, tname);
  end loop;
end $$;

-- ---------------------------------------------------------------- attempts --
drop policy if exists attempts_own_select on public.attempts;
create policy attempts_own_select on public.attempts
  for select using (student_id = auth.uid());

drop policy if exists attempts_teacher_select on public.attempts;
create policy attempts_teacher_select on public.attempts
  for select using (public.statlab_teaches_student(student_id));

drop policy if exists attempts_own_insert on public.attempts;
create policy attempts_own_insert on public.attempts
  for insert with check (student_id = auth.uid());

-- Los intentos son un registro histórico: no se editan ni se borran.
-- (Sin políticas de UPDATE/DELETE, RLS las deniega por defecto.)

-- -------------------------------------------------------- student_progress --
drop policy if exists progress_own on public.student_progress;
create policy progress_own on public.student_progress
  for all using (student_id = auth.uid()) with check (student_id = auth.uid());

drop policy if exists progress_teacher_select on public.student_progress;
create policy progress_teacher_select on public.student_progress
  for select using (public.statlab_teaches_student(student_id));

-- --------------------------------------------------------- concept_mastery --
drop policy if exists mastery_own on public.concept_mastery;
create policy mastery_own on public.concept_mastery
  for all using (student_id = auth.uid()) with check (student_id = auth.uid());

drop policy if exists mastery_teacher_select on public.concept_mastery;
create policy mastery_teacher_select on public.concept_mastery
  for select using (public.statlab_teaches_student(student_id));

-- ---------------------------------------------------------- study_sessions --
drop policy if exists sessions_own on public.study_sessions;
create policy sessions_own on public.study_sessions
  for all using (student_id = auth.uid()) with check (student_id = auth.uid());

drop policy if exists sessions_teacher_select on public.study_sessions;
create policy sessions_teacher_select on public.study_sessions
  for select using (public.statlab_teaches_student(student_id));

-- ---------------------------------------------------- student_achievements --
drop policy if exists ach_own on public.student_achievements;
create policy ach_own on public.student_achievements
  for all using (student_id = auth.uid()) with check (student_id = auth.uid());

drop policy if exists ach_teacher_select on public.student_achievements;
create policy ach_teacher_select on public.student_achievements
  for select using (public.statlab_teaches_student(student_id));

-- ------------------------------------------------------------- assignments --
drop policy if exists assignments_teacher_all on public.assignments;
create policy assignments_teacher_all on public.assignments
  for all using (public.statlab_owns_class(class_id)) with check (public.statlab_owns_class(class_id));

drop policy if exists assignments_student_select on public.assignments;
create policy assignments_student_select on public.assignments
  for select using (
    published and public.statlab_is_member(class_id)
    and (opens_at is null or now() >= opens_at)
  );

drop policy if exists aprog_own on public.assignment_progress;
create policy aprog_own on public.assignment_progress
  for all using (student_id = auth.uid()) with check (student_id = auth.uid());

drop policy if exists aprog_teacher_select on public.assignment_progress;
create policy aprog_teacher_select on public.assignment_progress
  for select using (public.statlab_teaches_student(student_id));

-- ------------------------------------------------------ weekly_challenges --
drop policy if exists challenges_teacher_all on public.weekly_challenges;
create policy challenges_teacher_all on public.weekly_challenges
  for all using (public.statlab_owns_class(class_id)) with check (public.statlab_owns_class(class_id));

-- El alumno puede leer la FILA del reto (necesita fechas y configuración),
-- pero la columna `solution` solo llega a través de v_student_challenges, que
-- la anula hasta que la política del reto la libera. Para que ni siquiera esté
-- en la tabla accesible, se revoca la columna explícitamente más abajo.
drop policy if exists challenges_student_select on public.weekly_challenges;
create policy challenges_student_select on public.weekly_challenges
  for select using (
    published and public.statlab_is_member(class_id) and now() >= opens_at
  );

-- Revocación de la columna con las respuestas: ni con SELECT *, ni con
-- UPDATE ... RETURNING, ni desde una vista con security_invoker se obtiene.
-- El profesorado accede a ella mediante statlab_challenge_solution().
revoke all on public.weekly_challenges from anon, authenticated;
grant select (id, class_id, teacher_id, number, title, description, challenge_type, world_id,
              concepts, difficulty, configuration, builtin_template, opens_at, closes_at,
              recommended_seconds, max_attempts, competitive_attempts, allow_hints,
              solution_policy, solution_available_at, show_ranking, counts_for_season,
              scoring_config, published, created_at, updated_at)
  on public.weekly_challenges to authenticated;
-- INSERT/UPDATE sí incluyen `solution` (el profesor tiene que poder escribirla);
-- RLS impide que un estudiante escriba en retos que no son de su clase.
grant insert, update, delete on public.weekly_challenges to authenticated;

-- ---------------------------------------------- weekly_challenge_attempts --
drop policy if exists chatt_own_select on public.weekly_challenge_attempts;
create policy chatt_own_select on public.weekly_challenge_attempts
  for select using (student_id = auth.uid());

drop policy if exists chatt_teacher_select on public.weekly_challenge_attempts;
create policy chatt_teacher_select on public.weekly_challenge_attempts
  for select using (
    exists (select 1 from public.weekly_challenges c
            where c.id = challenge_id and c.teacher_id = auth.uid())
  );

-- Los intentos se crean y cierran mediante las funciones SECURITY DEFINER:
-- el cliente no inserta ni actualiza directamente (así no puede inflar su
-- puntuación ni marcarse como rank_eligible).

drop policy if exists chatt_class_ranking_select on public.weekly_challenge_attempts;
create policy chatt_class_ranking_select on public.weekly_challenge_attempts
  for select using (
    completed and rank_eligible
    and exists (
      select 1 from public.weekly_challenges c
      where c.id = challenge_id and c.show_ranking and public.statlab_is_member(c.class_id)
    )
  );

-- ------------------------------------------------- weekly_challenge_steps --
drop policy if exists chsteps_own_select on public.weekly_challenge_steps;
create policy chsteps_own_select on public.weekly_challenge_steps
  for select using (
    exists (select 1 from public.weekly_challenge_attempts a
            where a.id = attempt_id and a.student_id = auth.uid())
  );

drop policy if exists chsteps_teacher_select on public.weekly_challenge_steps;
create policy chsteps_teacher_select on public.weekly_challenge_steps
  for select using (
    exists (select 1 from public.weekly_challenge_attempts a
            join public.weekly_challenges c on c.id = a.challenge_id
            where a.id = attempt_id and c.teacher_id = auth.uid())
  );

-- ------------------------------------------------------- challenge_bonuses --
drop policy if exists bonus_own_select on public.challenge_bonuses;
create policy bonus_own_select on public.challenge_bonuses
  for select using (student_id = auth.uid());

drop policy if exists bonus_teacher_all on public.challenge_bonuses;
create policy bonus_teacher_all on public.challenge_bonuses
  for all using (
    exists (select 1 from public.weekly_challenges c where c.id = challenge_id and c.teacher_id = auth.uid())
  ) with check (
    exists (select 1 from public.weekly_challenges c where c.id = challenge_id and c.teacher_id = auth.uid())
  );

-- ===========================================================================
-- 11. FUNCIÓN DE INSCRIPCIÓN EN CLASE
-- ===========================================================================
-- El alumno no puede leer la tabla `classes` completa (no debe poder enumerar
-- clases ajenas), así que se une mediante esta función, que valida el código.

create or replace function public.statlab_join_class(p_code text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  c public.classes;
begin
  select * into c from public.classes
   where upper(class_code) = upper(trim(p_code)) and not archived;
  if not found then raise exception 'CODIGO_NO_VALIDO'; end if;

  insert into public.class_members (class_id, student_id)
  values (c.id, auth.uid())
  on conflict (class_id, student_id) do update set active = true;

  return jsonb_build_object('class_id', c.id, 'class_name', c.class_name,
                            'academic_year', c.academic_year,
                            'ranking_enabled', c.ranking_enabled);
end $$;

/* Comprueba si un alias está libre (sin exponer la tabla de perfiles). */
create or replace function public.statlab_alias_available(p_alias text)
returns boolean language sql security definer set search_path = public as $$
  select not exists (select 1 from public.profiles where lower(alias) = lower(trim(p_alias)));
$$;

-- ===========================================================================
-- 12. PERMISOS
-- ===========================================================================

grant usage on schema public to anon, authenticated;

grant select on public.worlds, public.concepts, public.levels, public.activities, public.achievements
  to anon, authenticated;

grant select, insert, update, delete on
  public.profiles, public.classes, public.class_members, public.attempts,
  public.student_progress, public.concept_mastery, public.study_sessions,
  public.student_achievements, public.assignments, public.assignment_progress,
  public.weekly_challenge_attempts, public.weekly_challenge_steps, public.challenge_bonuses
  to authenticated;

grant select on
  public.v_weekly_ranking, public.v_seasonal_ranking, public.v_most_improved,
  public.v_challenge_step_analytics, public.v_class_concept_difficulty,
  public.v_class_summary, public.v_student_challenges, public.v_challenge_best
  to authenticated;

grant execute on function
  public.statlab_join_class(text),
  public.statlab_alias_available(text),
  public.statlab_challenge_solution(uuid),
  public.statlab_solution_available(text, timestamptz, timestamptz),
  public.statlab_start_challenge_attempt(uuid),
  public.statlab_submit_challenge_step(uuid, text, jsonb, int, int, int),
  public.statlab_finish_challenge_attempt(uuid, int),
  public.statlab_is_member(uuid),
  public.statlab_owns_class(uuid),
  public.statlab_is_teacher(),
  public.statlab_teaches_student(uuid)
  to authenticated;

-- ===========================================================================
-- 13. PRIMER PROFESOR  (procedimiento administrativo)
-- ===========================================================================
-- El rol NO se puede obtener desde la aplicación. Para convertir una cuenta ya
-- registrada en profesor, ejecuta esto en Supabase → SQL Editor, sustituyendo
-- el correo. Este SQL corre con privilegios de administrador de la consola,
-- no con la anon key, así que ningún usuario puede reproducirlo.
--
--     update public.profiles
--        set role = 'teacher'
--      where email = 'profesor@universidad.es';
--
-- Comprobación:
--     select id, email, role from public.profiles where role <> 'student';
--
-- Para revocar:
--     update public.profiles set role = 'student' where email = '...';
--
-- Recomendación: crear la cuenta docente con el flujo normal de registro
-- (para que exista en auth.users con su contraseña) y después ejecutar el
-- UPDATE. Nunca insertar filas en auth.users a mano.

-- ===========================================================================
-- 14. DATOS DE CONTENIDO MÍNIMOS
-- ===========================================================================
-- Los mundos y conceptos se sincronizan desde data/worlds.json con el script
-- documentado en el README (opcional: la app funciona leyendo el JSON). Se
-- insertan aquí los 15 mundos para que las claves foráneas de `attempts`
-- funcionen desde el primer día.

insert into public.worlds (id, num, title, subtitle, icon, requires) values
  ('w01', 1,  'Conoce tus datos',        'Población, muestra, individuo, variable, parámetro y estadístico', '🧭', null),
  ('w02', 2,  'Tipos de variables',      'Cualitativas, cuantitativas y escalas de medida',                  '🏷️', 'w01'),
  ('w03', 3,  'Estadística descriptiva', 'Frecuencias, centro, dispersión, posición y atípicos',              '📊', 'w02'),
  ('w04', 4,  'Visualización',           'El gráfico adecuado y el gráfico engañoso',                         '📈', 'w03'),
  ('w05', 5,  'Probabilidad',            'Sucesos, operaciones, independencia y Bayes',                       '🎲', 'w04'),
  ('w06', 6,  'Distribuciones',          'Variables aleatorias, binomial, normal y puntuación z',             '🔔', 'w05'),
  ('w07', 7,  'Muestreo',                'Variabilidad muestral, error estándar y TCL',                       '🎯', 'w06'),
  ('w08', 8,  'Estimación',              'Estimación puntual, intervalos y margen de error',                  '📐', 'w07'),
  ('w09', 9,  'Contraste de hipótesis',  'H0, H1, alfa, p-valor, errores y potencia',                         '⚖️', 'w08'),
  ('w10', 10, 'Elección de pruebas',     'Del diseño a la prueba',                                            '🧪', 'w09'),
  ('w11', 11, 'Correlación',             'Pearson, Spearman y la trampa de la causalidad',                     '🔗', 'w10'),
  ('w12', 12, 'Regresión',               'Recta, residuos, R² y extrapolación',                                '📉', 'w11'),
  ('w13', 13, 'Pruebas diagnósticas',    'Sensibilidad, especificidad, valores predictivos y ROC',             '🩺', 'w12'),
  ('w14', 14, 'Tamaños del efecto',      'Cuánto, no solo si',                                                 '📏', 'w13'),
  ('w15', 15, 'Proyecto final',          'Un caso completo, sin instrucciones',                                '🏁', 'w14')
on conflict (id) do update set
  num = excluded.num, title = excluded.title, subtitle = excluded.subtitle, icon = excluded.icon;

-- ===========================================================================
-- FIN
-- ===========================================================================
-- Comprobación rápida de que RLS está activa en todas las tablas esperadas:
--
--   select tablename, rowsecurity from pg_tables
--    where schemaname = 'public' order by tablename;
--
-- Todas las tablas con datos personales deben mostrar rowsecurity = true.
