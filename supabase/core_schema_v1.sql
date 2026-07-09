begin;

create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  display_name text,
  university text,
  field_of_study text,
  preferred_language text not null default 'de',
  timezone text not null default 'Europe/Berlin',
  onboarding_complete boolean not null default false,
  privacy jsonb not null default '{}'::jsonb,
  scheduler_preferences jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.core_portable_exports (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  owner_label text,
  source_label text not null default 'local-export',
  payload jsonb not null,
  content_hash text,
  imported_at timestamptz not null default now()
);

create table if not exists public.decks (
  id text,
  user_id uuid not null references auth.users(id) on delete cascade,
  local_owner_id text,
  parent_deck_id text,
  name text not null,
  description text not null default '',
  source text not null check (source in ('anki-apkg', 'manual', 'ai-assisted', 'community', 'text-import', 'csv-import', 'json-import', 'spreadsheet-import')),
  original_deck_id text,
  visibility text not null default 'private' check (visibility in ('private', 'community', 'unlisted', 'public')),
  hierarchy_path text[] not null default '{}'::text[],
  card_count integer not null default 0,
  tags text[] not null default '{}'::text[],
  import_meta jsonb not null default '{}'::jsonb,
  deck_settings jsonb not null default '{}'::jsonb,
  graph jsonb,
  community_refs jsonb not null default '[]'::jsonb,
  version_log jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  revision integer not null default 1,
  deleted_at timestamptz,
  updated_by_device_id text,
  primary key (user_id, id)
);

create unique index if not exists decks_id_user_id_idx on public.decks (id, user_id);
create index if not exists decks_user_id_idx on public.decks (user_id);

create table if not exists public.cards (
  id text,
  user_id uuid not null references auth.users(id) on delete cascade,
  deck_id text not null,
  note_id text,
  source text not null check (source in ('anki-apkg', 'manual', 'ai-assisted', 'community', 'text-import', 'csv-import', 'json-import', 'spreadsheet-import')),
  source_card_id text,
  source_note_id text,
  kind text not null check (kind in ('basic', 'basic-reversed', 'cloze', 'image-occlusion', 'multiple-choice', 'free-text', 'multi-field', 'case-vignette')),
  draft_status text not null default 'accepted',
  status text not null default 'active',
  original_front text not null default '',
  original_back text not null default '',
  original_fields jsonb not null default '[]'::jsonb,
  original_tags text[] not null default '{}'::text[],
  original_html text not null default '',
  immutable_original jsonb not null default '{}'::jsonb,
  media_refs text[] not null default '{}'::text[],
  source_anchors jsonb not null default '[]'::jsonb,
  content_hash text,
  review_state jsonb not null default '{}'::jsonb,
  core_state jsonb not null default '{}'::jsonb,
  version_log jsonb not null default '[]'::jsonb,
  meta jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  revision integer not null default 1,
  deleted_at timestamptz,
  updated_by_device_id text,
  primary key (user_id, id),
  constraint cards_deck_owner_fk foreign key (deck_id, user_id) references public.decks (id, user_id) on delete cascade
);

create unique index if not exists cards_id_user_id_idx on public.cards (id, user_id);
create index if not exists cards_user_id_idx on public.cards (user_id);
create index if not exists cards_deck_id_idx on public.cards (deck_id);

create table if not exists public.card_variants (
  id text,
  user_id uuid not null references auth.users(id) on delete cascade,
  card_id text not null,
  source_card_id text not null,
  front text not null default '',
  back text not null default '',
  variant_type text not null default 'basic' check (variant_type in ('basic', 'reverse', 'cloze', 'mcq', 'transfer', 'case', 'image_occlusion', 'custom')),
  variant_level integer not null default 1 check (variant_level between 1 and 5),
  generation_source text not null default 'user_edited' check (generation_source in ('original', 'ai_generated', 'user_edited', 'imported')),
  parent_variant_id text,
  anchor_variant_id text,
  is_original boolean not null default false,
  is_active boolean not null default true,
  transform_type text not null check (transform_type in ('original', 'rephrase', 'front_back_style_shift', 'cloze_conversion')),
  transform_profile jsonb not null default '{}'::jsonb,
  model_run_id text,
  explanation text not null default '',
  hints_json jsonb,
  answer_options_json jsonb,
  expected_answer_json jsonb,
  confidence numeric,
  semantic_delta text,
  changed_recognition_cues text[] not null default '{}'::text[],
  quality_status text not null default 'active' check (quality_status in ('draft', 'active', 'rejected', 'flagged', 'disabled')),
  content_hash text,
  source_anchors jsonb not null default '[]'::jsonb,
  review_state jsonb not null default '{}'::jsonb,
  performance jsonb not null default '{}'::jsonb,
  feedback jsonb not null default '[]'::jsonb,
  version_log jsonb not null default '[]'::jsonb,
  meta jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  revision integer not null default 1,
  deleted_at timestamptz,
  updated_by_device_id text,
  primary key (user_id, id),
  constraint card_variants_card_owner_fk foreign key (card_id, user_id) references public.cards (id, user_id) on delete cascade
);

