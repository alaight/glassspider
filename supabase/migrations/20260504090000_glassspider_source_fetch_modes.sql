alter table public.glassspider_sources
  add column if not exists fetch_mode text not null default 'static',
  add column if not exists fetch_config jsonb not null default '{}'::jsonb;

alter table public.glassspider_sources
  drop constraint if exists glassspider_sources_fetch_mode_check;

alter table public.glassspider_sources
  add constraint glassspider_sources_fetch_mode_check
  check (fetch_mode in ('static', 'rendered', 'api'));
