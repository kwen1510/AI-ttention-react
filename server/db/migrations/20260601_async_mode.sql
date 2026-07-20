create table if not exists public.async_sessions (
    id uuid primary key,
    owner_id uuid not null references auth.users(id) on delete cascade,
    share_id text not null unique,
    title text not null,
    instructions text not null,
    feedback_prompt text,
    status text not null default 'open' check (status in ('open', 'closed')),
    max_group_number integer not null default 12 check (max_group_number between 1 and 99),
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    expires_at timestamptz,
    closed_at timestamptz
);

create index if not exists async_sessions_owner_created_idx
    on public.async_sessions (owner_id, created_at desc);

create index if not exists async_sessions_share_id_idx
    on public.async_sessions (share_id);

create table if not exists public.async_groups (
    id uuid primary key,
    async_session_id uuid not null references public.async_sessions(id) on delete cascade,
    group_number integer not null check (group_number between 1 and 99),
    display_name text,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    unique (async_session_id, group_number)
);

create index if not exists async_groups_session_number_idx
    on public.async_groups (async_session_id, group_number);

create table if not exists public.async_segments (
    id uuid primary key,
    async_session_id uuid not null references public.async_sessions(id) on delete cascade,
    async_group_id uuid not null references public.async_groups(id) on delete cascade,
    segment_number integer not null,
    text text not null,
    word_count integer not null default 0,
    duration_seconds numeric,
    created_at timestamptz not null default now()
);

create index if not exists async_segments_group_created_idx
    on public.async_segments (async_group_id, created_at);

create table if not exists public.async_group_reports (
    id uuid primary key,
    async_session_id uuid not null references public.async_sessions(id) on delete cascade,
    async_group_id uuid not null references public.async_groups(id) on delete cascade,
    summary text,
    feedback text,
    process jsonb not null default '{}'::jsonb,
    segment_count integer not null default 0,
    updated_at timestamptz not null default now(),
    created_at timestamptz not null default now(),
    unique (async_group_id)
);

create index if not exists async_group_reports_session_idx
    on public.async_group_reports (async_session_id, updated_at desc);

alter table public.async_sessions enable row level security;
alter table public.async_groups enable row level security;
alter table public.async_segments enable row level security;
alter table public.async_group_reports enable row level security;

do $async_policies$
begin
    if not exists (
        select 1 from pg_policies
        where schemaname = 'public'
          and tablename = 'async_sessions'
          and policyname = 'Teachers can read own async sessions'
    ) then
        create policy "Teachers can read own async sessions"
            on public.async_sessions for select
            to authenticated
            using ((select auth.uid()) = owner_id);
    end if;

    if not exists (
        select 1 from pg_policies
        where schemaname = 'public'
          and tablename = 'async_sessions'
          and policyname = 'Teachers can create own async sessions'
    ) then
        create policy "Teachers can create own async sessions"
            on public.async_sessions for insert
            to authenticated
            with check ((select auth.uid()) = owner_id);
    end if;

    if not exists (
        select 1 from pg_policies
        where schemaname = 'public'
          and tablename = 'async_sessions'
          and policyname = 'Teachers can update own async sessions'
    ) then
        create policy "Teachers can update own async sessions"
            on public.async_sessions for update
            to authenticated
            using ((select auth.uid()) = owner_id)
            with check ((select auth.uid()) = owner_id);
    end if;

    if not exists (
        select 1 from pg_policies
        where schemaname = 'public'
          and tablename = 'async_groups'
          and policyname = 'Teachers can read own async groups'
    ) then
        create policy "Teachers can read own async groups"
            on public.async_groups for select
            to authenticated
            using (
                exists (
                    select 1 from public.async_sessions s
                    where s.id = async_groups.async_session_id
                      and s.owner_id = (select auth.uid())
                )
            );
    end if;

    if not exists (
        select 1 from pg_policies
        where schemaname = 'public'
          and tablename = 'async_segments'
          and policyname = 'Teachers can read own async segments'
    ) then
        create policy "Teachers can read own async segments"
            on public.async_segments for select
            to authenticated
            using (
                exists (
                    select 1 from public.async_sessions s
                    where s.id = async_segments.async_session_id
                      and s.owner_id = (select auth.uid())
                )
            );
    end if;

    if not exists (
        select 1 from pg_policies
        where schemaname = 'public'
          and tablename = 'async_group_reports'
          and policyname = 'Teachers can read own async reports'
    ) then
        create policy "Teachers can read own async reports"
            on public.async_group_reports for select
            to authenticated
            using (
                exists (
                    select 1 from public.async_sessions s
                    where s.id = async_group_reports.async_session_id
                      and s.owner_id = (select auth.uid())
                )
            );
    end if;
end
$async_policies$;