create index if not exists card_variants_user_id_idx on public.card_variants (user_id);
create index if not exists card_variants_card_id_idx on public.card_variants (card_id);
create unique index if not exists card_variants_id_user_id_idx on public.card_variants (id, user_id);

create table if not exists public.review_events (
  id text,
  user_id uuid not null references auth.users(id) on delete cascade,
  deck_id text not null,
  reviewable_type text not null check (reviewable_type in ('card', 'variant')),
  reviewable_id text not null,
  source_card_id text,
  rating text not null check (rating in ('again', 'hard', 'good', 'easy')),
  answered_at timestamptz not null default now(),
  response_time_ms integer,
  scheduler_before jsonb,
  scheduler_after jsonb,
  flags jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  created_by_device_id text,
  primary key (user_id, id),
  constraint review_events_deck_owner_fk foreign key (deck_id, user_id) references public.decks (id, user_id) on delete cascade
);

create index if not exists review_events_user_id_idx on public.review_events (user_id);
create index if not exists review_events_deck_id_idx on public.review_events (deck_id);
create index if not exists review_events_answered_at_idx on public.review_events (answered_at desc);
create unique index if not exists review_events_id_user_id_idx on public.review_events (id, user_id);

create table if not exists public.source_documents (
  id text,
  user_id uuid not null references auth.users(id) on delete cascade,
  local_owner_id text,
  file_name text not null,
  mime_type text not null default 'application/octet-stream',
  text text not null default '',
  storage_url text not null default '',
  text_extraction_status text not null default 'pending',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  revision integer not null default 1,
  deleted_at timestamptz,
  updated_by_device_id text,
  primary key (user_id, id)
);

create index if not exists source_documents_user_id_idx on public.source_documents (user_id);
create unique index if not exists source_documents_id_user_id_idx on public.source_documents (id, user_id);

create table if not exists public.ai_jobs (
  id text,
  user_id uuid not null references auth.users(id) on delete cascade,
  deck_id text,
  job_type text not null,
  status text not null default 'queued' check (status in ('queued', 'running', 'succeeded', 'failed', 'cancelled')),
  input_ref jsonb not null default '{}'::jsonb,
  policy jsonb not null default '{}'::jsonb,
  result_ref jsonb,
  error jsonb,
  created_at timestamptz not null default now(),
  started_at timestamptz,
  finished_at timestamptz,
  revision integer not null default 1,
  deleted_at timestamptz,
  updated_by_device_id text,
  primary key (user_id, id),
  constraint ai_jobs_deck_owner_fk foreign key (deck_id, user_id) references public.decks (id, user_id) on delete cascade
);

create index if not exists ai_jobs_user_id_idx on public.ai_jobs (user_id);
create index if not exists ai_jobs_deck_id_idx on public.ai_jobs (deck_id);
create unique index if not exists ai_jobs_id_user_id_idx on public.ai_jobs (id, user_id);

create table if not exists public.media_assets (
  id text,
  user_id uuid not null references auth.users(id) on delete cascade,
  deck_id text,
  card_id text,
  sha1 text not null,
  size bigint not null default 0,
  mime_type text not null default 'application/octet-stream',
  original_name text not null,
  storage_bucket text not null default 'core-media',
  storage_path text not null,
  source text not null default 'apkg-media',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  primary key (user_id, id),
  constraint media_assets_deck_owner_fk foreign key (deck_id, user_id) references public.decks (id, user_id) on delete cascade,
  constraint media_assets_card_owner_fk foreign key (card_id, user_id) references public.cards (id, user_id) on delete cascade
);

create index if not exists media_assets_user_id_idx on public.media_assets (user_id);
create index if not exists media_assets_sha1_idx on public.media_assets (sha1);
create unique index if not exists media_assets_storage_path_idx on public.media_assets (storage_bucket, storage_path);

create table if not exists public.sync_devices (
  id text,
  user_id uuid not null references auth.users(id) on delete cascade,
  label text not null default 'Browser',
  last_seen_at timestamptz not null default now(),
  user_agent text not null default '',
  created_at timestamptz not null default now(),
  primary key (user_id, id)
);

create table if not exists public.sync_conflicts (
  id text,
  user_id uuid not null references auth.users(id) on delete cascade,
  entity_table text not null,
  entity_id text not null,
  base_revision integer,
  local_revision integer,
  remote_revision integer,
  local_value jsonb not null default '{}'::jsonb,
  remote_value jsonb not null default '{}'::jsonb,
  status text not null default 'open' check (status in ('open', 'resolved', 'ignored')),
  resolution jsonb not null default '{}'::jsonb,
  updated_by_device_id text,
  created_at timestamptz not null default now(),
  resolved_at timestamptz,
  primary key (user_id, id)
);

