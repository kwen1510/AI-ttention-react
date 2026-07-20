-- Native Supabase Auth identities authorize private Broadcast topics. The app
-- server grants rows; browsers can neither read nor mutate the grant table.
create table if not exists public.classroom_realtime_memberships (
    id uuid primary key default gen_random_uuid(),
    user_id uuid not null references auth.users(id) on delete cascade,
    session_code text not null,
    topic text not null,
    audience text not null check (audience in ('teacher', 'student')),
    group_number integer check (group_number is null or group_number between 1 and 99),
    expires_at timestamptz not null,
    revoked_at timestamptz,
    created_at timestamptz not null default now(),
    unique (user_id, session_code, topic)
);

alter table public.classroom_realtime_memberships
    drop constraint if exists classroom_realtime_memberships_group_number_check;
alter table public.classroom_realtime_memberships
    add constraint classroom_realtime_memberships_group_number_check
    check (group_number is null or group_number between 1 and 99);

create index if not exists classroom_realtime_memberships_authorization_idx
    on public.classroom_realtime_memberships (user_id, topic, expires_at)
    where revoked_at is null;

create index if not exists classroom_realtime_memberships_session_idx
    on public.classroom_realtime_memberships (session_code)
    where revoked_at is null;

alter table public.classroom_realtime_memberships enable row level security;
revoke all on public.classroom_realtime_memberships from anon, authenticated;

create schema if not exists private;

-- A browser identity may receive both the shared student topic and its group
-- topic, but it may never accumulate active memberships for multiple groups in
-- one classroom. The advisory lock also closes concurrent-join races.
create or replace function private.enforce_single_student_group_membership()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
    if new.audience = 'student' and new.revoked_at is null then
        perform pg_advisory_xact_lock(
            hashtextextended(new.user_id::text || ':' || new.session_code, 0)
        );
        if exists (
            select 1
            from public.classroom_realtime_memberships existing
            where existing.user_id = new.user_id
              and existing.session_code = new.session_code
              and existing.audience = 'student'
              and existing.revoked_at is null
              and existing.expires_at > now()
              and existing.group_number is distinct from new.group_number
              and existing.id is distinct from new.id
        ) then
            raise exception 'student identity already assigned to another group'
                using errcode = '42501';
        end if;
    end if;
    return new;
end;
$$;

revoke all on function private.enforce_single_student_group_membership() from public;
drop trigger if exists enforce_single_student_group_membership
    on public.classroom_realtime_memberships;
create trigger enforce_single_student_group_membership
before insert or update on public.classroom_realtime_memberships
for each row execute function private.enforce_single_student_group_membership();

create or replace function private.can_receive_classroom_broadcast(requested_topic text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
    select exists (
        select 1
        from public.classroom_realtime_memberships membership
        join public.sessions session
          on session.code = membership.session_code
        where membership.user_id = auth.uid()
          and membership.topic = requested_topic
          and membership.revoked_at is null
          and membership.expires_at > now()
          and session.ended_reason is null
          and session.expires_at > now()
    );
$$;

revoke all on function private.can_receive_classroom_broadcast(text) from public;
grant usage on schema private to authenticated;
grant execute on function private.can_receive_classroom_broadcast(text) to authenticated;

grant usage on schema realtime to authenticated;
grant select on table realtime.messages to authenticated;

drop policy if exists "AI-ttention clients can read granted realtime topics"
    on realtime.messages;
drop policy if exists "AI-ttention native identities can read granted topics"
    on realtime.messages;

create policy "AI-ttention native identities can read granted topics"
    on realtime.messages
    for select
    to authenticated
    using (
        extension = 'broadcast'
        and (select private.can_receive_classroom_broadcast(realtime.topic()))
    );

-- No INSERT policy is intentional: browsers may receive but never publish.
