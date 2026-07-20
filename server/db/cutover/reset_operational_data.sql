\set ON_ERROR_STOP on
-- Required: archive_batch and confirm_reset=RESET_OPERATIONAL_DATA.
select :'confirm_reset' = 'RESET_OPERATIONAL_DATA' as reset_confirmed \gset
\if :reset_confirmed
\else
  \echo 'Refusing reset: confirm_reset must equal RESET_OPERATIONAL_DATA.'
  \quit 1
\endif

select count(*) > 0 and bool_and(source_row_count = row_count) as archive_verified
from private.aittention_archive_catalog
where batch_id = :'archive_batch'
\gset
\if :archive_verified
\else
  \echo 'Refusing reset: verified archive batch not found.'
  \quit 1
\endif

begin;

-- Reusable questions/prompts and teacher access configuration are preserved.
-- Auth users are not modified by this script.
select format('truncate table public.%I restart identity cascade', table_name)
from (values
  ('async_group_reports'), ('async_segments'), ('async_groups'), ('async_sessions'),
  ('checkbox_results'), ('checkbox_progress'), ('checkbox_criteria'), ('checkbox_sessions'),
  ('mindmap_archives'), ('mindmap_sessions'),
  ('summary_snapshots'), ('summaries'), ('transcripts'),
  ('session_logs'), ('session_prompts'), ('groups'),
  ('classroom_realtime_memberships'), ('transcriptions'), ('sessions')
) operational(table_name)
where to_regclass(format('public.%I', table_name)) is not null
\gexec

commit;