create table if not exists public.admin_audit_events (
  id uuid primary key default gen_random_uuid(),
  actor_user_id uuid references auth.users(id) on delete set null,
  target_user_id uuid references auth.users(id) on delete set null,
  action text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;
alter table public.core_portable_exports enable row level security;
alter table public.decks enable row level security;
alter table public.cards enable row level security;
alter table public.card_variants enable row level security;
alter table public.review_events enable row level security;
alter table public.source_documents enable row level security;
alter table public.ai_jobs enable row level security;
alter table public.media_assets enable row level security;
alter table public.sync_devices enable row level security;
alter table public.sync_conflicts enable row level security;
alter table public.admin_audit_events enable row level security;

drop policy if exists "profiles_select_own" on public.profiles;
drop policy if exists "profiles_insert_own" on public.profiles;
drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_select_own" on public.profiles for select to authenticated using ((select auth.uid()) = id);
create policy "profiles_insert_own" on public.profiles for insert to authenticated with check ((select auth.uid()) = id);
create policy "profiles_update_own" on public.profiles for update to authenticated using ((select auth.uid()) = id) with check ((select auth.uid()) = id);

drop policy if exists "portable_exports_owner_all" on public.core_portable_exports;
create policy "portable_exports_owner_all" on public.core_portable_exports for all to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

drop policy if exists "decks_owner_all" on public.decks;
create policy "decks_owner_all" on public.decks for all to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

drop policy if exists "cards_owner_all" on public.cards;
create policy "cards_owner_all" on public.cards for all to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

drop policy if exists "card_variants_owner_all" on public.card_variants;
create policy "card_variants_owner_all" on public.card_variants for all to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

drop policy if exists "review_events_owner_all" on public.review_events;
create policy "review_events_owner_all" on public.review_events for all to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

drop policy if exists "source_documents_owner_all" on public.source_documents;
create policy "source_documents_owner_all" on public.source_documents for all to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

drop policy if exists "ai_jobs_owner_all" on public.ai_jobs;
create policy "ai_jobs_owner_all" on public.ai_jobs for all to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

drop policy if exists "media_assets_owner_all" on public.media_assets;
create policy "media_assets_owner_all" on public.media_assets for all to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

drop policy if exists "sync_devices_owner_all" on public.sync_devices;
create policy "sync_devices_owner_all" on public.sync_devices for all to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

drop policy if exists "sync_conflicts_owner_all" on public.sync_conflicts;
create policy "sync_conflicts_owner_all" on public.sync_conflicts for all to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

drop policy if exists "admin_audit_service_only" on public.admin_audit_events;
create policy "admin_audit_service_only" on public.admin_audit_events for all to service_role using (true) with check (true);

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('core-media', 'core-media', false, 524288000, null)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "core_media_select_own" on storage.objects;
create policy "core_media_select_own" on storage.objects for select to authenticated
using (bucket_id = 'core-media' and (select auth.uid())::text = (storage.foldername(name))[1]);

drop policy if exists "core_media_insert_own" on storage.objects;
create policy "core_media_insert_own" on storage.objects for insert to authenticated
with check (bucket_id = 'core-media' and (select auth.uid())::text = (storage.foldername(name))[1]);

drop policy if exists "core_media_delete_own" on storage.objects;
create policy "core_media_delete_own" on storage.objects for delete to authenticated
using (bucket_id = 'core-media' and (select auth.uid())::text = (storage.foldername(name))[1]);

revoke all privileges on table
  public.profiles,
  public.core_portable_exports,
  public.decks,
  public.cards,
  public.card_variants,
  public.review_events,
  public.source_documents,
  public.ai_jobs,
  public.media_assets,
  public.sync_devices,
  public.sync_conflicts,
  public.admin_audit_events
from anon;

alter default privileges for role postgres in schema public
  revoke select, insert, update, delete on tables from anon, authenticated, service_role;

alter default privileges for role postgres in schema public
  revoke usage, select on sequences from anon, authenticated, service_role;

alter default privileges for role postgres in schema public
  revoke execute on functions from anon, authenticated, service_role, public;

grant usage on schema public to authenticated, service_role;
grant select, insert, update, delete on table
  public.profiles,
  public.core_portable_exports,
  public.decks,
  public.cards,
  public.card_variants,
  public.review_events,
  public.source_documents,
  public.ai_jobs,
  public.media_assets,
  public.sync_devices,
  public.sync_conflicts
to authenticated;

grant all privileges on table
  public.profiles,
  public.core_portable_exports,
  public.decks,
  public.cards,
  public.card_variants,
  public.review_events,
  public.source_documents,
  public.ai_jobs,
  public.media_assets,
  public.sync_devices,
  public.sync_conflicts,
  public.admin_audit_events
to service_role;

commit;
