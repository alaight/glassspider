-- Glassspider worker job queue and atomic claiming.
-- This migration keeps existing pipeline tables intact and adds the queue layer
-- used by the Next.js control plane and Python worker execution plane.

do $$
begin
  if not exists (select 1 from pg_type where typname = 'glassspider_job_type') then
    create type public.glassspider_job_type as enum ('crawl', 'scrape', 'classify');
  end if;

  if not exists (select 1 from pg_type where typname = 'glassspider_job_status') then
    create type public.glassspider_job_status as enum ('pending', 'running', 'completed', 'failed');
  end if;
end $$;

create table if not exists public.glassspider_jobs (
  id uuid primary key default gen_random_uuid(),
  type public.glassspider_job_type not null,
  source_id uuid not null references public.glassspider_sources(id) on delete cascade,
  status public.glassspider_job_status not null default 'pending',
  payload jsonb not null default '{}'::jsonb,
  attempt_count integer not null default 0,
  max_attempts integer not null default 3,
  last_error text,
  scheduled_at timestamptz not null default now(),
  started_at timestamptz,
  completed_at timestamptz,
  locked_by text,
  locked_at timestamptz,
  result jsonb not null default '{}'::jsonb,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  constraint glassspider_jobs_attempt_count_check check (attempt_count >= 0),
  constraint glassspider_jobs_max_attempts_check check (max_attempts > 0),
  constraint glassspider_jobs_attempt_limit_check check (attempt_count <= max_attempts)
);

create index if not exists glassspider_jobs_status_scheduled_idx
  on public.glassspider_jobs(status, scheduled_at);

create index if not exists glassspider_jobs_source_created_idx
  on public.glassspider_jobs(source_id, created_at desc);

create index if not exists glassspider_jobs_type_status_scheduled_idx
  on public.glassspider_jobs(type, status, scheduled_at);

create unique index if not exists glassspider_jobs_one_active_per_source_type_idx
  on public.glassspider_jobs(source_id, type)
  where status in ('pending', 'running');

create unique index if not exists glassspider_classifications_unique_output_idx
  on public.glassspider_classifications(
    bid_record_id,
    raw_record_id,
    classifier,
    prompt_version
  )
  nulls not distinct;

alter table public.glassspider_jobs enable row level security;

create policy "Glassspider users can read jobs"
  on public.glassspider_jobs for select
  to authenticated
  using (
    exists (
      select 1
      from public.projects p
      join public.project_access pa on pa.project_id = p.id
      where p.slug = 'glassspider'
        and pa.user_id = auth.uid()
        and pa.role in ('owner', 'admin', 'member', 'viewer', 'analyst', 'reviewer')
    )
  );

create policy "Glassspider admins can enqueue jobs"
  on public.glassspider_jobs for insert
  to authenticated
  with check (
    exists (
      select 1
      from public.projects p
      join public.project_access pa on pa.project_id = p.id
      where p.slug = 'glassspider'
        and pa.user_id = auth.uid()
        and pa.role in ('owner', 'admin')
    )
  );

create policy "Glassspider admins can retry failed jobs"
  on public.glassspider_jobs for update
  to authenticated
  using (
    status = 'failed'
    and exists (
      select 1
      from public.projects p
      join public.project_access pa on pa.project_id = p.id
      where p.slug = 'glassspider'
        and pa.user_id = auth.uid()
        and pa.role in ('owner', 'admin')
    )
  )
  with check (
    status = 'pending'
    and exists (
      select 1
      from public.projects p
      join public.project_access pa on pa.project_id = p.id
      where p.slug = 'glassspider'
        and pa.user_id = auth.uid()
        and pa.role in ('owner', 'admin')
    )
  );

create or replace function public.glassspider_enqueue_job(
  p_type public.glassspider_job_type,
  p_source_id uuid,
  p_payload jsonb default '{}'::jsonb,
  p_scheduled_at timestamptz default now(),
  p_max_attempts integer default 3,
  p_created_by uuid default auth.uid()
)
returns public.glassspider_jobs
language plpgsql
as $$
declare
  v_job public.glassspider_jobs;
begin
  insert into public.glassspider_jobs (
    type,
    source_id,
    payload,
    scheduled_at,
    max_attempts,
    created_by
  )
  values (
    p_type,
    p_source_id,
    coalesce(p_payload, '{}'::jsonb),
    coalesce(p_scheduled_at, now()),
    coalesce(p_max_attempts, 3),
    p_created_by
  )
  returning * into v_job;

  return v_job;
exception
  when unique_violation then
    select *
    into v_job
    from public.glassspider_jobs
    where source_id = p_source_id
      and type = p_type
      and status in ('pending', 'running')
    order by created_at desc
    limit 1;

    return v_job;
end;
$$;

create or replace function public.glassspider_claim_next_job(p_worker_id text)
returns public.glassspider_jobs
language plpgsql
as $$
declare
  v_job public.glassspider_jobs;
begin
  with next_job as (
    select id
    from public.glassspider_jobs
    where status = 'pending'
      and scheduled_at <= now()
    order by scheduled_at asc, created_at asc
    for update skip locked
    limit 1
  )
  update public.glassspider_jobs j
  set
    status = 'running',
    attempt_count = j.attempt_count + 1,
    started_at = now(),
    completed_at = null,
    locked_by = p_worker_id,
    locked_at = now(),
    last_error = null
  from next_job
  where j.id = next_job.id
    and j.attempt_count < j.max_attempts
  returning j.* into v_job;

  return v_job;
end;
$$;

create or replace function public.glassspider_complete_job(
  p_job_id uuid,
  p_worker_id text,
  p_result jsonb default '{}'::jsonb
)
returns public.glassspider_jobs
language plpgsql
as $$
declare
  v_job public.glassspider_jobs;
begin
  update public.glassspider_jobs
  set
    status = 'completed',
    completed_at = now(),
    result = coalesce(p_result, '{}'::jsonb)
  where id = p_job_id
    and status = 'running'
    and locked_by = p_worker_id
  returning * into v_job;

  return v_job;
end;
$$;

create or replace function public.glassspider_fail_job(
  p_job_id uuid,
  p_worker_id text,
  p_error text,
  p_retry_at timestamptz default null
)
returns public.glassspider_jobs
language plpgsql
as $$
declare
  v_job public.glassspider_jobs;
begin
  update public.glassspider_jobs
  set
    status = case
      when attempt_count < max_attempts then 'pending'::public.glassspider_job_status
      else 'failed'::public.glassspider_job_status
    end,
    last_error = p_error,
    scheduled_at = case
      when attempt_count < max_attempts then coalesce(p_retry_at, now() + interval '5 minutes')
      else scheduled_at
    end,
    completed_at = case
      when attempt_count < max_attempts then null
      else now()
    end,
    locked_by = case
      when attempt_count < max_attempts then null
      else locked_by
    end,
    locked_at = case
      when attempt_count < max_attempts then null
      else locked_at
    end
  where id = p_job_id
    and status = 'running'
    and locked_by = p_worker_id
  returning * into v_job;

  return v_job;
end;
$$;
