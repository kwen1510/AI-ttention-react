create table if not exists public.summary_snapshots (
    id uuid primary key default gen_random_uuid(),
    session_id uuid not null references public.sessions(id) on delete cascade,
    group_id uuid not null references public.groups(id) on delete cascade,
    segment_cursor integer not null check (segment_cursor > 0),
    latest_segment_id uuid null,
    summary_text text not null,
    created_at timestamptz not null default now()
);

create unique index if not exists summary_snapshots_group_cursor_key
    on public.summary_snapshots (group_id, segment_cursor);

create index if not exists summary_snapshots_session_created_idx
    on public.summary_snapshots (session_id, created_at);

create index if not exists summary_snapshots_group_created_idx
    on public.summary_snapshots (group_id, created_at);
