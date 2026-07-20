alter table if exists public.sessions
    add column if not exists expires_at timestamptz,
    add column if not exists ended_reason text;

update public.sessions
set expires_at = coalesce(created_at, now()) + interval '4 hours'
where expires_at is null;

alter table if exists public.sessions
    drop constraint if exists sessions_ended_reason_check;

alter table if exists public.sessions
    add constraint sessions_ended_reason_check
    check (ended_reason is null or ended_reason in ('teacher', 'expired'));

create index if not exists sessions_active_expiry_idx
    on public.sessions (active, expires_at)
    where active = true;
