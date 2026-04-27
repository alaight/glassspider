-- Shared Laightworks ecosystem project registry and access grants.
-- These tables are intentionally not glassspider-prefixed: they are shared
-- hub-owned tables referenced by glassspider_* product data and RLS policies.

create extension if not exists "pgcrypto";

create table if not exists public.projects (
  id uuid primary key default gen_random_uuid(),
  slug text not null,
  name text not null,
  description text,
  homepage_url text,
  status text not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint projects_slug_check check (slug = lower(slug) and slug ~ '^[a-z0-9][a-z0-9_-]*$'),
  constraint projects_status_check check (status in ('active', 'paused', 'archived'))
);

create unique index if not exists projects_slug_key
  on public.projects(slug);

create table if not exists public.project_access (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint project_access_role_check check (
    role in ('owner', 'admin', 'member', 'viewer', 'analyst', 'reviewer')
  )
);

create unique index if not exists project_access_project_user_key
  on public.project_access(project_id, user_id);

create index if not exists project_access_user_idx
  on public.project_access(user_id);

alter table public.projects enable row level security;
alter table public.project_access enable row level security;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'project_access'
      and policyname = 'Users can read own project access'
  ) then
    create policy "Users can read own project access"
      on public.project_access for select
      to authenticated
      using (user_id = auth.uid());
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'projects'
      and policyname = 'Project members can read projects'
  ) then
    create policy "Project members can read projects"
      on public.projects for select
      to authenticated
      using (
        exists (
          select 1
          from public.project_access pa
          where pa.project_id = projects.id
            and pa.user_id = auth.uid()
        )
      );
  end if;
end $$;

insert into public.projects (slug, name, description)
values (
  'glassspider',
  'Glassspider',
  'Laightworks bid intelligence product'
)
on conflict (slug) do update
set
  name = excluded.name,
  description = coalesce(public.projects.description, excluded.description),
  updated_at = now();
