\set ON_ERROR_STOP on
-- Required: archive_batch and confirm_rollback=RESTORE_OPERATIONAL_DATA.
select :'confirm_rollback' = 'RESTORE_OPERATIONAL_DATA' as rollback_confirmed \gset
\if :rollback_confirmed
\else
  \echo 'Refusing rollback: confirm_rollback must equal RESTORE_OPERATIONAL_DATA.'
  \quit 1
\endif

begin;

create temporary table rollback_sources as
select catalog.archive_schema, catalog.table_name
from private.aittention_archive_catalog catalog
where catalog.batch_id = :'archive_batch'
  and catalog.table_name = any (array[
    'async_group_reports','async_segments','async_groups','async_sessions',
    'checkbox_results','checkbox_progress','checkbox_criteria','checkbox_sessions',
    'mindmap_archives','mindmap_sessions','rolling_summary_jobs','rolling_summary_commits','rolling_summary_states','live_audio_chunks','summary_snapshots','summaries','transcripts',
    'session_logs','session_prompts','groups','transcriptions','sessions'
  ]::name[]);

select count(*) > 0 as archive_found
from rollback_sources
\gset
\if :archive_found
\else
  \echo 'Refusing rollback: archive batch has no operational tables.'
  \quit 1
\endif

select format('truncate table public.%I restart identity cascade', table_name)
from rollback_sources
where to_regclass(format('public.%I', table_name)) is not null
\gexec

select format(
  'insert into public.%I overriding system value select * from %I.%I',
  table_name, archive_schema, table_name
)
from rollback_sources
where to_regclass(format('public.%I', table_name)) is not null
order by case table_name
  -- Restore parents before children so rollback also works when production
  -- foreign keys were created as NOT DEFERRABLE.
  when 'sessions' then 10
  when 'async_sessions' then 10
  when 'groups' then 20
  when 'session_prompts' then 20
  when 'session_logs' then 20
  when 'transcriptions' then 20
  when 'async_groups' then 20
  when 'transcripts' then 30
  when 'mindmap_sessions' then 30
  when 'checkbox_sessions' then 30
  when 'async_segments' then 30
  when 'async_group_reports' then 30
  when 'summaries' then 40
  when 'mindmap_archives' then 40
  when 'checkbox_criteria' then 40
  when 'summary_snapshots' then 50
  when 'checkbox_progress' then 50
  when 'checkbox_results' then 60
  else 100
end,
table_name
\gexec

commit;
