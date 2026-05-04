-- Generic canonical records for non-bid extraction flows (documents, products, etc.).

create table if not exists public.glassspider_records (
  id uuid primary key default gen_random_uuid(),
  source_id uuid references public.glassspider_sources(id) on delete set null,
  raw_record_id uuid references public.glassspider_raw_records(id) on delete set null,
  record_type text not null default 'generic',
  source_url text not null,
  external_reference text,
  title text not null,
  summary text,
  category text,
  subcategory text,
  primary_url text,
  image_url text,
  published_date date,
  extracted jsonb not null default '{}'::jsonb,
  raw jsonb not null default '{}'::jsonb,
  review_status public.glassspider_review_status not null default 'pending',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists glassspider_records_source_type_url_idx
  on public.glassspider_records(source_id, record_type, source_url);

create index if not exists glassspider_records_source_idx
  on public.glassspider_records(source_id);

create index if not exists glassspider_records_type_idx
  on public.glassspider_records(record_type);

create index if not exists glassspider_records_extracted_gin_idx
  on public.glassspider_records using gin(extracted);

alter table public.glassspider_records enable row level security;

create policy "Glassspider viewers can read generic records"
  on public.glassspider_records for select
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

create policy "Glassspider admins can manage generic records"
  on public.glassspider_records for all
  to authenticated
  using (
    exists (
      select 1
      from public.projects p
      join public.project_access pa on pa.project_id = p.id
      where p.slug = 'glassspider'
        and pa.user_id = auth.uid()
        and pa.role in ('owner', 'admin')
    )
  )
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

notify pgrst, 'reload schema';
