alter table if exists public.teacher_access
    drop constraint if exists teacher_access_pkey;

alter table if exists public.teacher_access
    alter column user_id drop not null;

update public.teacher_access
set
    email = lower(trim(email)),
    role = lower(trim(role)),
    updated_at = now()
where email is not null;

drop index if exists teacher_access_email_idx;

create unique index if not exists teacher_access_email_idx
    on public.teacher_access (email);

create unique index if not exists teacher_access_user_id_unique
    on public.teacher_access (user_id)
    where user_id is not null;

create index if not exists teacher_access_active_idx
    on public.teacher_access (active);

do $$
begin
    if not exists (
        select 1
        from pg_constraint
        where conname = 'teacher_access_role_check'
    ) then
        alter table public.teacher_access
            add constraint teacher_access_role_check
            check (role in ('teacher', 'admin'));
    end if;
end
$$;

insert into public.teacher_access (user_id, email, role, active, created_at, updated_at)
values (null, 'kuangwen.chan@ri.edu.sg', 'admin', true, now(), now())
on conflict (email) do update
set
    role = excluded.role,
    active = excluded.active,
    updated_at = now();

alter table if exists public.teacher_prompts
    add column if not exists created_by_user_id uuid references auth.users(id) on delete set null;

alter table if exists public.teacher_prompts
    add column if not exists created_by_email text;

update public.teacher_prompts
set created_by_email = lower(trim(author_name))
where created_by_email is null
  and author_name ~* '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$';

create index if not exists teacher_prompts_created_by_user_id_idx
    on public.teacher_prompts (created_by_user_id);

create index if not exists teacher_prompts_created_by_email_idx
    on public.teacher_prompts (created_by_email);
