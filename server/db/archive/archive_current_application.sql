\set ON_ERROR_STOP on
begin isolation level repeatable read;

-- Required psql variables: archive_schema, archive_batch.
-- The schema is immutable: this script refuses to overwrite an existing archive.
select :'archive_schema' ~ '^aittention_archive_[0-9]{8}_[0-9]{6}$' as valid_archive_schema
\gset
\if :valid_archive_schema
\else
  \echo 'Refusing archive: invalid archive schema name.'
  \quit 1
\endif

select format('create schema %I', :'archive_schema') \gexec
select format('revoke all on schema %I from public, anon, authenticated', :'archive_schema') \gexec
select format('grant usage on schema %I to service_role', :'archive_schema') \gexec

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

create table if not exists private.aittention_archive_catalog (
  batch_id text not null,
  archive_schema name not null,
  table_name name not null,
  source_row_count bigint not null,
  row_count bigint not null,
  archived_at timestamptz not null default now(),
  primary key (batch_id, table_name),
  unique (archive_schema, table_name)
);

create table if not exists private.aittention_archive_access_log (
  id bigint generated always as identity primary key,
  batch_id text not null,
  table_name name not null,
  requested_by text not null,
  requested_at timestamptz not null default now(),
  row_limit integer not null,
  row_offset integer not null
);

alter table private.aittention_archive_catalog enable row level security;
alter table private.aittention_archive_access_log enable row level security;
revoke all on table private.aittention_archive_catalog from public, anon, authenticated;
revoke all on table private.aittention_archive_access_log from public, anon, authenticated;
grant select on table private.aittention_archive_catalog to service_role;
grant select on table private.aittention_archive_access_log to service_role;

select format(
  'create table %I.%I (like public.%I including all)',
  :'archive_schema', tablename, tablename
)
from pg_tables
where schemaname = 'public'
  and tablename not like 'aittention_archive_%'
order by tablename
\gexec

select format(
  'insert into %I.%I overriding system value select * from public.%I',
  :'archive_schema', tablename, tablename
)
from pg_tables
where schemaname = 'public'
  and tablename not like 'aittention_archive_%'
order by tablename
\gexec

select format('alter table %I.%I enable row level security', :'archive_schema', tablename)
from pg_tables
where schemaname = :'archive_schema'
order by tablename
\gexec

select format('revoke all on table %I.%I from public, anon, authenticated', :'archive_schema', tablename)
from pg_tables
where schemaname = :'archive_schema'
order by tablename
\gexec

select format('grant select on table %I.%I to service_role', :'archive_schema', tablename)
from pg_tables
where schemaname = :'archive_schema'
order by tablename
\gexec

insert into private.aittention_archive_catalog (batch_id, archive_schema, table_name, source_row_count, row_count)
select
  :'archive_batch',
  :'archive_schema'::name,
  table_name::name,
  (xpath('/row/count/text()', query_to_xml(
    format('select count(*) as count from public.%I', table_name),
    false,
    true,
    ''
  )))[1]::text::bigint,
  (xpath('/row/count/text()', query_to_xml(
    format('select count(*) as count from %I.%I', :'archive_schema', table_name),
    false,
    true,
    ''
  )))[1]::text::bigint
from information_schema.tables
where table_schema = :'archive_schema'
  and table_type = 'BASE TABLE';

create or replace function public.read_aittention_archive(
  p_batch_id text,
  p_table_name text,
  p_limit integer default 100,
  p_offset integer default 0
)
returns setof jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  selected_schema name;
  selected_table name;
  safe_limit integer := least(greatest(coalesce(p_limit, 100), 1), 500);
  safe_offset integer := greatest(coalesce(p_offset, 0), 0);
begin
  if auth.role() <> 'service_role' then
    raise exception 'archive access denied' using errcode = '42501';
  end if;

  select archive_schema, table_name into selected_schema, selected_table
  from private.aittention_archive_catalog
  where batch_id = p_batch_id and table_name = p_table_name::name;
  if selected_schema is null then
    raise exception 'archive table not found' using errcode = 'P0002';
  end if;

  insert into private.aittention_archive_access_log
    (batch_id, table_name, requested_by, row_limit, row_offset)
  values
    (p_batch_id, p_table_name::name, coalesce(auth.uid()::text, 'service_role'), safe_limit, safe_offset);

  return query execute format(
    'select to_jsonb(row_data) from %I.%I row_data limit $1 offset $2',
    selected_schema,
    selected_table
  ) using safe_limit, safe_offset;
end;
$$;

revoke all on function public.read_aittention_archive(text, text, integer, integer) from public, anon, authenticated;
grant execute on function public.read_aittention_archive(text, text, integer, integer) to service_role;

comment on function public.read_aittention_archive(text, text, integer, integer)
is 'Audited, service-role-only access to immutable AI(ttention) application archives.';

commit;
