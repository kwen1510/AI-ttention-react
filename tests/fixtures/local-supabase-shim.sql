\set ON_ERROR_STOP on

do $$ begin create role anon nologin; exception when duplicate_object then null; end $$;
do $$ begin create role authenticated nologin; exception when duplicate_object then null; end $$;
do $$ begin create role service_role nologin bypassrls; exception when duplicate_object then null; end $$;

create schema if not exists auth;
create schema if not exists realtime;

create or replace function auth.uid() returns uuid language sql stable as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
$$;
create or replace function auth.role() returns text language sql stable as $$
  select coalesce(nullif(current_setting('request.jwt.claim.role', true), ''), current_user)
$$;
create or replace function realtime.topic() returns text language sql stable as $$
  select coalesce(current_setting('realtime.topic', true), '')
$$;

create table auth.users (
  id uuid primary key,
  email text,
  is_anonymous boolean not null default false,
  created_at timestamptz not null default now()
);
create table realtime.messages (extension text not null);
alter table realtime.messages enable row level security;

create table public.sessions (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id),
  code text not null unique,
  mode text,
  active boolean not null default false,
  created_at timestamptz not null default now(),
  end_time timestamptz,
  expires_at timestamptz,
  ended_reason text
);
create table public.groups (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.sessions(id) on delete cascade,
  number integer not null
);
create table public.transcripts (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.sessions(id) on delete cascade,
  text text not null
);
create table public.teacher_prompts (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  content text not null,
  created_at timestamptz not null default now()
);
create table public.teacher_access (
  user_id uuid primary key references auth.users(id),
  email text not null,
  role text not null,
  active boolean not null default true
);

insert into auth.users (id, email) values
  ('00000000-0000-4000-8000-000000000001', 'teacher@example.test');
insert into public.teacher_access (user_id, email, role) values
  ('00000000-0000-4000-8000-000000000001', 'teacher@example.test', 'teacher');
insert into public.sessions (id, owner_id, code, expires_at) values
  ('10000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000001', 'LOCAL1', now() + interval '4 hours');
insert into public.groups (session_id, number) values
  ('10000000-0000-4000-8000-000000000001', 1);
insert into public.transcripts (session_id, text) values
  ('10000000-0000-4000-8000-000000000001', 'Synthetic archive validation transcript');
insert into public.teacher_prompts (title, content) values
  ('Synthetic question', 'Explain the synthetic test scenario.');
