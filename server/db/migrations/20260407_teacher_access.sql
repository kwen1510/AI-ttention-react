create table if not exists public.teacher_access (
    user_id uuid primary key references auth.users(id) on delete cascade,
    email text not null,
    role text not null default 'teacher',
    active boolean not null default true,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

create index if not exists teacher_access_email_idx
    on public.teacher_access (lower(email));

create index if not exists teacher_access_active_idx
    on public.teacher_access (active);
