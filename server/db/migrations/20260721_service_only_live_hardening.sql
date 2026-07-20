-- AI(ttention) uses Express as its only application-data boundary. Browsers
-- authenticate to Supabase only for private Realtime Broadcast authorization.
-- This migration is non-destructive and may run before the archive cutover.
begin;

do $$
declare item record;
begin
  for item in select schemaname, tablename from pg_tables where schemaname = 'public'
  loop
    execute format('alter table %I.%I enable row level security', item.schemaname, item.tablename);
    execute format('revoke all on table %I.%I from public, anon, authenticated', item.schemaname, item.tablename);
    execute format('grant all on table %I.%I to service_role', item.schemaname, item.tablename);
  end loop;

  for item in select sequence_schema, sequence_name from information_schema.sequences where sequence_schema = 'public'
  loop
    execute format('revoke all on sequence %I.%I from public, anon, authenticated', item.sequence_schema, item.sequence_name);
    execute format('grant all on sequence %I.%I to service_role', item.sequence_schema, item.sequence_name);
  end loop;
end $$;

-- Realtime is the sole browser-readable database surface. Its policy is
-- installed separately by 20260720_native_realtime_memberships.sql.
grant select on table realtime.messages to authenticated;

commit;
