begin;

alter table private.aittention_retention_log
  add column if not exists abandoned_sessions_deleted bigint not null default 0;

drop function if exists private.cleanup_aittention_ephemeral_data(integer, integer);

create or replace function private.cleanup_aittention_ephemeral_data(
    p_membership_grace_days integer default 7,
    p_anonymous_user_days integer default 30,
    p_pending_session_minutes integer default 60
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
    abandoned_count bigint := 0;
    membership_count bigint := 0;
    user_count bigint := 0;
    user_cutoff timestamptz;
begin
    if p_membership_grace_days not between 1 and 90
       or p_anonymous_user_days not between 7 and 365
       or p_pending_session_minutes not between 5 and 1440 then
        raise exception 'retention values outside allowed bounds' using errcode = '22023';
    end if;

    delete from public.classroom_realtime_memberships membership
    using public.sessions session
    where membership.session_code = session.code
      and session.start_time is null
      and session.active is false
      and session.created_at < now() - make_interval(mins => p_pending_session_minutes);

    delete from public.sessions
    where start_time is null
      and active is false
      and created_at < now() - make_interval(mins => p_pending_session_minutes);
    get diagnostics abandoned_count = row_count;

    delete from public.classroom_realtime_memberships
    where coalesce(revoked_at, expires_at) < now() - make_interval(days => p_membership_grace_days);
    get diagnostics membership_count = row_count;

    user_cutoff := now() - make_interval(days => p_anonymous_user_days);
    delete from auth.users anonymous_user
    where anonymous_user.is_anonymous is true
      and anonymous_user.created_at < user_cutoff
      and not exists (
          select 1
          from public.classroom_realtime_memberships membership
          where membership.user_id = anonymous_user.id
            and membership.revoked_at is null
            and membership.expires_at > now()
      );
    get diagnostics user_count = row_count;

    insert into private.aittention_retention_log
        (abandoned_sessions_deleted, expired_memberships_deleted, anonymous_users_deleted, anonymous_user_cutoff)
    values (abandoned_count, membership_count, user_count, user_cutoff);

    return jsonb_build_object(
        'abandonedSessionsDeleted', abandoned_count,
        'expiredMembershipsDeleted', membership_count,
        'anonymousUsersDeleted', user_count,
        'anonymousUserCutoff', user_cutoff
    );
end;
$$;

revoke all on function private.cleanup_aittention_ephemeral_data(integer, integer, integer)
    from public, anon, authenticated;
grant execute on function private.cleanup_aittention_ephemeral_data(integer, integer, integer)
    to service_role;

comment on function private.cleanup_aittention_ephemeral_data(integer, integer, integer)
is 'Deletes abandoned pending classrooms, expired Realtime memberships, and old anonymous Auth users; every run is audited.';

commit;
