create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

create table if not exists private.aittention_retention_log (
    id bigint generated always as identity primary key,
    ran_at timestamptz not null default now(),
    expired_memberships_deleted bigint not null,
    anonymous_users_deleted bigint not null,
    anonymous_user_cutoff timestamptz not null
);

alter table private.aittention_retention_log enable row level security;
revoke all on table private.aittention_retention_log from public, anon, authenticated;
grant select on table private.aittention_retention_log to service_role;

create or replace function private.cleanup_aittention_ephemeral_data(
    p_membership_grace_days integer default 7,
    p_anonymous_user_days integer default 30
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
    membership_count bigint := 0;
    user_count bigint := 0;
    user_cutoff timestamptz;
begin
    if p_membership_grace_days not between 1 and 90
       or p_anonymous_user_days not between 7 and 365 then
        raise exception 'retention days outside allowed bounds' using errcode = '22023';
    end if;

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
        (expired_memberships_deleted, anonymous_users_deleted, anonymous_user_cutoff)
    values (membership_count, user_count, user_cutoff);

    return jsonb_build_object(
        'expiredMembershipsDeleted', membership_count,
        'anonymousUsersDeleted', user_count,
        'anonymousUserCutoff', user_cutoff
    );
end;
$$;

revoke all on function private.cleanup_aittention_ephemeral_data(integer, integer)
    from public, anon, authenticated;
grant execute on function private.cleanup_aittention_ephemeral_data(integer, integer)
    to service_role;

comment on function private.cleanup_aittention_ephemeral_data(integer, integer)
is 'Deletes expired Realtime memberships and unreferenced old anonymous Auth users; every run is audited.';
