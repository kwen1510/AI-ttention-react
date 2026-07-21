begin;

alter table public.sessions
  add column if not exists summary_interval_ms integer not null default 30000;

update public.sessions
set summary_interval_ms = least(300000, greatest(15000, coalesce(interval_ms, 30000)));

alter table public.sessions
  drop constraint if exists sessions_summary_interval_ms_check;
alter table public.sessions
  add constraint sessions_summary_interval_ms_check
  check (summary_interval_ms between 15000 and 300000);

create table if not exists public.live_audio_chunks (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.sessions(id) on delete cascade,
  group_id uuid not null references public.groups(id) on delete cascade,
  client_chunk_id text not null check (client_chunk_id ~ '^[A-Za-z0-9_-]{16,100}$'),
  status text not null check (status in ('processing', 'complete', 'no_speech', 'failed')),
  byte_size integer not null check (byte_size between 1 and 10485760),
  mime_type text not null,
  duration_seconds numeric,
  transcript_segment_id uuid,
  error_code text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz,
  unique (session_id, group_id, client_chunk_id)
);

create table if not exists public.rolling_summary_states (
  group_id uuid primary key references public.groups(id) on delete cascade,
  session_id uuid not null references public.sessions(id) on delete cascade,
  target_cursor integer not null default 0 check (target_cursor >= 0),
  prompt_version text not null,
  summary_text text not null check (length(summary_text) <= 12000),
  version integer not null default 1 check (version > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.rolling_summary_commits (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.sessions(id) on delete cascade,
  group_id uuid not null references public.groups(id) on delete cascade,
  target_cursor integer not null check (target_cursor > 0),
  prompt_version text not null,
  summary_text text not null check (length(summary_text) <= 12000),
  created_at timestamptz not null default now(),
  unique (group_id, target_cursor, prompt_version)
);

create table if not exists public.rolling_summary_jobs (
  session_id uuid primary key references public.sessions(id) on delete cascade,
  session_code text not null,
  due_at timestamptz not null,
  status text not null default 'pending' check (status in ('pending', 'running')),
  attempts integer not null default 0 check (attempts between 0 and 1000),
  last_error_code text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.live_audio_chunks enable row level security;
alter table public.rolling_summary_states enable row level security;
alter table public.rolling_summary_commits enable row level security;
alter table public.rolling_summary_jobs enable row level security;
revoke all on public.live_audio_chunks, public.rolling_summary_states, public.rolling_summary_commits, public.rolling_summary_jobs from public, anon, authenticated;
grant all on public.live_audio_chunks, public.rolling_summary_states, public.rolling_summary_commits, public.rolling_summary_jobs to service_role;

create or replace function public.claim_rolling_summary_job(p_session_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  claimed_id uuid;
begin
  update public.rolling_summary_jobs
  set status = 'running', updated_at = now()
  where session_id = p_session_id
    and due_at <= now()
    and (
      status = 'pending'
      or (status = 'running' and updated_at < now() - interval '135 seconds')
    )
  returning session_id into claimed_id;
  return claimed_id is not null;
end;
$$;

revoke all on function public.claim_rolling_summary_job(uuid) from public, anon, authenticated;
grant execute on function public.claim_rolling_summary_job(uuid) to service_role;

create or replace function public.commit_rolling_summary(
  p_session_id uuid,
  p_group_id uuid,
  p_target_cursor integer,
  p_prompt_version text,
  p_summary_text text
)
returns table (committed boolean, version integer)
language plpgsql
security definer
set search_path = ''
as $$
declare
  next_version integer;
begin
  if p_target_cursor < 1 or length(p_prompt_version) not between 1 and 100
     or length(p_summary_text) not between 1 and 12000 then
    raise exception 'invalid rolling summary commit' using errcode = '22023';
  end if;
  if not exists (
    select 1 from public.groups g
    where g.id = p_group_id and g.session_id = p_session_id
  ) then
    raise exception 'group does not belong to session' using errcode = '42501';
  end if;

  insert into public.rolling_summary_commits
    (session_id, group_id, target_cursor, prompt_version, summary_text)
  values
    (p_session_id, p_group_id, p_target_cursor, p_prompt_version, p_summary_text)
  on conflict (group_id, target_cursor, prompt_version) do nothing;

  insert into public.rolling_summary_states
    (group_id, session_id, target_cursor, prompt_version, summary_text, version)
  values
    (p_group_id, p_session_id, p_target_cursor, p_prompt_version, p_summary_text, 1)
  on conflict (group_id) do update
    set target_cursor = excluded.target_cursor,
        prompt_version = excluded.prompt_version,
        summary_text = excluded.summary_text,
        version = public.rolling_summary_states.version + 1,
        updated_at = now()
    where excluded.target_cursor > public.rolling_summary_states.target_cursor
  returning public.rolling_summary_states.version into next_version;

  return query select next_version is not null, coalesce(next_version, (
    select state.version from public.rolling_summary_states state where state.group_id = p_group_id
  ));
end;
$$;

revoke all on function public.commit_rolling_summary(uuid, uuid, integer, text, text) from public, anon, authenticated;
grant execute on function public.commit_rolling_summary(uuid, uuid, integer, text, text) to service_role;

commit;
