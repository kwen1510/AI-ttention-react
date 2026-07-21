begin;

alter table public.sessions
  add column if not exists is_current boolean not null default false,
  add column if not exists accept_uploads_until timestamptz;

update public.sessions
set is_current = false;

update public.sessions
set mode = 'summary'
where mode is null;

with reusable as (
  select id,
         row_number() over (
           partition by owner_id, coalesce(mode, 'summary')
           order by created_at desc, id desc
         ) as position
  from public.sessions
  where ended_reason is null
    and end_time is null
    and expires_at > now()
)
update public.sessions as session
set is_current = true
from reusable
where session.id = reusable.id
  and reusable.position = 1;

create unique index if not exists sessions_one_current_mode_per_teacher_idx
  on public.sessions (owner_id, mode)
  where is_current = true;

alter table public.sessions
  drop constraint if exists sessions_current_lifecycle_check;

alter table public.sessions
  add constraint sessions_current_lifecycle_check
  check (not is_current or (ended_reason is null and end_time is null));

commit;
