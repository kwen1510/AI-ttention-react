\set ON_ERROR_STOP on

-- Required psql variable: archive_batch.
select count(*) > 0
   and bool_and(source_row_count = row_count)
   and bool_and(row_count = (
     xpath('/row/count/text()', query_to_xml(
       format('select count(*) as count from %I.%I', archive_schema, table_name),
       false, true, ''
     ))
   )[1]::text::bigint) as archive_verified
from private.aittention_archive_catalog
where batch_id = :'archive_batch'
\gset

\if :archive_verified
\else
  \echo 'Archive row-count verification failed.'
  \quit 1
\endif

select bool_and(not has_schema_privilege('anon', archive_schema, 'usage'))
   and bool_and(not has_schema_privilege('authenticated', archive_schema, 'usage'))
   and bool_and(has_schema_privilege('service_role', archive_schema, 'usage'))
   and bool_and(not has_table_privilege('anon', format('%I.%I', archive_schema, table_name), 'select'))
   and bool_and(not has_table_privilege('authenticated', format('%I.%I', archive_schema, table_name), 'select'))
   and bool_and(has_table_privilege('service_role', format('%I.%I', archive_schema, table_name), 'select'))
   and not has_function_privilege('anon', 'public.read_aittention_archive(text,text,integer,integer)', 'execute')
   and not has_function_privilege('authenticated', 'public.read_aittention_archive(text,text,integer,integer)', 'execute')
   and has_function_privilege('service_role', 'public.read_aittention_archive(text,text,integer,integer)', 'execute')
   and bool_and((
     select relrowsecurity
     from pg_class
     where oid = format('%I.%I', archive_schema, table_name)::regclass
   )) as grants_verified
from private.aittention_archive_catalog
where batch_id = :'archive_batch'
\gset

\if :grants_verified
\else
  \echo 'Archive grant verification failed.'
  \quit 1
\endif
