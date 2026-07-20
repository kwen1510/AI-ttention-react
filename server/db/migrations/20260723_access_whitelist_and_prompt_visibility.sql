begin;

alter table public.teacher_access
    drop constraint if exists teacher_access_role_check;

alter table public.teacher_access
    add constraint teacher_access_role_check
    check (role in ('admin', 'teacher', 'guest'));

update public.teacher_access
set active = false,
    updated_at = now();

insert into public.teacher_access (user_id, email, role, active, created_at, updated_at)
values
    (null, 'ri.kwmachinelearning@gmail.com', 'admin', true, now(), now()),
    (null, 'kuangwen.chan@ri.edu.sg', 'teacher', true, now(), now()),
    (null, 'yuwen.eng@ri.edu.sg', 'teacher', true, now(), now()),
    (null, 'machinelearning.kw@gmail.com', 'guest', true, now(), now())
on conflict (email) do update
set role = excluded.role,
    active = true,
    updated_at = now();

alter table public.teacher_prompts
    alter column is_public set default true;

update public.teacher_prompts
set is_public = true
where is_public is null;

alter table public.teacher_prompts
    alter column is_public set not null;

commit;
