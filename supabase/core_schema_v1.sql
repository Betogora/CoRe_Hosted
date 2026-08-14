begin;

create extension if not exists pgcrypto;

create sequence if not exists public.account_sync_change_id_seq as bigint;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  display_name text,
  university text,
  field_of_study text,
  preferred_language text not null default 'de',
  timezone text not null default 'Europe/Berlin',
  onboarding_complete boolean not null default false,
  scheduler_preferences jsonb not null default '{}'::jsonb,
  ui_preferences jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.decks (
  id text,
  user_id uuid not null references auth.users(id) on delete cascade,
  local_owner_id text,
  parent_deck_id text,
  name text not null,
  description text not null default '',
  source text not null check (source in ('anki-apkg', 'manual', 'text-import', 'csv-import', 'json-import', 'spreadsheet-import')),
  original_deck_id text,
  hierarchy_path text[] not null default '{}'::text[],
  card_count integer not null default 0,
  tags text[] not null default '{}'::text[],
  import_meta jsonb not null default '{}'::jsonb,
  deck_settings jsonb not null default '{}'::jsonb,
  version_log jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  sync_change_id bigint not null default 0 check (sync_change_id > 0),
  revision integer not null default 1,
  deleted_at timestamptz,
  updated_by_device_id text,
  primary key (user_id, id)
);

create unique index if not exists decks_id_user_id_idx on public.decks (id, user_id);
create index if not exists decks_user_id_idx on public.decks (user_id);
comment on table public.decks is 'Accountgebundene, implizit private CoRe-Kartenstapel.';

create table if not exists public.note_type_definitions (
  id text,
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  definition jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  sync_change_id bigint not null default 0 check (sync_change_id > 0),
  revision integer not null default 1 check (revision >= 1),
  deleted_at timestamptz,
  updated_by_device_id text,
  primary key (user_id, id)
);

create unique index if not exists note_type_definitions_id_user_id_idx on public.note_type_definitions (id, user_id);
create index if not exists note_type_definitions_user_id_idx on public.note_type_definitions (user_id);

create table if not exists public.cards (
  id text,
  user_id uuid not null references auth.users(id) on delete cascade,
  deck_id text not null,
  note_id text,
  source text not null check (source in ('anki-apkg', 'manual', 'text-import', 'csv-import', 'json-import', 'spreadsheet-import')),
  source_card_id text,
  source_note_id text,
  kind text not null check (kind in ('basic', 'basic-with-images', 'basic-reversed', 'cloze', 'image-occlusion', 'multiple-choice', 'free-text', 'multi-field', 'case-vignette')),
  note_type_definition_id text,
  content_document jsonb not null default '{}'::jsonb,
  latest_source_snapshot_id text,
  content_revision integer not null default 1 check (content_revision >= 1),
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
  sync_change_id bigint not null default 0 check (sync_change_id > 0),
  revision integer not null default 1,
  deleted_at timestamptz,
  updated_by_device_id text,
  primary key (id),
  constraint cards_deck_owner_fk foreign key (deck_id, user_id) references public.decks (id, user_id) on delete cascade,
  constraint cards_note_type_definition_owner_fk foreign key (note_type_definition_id, user_id) references public.note_type_definitions (id, user_id)
);

create unique index if not exists cards_id_user_id_idx on public.cards (id, user_id);
create unique index if not exists cards_id_deck_id_user_id_idx on public.cards (id, deck_id, user_id);
create index if not exists cards_user_id_idx on public.cards (user_id);
create index if not exists cards_deck_id_idx on public.cards (deck_id);
create index if not exists cards_note_type_definition_id_idx on public.cards (note_type_definition_id);
create index if not exists cards_latest_source_snapshot_id_idx on public.cards (latest_source_snapshot_id);

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
  projection jsonb not null default '{}'::jsonb,
  scheduling_mode text not null default 'independent-card' check (scheduling_mode in ('independent-card', 'adaptive-presentation')),
  study_deck_id text,
  render_revision integer not null default 1 check (render_revision >= 1),
  meta jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  sync_change_id bigint not null default 0 check (sync_change_id > 0),
  revision integer not null default 1,
  deleted_at timestamptz,
  updated_by_device_id text,
  primary key (user_id, id),
  constraint card_variants_card_owner_fk foreign key (card_id, user_id) references public.cards (id, user_id) on delete cascade,
  constraint card_variants_study_deck_owner_fk foreign key (study_deck_id, user_id) references public.decks (id, user_id) on delete set null (study_deck_id)
);

create index if not exists card_variants_user_id_idx on public.card_variants (user_id);
create index if not exists card_variants_card_id_idx on public.card_variants (card_id);
create unique index if not exists card_variants_id_user_id_idx on public.card_variants (id, user_id);
create index if not exists card_variants_study_deck_id_idx on public.card_variants (study_deck_id);

create table if not exists public.learning_item_source_snapshots (
  id text,
  user_id uuid not null references auth.users(id) on delete cascade,
  card_id text not null,
  schema_version integer not null default 1 check (schema_version = 1),
  source_kind text not null check (source_kind in ('anki-apkg', 'csv', 'legacy-projection')),
  import_fingerprint text not null,
  previous_snapshot_id text,
  note_type_definition_id text,
  source_payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  sync_change_id bigint not null default 0 check (sync_change_id > 0),
  primary key (user_id, id),
  constraint learning_item_source_snapshots_card_owner_fk
    foreign key (card_id, user_id) references public.cards (id, user_id) on delete cascade,
  constraint learning_item_source_snapshots_note_type_owner_fk
    foreign key (note_type_definition_id, user_id) references public.note_type_definitions (id, user_id)
);

create unique index if not exists learning_item_source_snapshots_id_user_id_idx on public.learning_item_source_snapshots (id, user_id);
create unique index if not exists learning_item_source_snapshots_card_user_id_id_idx on public.learning_item_source_snapshots (card_id, user_id, id);
create index if not exists learning_item_source_snapshots_user_id_idx on public.learning_item_source_snapshots (user_id);
create index if not exists learning_item_source_snapshots_card_id_idx on public.learning_item_source_snapshots (card_id);
create index if not exists learning_item_source_snapshots_import_fingerprint_idx on public.learning_item_source_snapshots (user_id, card_id, import_fingerprint);

alter table public.learning_item_source_snapshots
  add constraint learning_item_source_snapshots_previous_owner_fk
  foreign key (card_id, user_id, previous_snapshot_id)
  references public.learning_item_source_snapshots (card_id, user_id, id);

alter table public.cards
  add constraint cards_latest_source_snapshot_owner_fk
  foreign key (id, user_id, latest_source_snapshot_id)
  references public.learning_item_source_snapshots (card_id, user_id, id)
  on delete set null (latest_source_snapshot_id);

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
  sync_change_id bigint not null default 0 check (sync_change_id > 0),
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
  sync_change_id bigint not null default 0 check (sync_change_id > 0),
  revision integer not null default 1,
  deleted_at timestamptz,
  updated_by_device_id text,
  primary key (user_id, id)
);

create index if not exists source_documents_user_id_idx on public.source_documents (user_id);
create unique index if not exists source_documents_id_user_id_idx on public.source_documents (id, user_id);

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
  constraint media_assets_card_deck_owner_fk foreign key (card_id, deck_id, user_id) references public.cards (id, deck_id, user_id) on delete cascade
);

create index if not exists media_assets_user_id_idx on public.media_assets (user_id);
create index if not exists media_assets_sha1_idx on public.media_assets (sha1);
create index if not exists media_assets_storage_path_idx on public.media_assets (storage_bucket, storage_path);
create unique index if not exists media_assets_active_reference_idx on public.media_assets (user_id, storage_bucket, deck_id, coalesce(card_id, ''), sha1) where deleted_at is null;

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
create unique index if not exists sync_conflicts_one_active_entity_idx
  on public.sync_conflicts (user_id, entity_table, entity_id)
  where status in ('open', 'ignored');

alter table public.profiles enable row level security;
alter table public.decks enable row level security;
alter table public.note_type_definitions enable row level security;
alter table public.cards enable row level security;
alter table public.card_variants enable row level security;
alter table public.learning_item_source_snapshots enable row level security;
alter table public.review_events enable row level security;
alter table public.source_documents enable row level security;
alter table public.media_assets enable row level security;
alter table public.sync_devices enable row level security;
alter table public.sync_conflicts enable row level security;

drop policy if exists "profiles_select_own" on public.profiles;
drop policy if exists "profiles_insert_own" on public.profiles;
drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_select_own" on public.profiles for select to authenticated using ((select auth.uid()) = id);
create policy "profiles_insert_own" on public.profiles for insert to authenticated with check ((select auth.uid()) = id);
create policy "profiles_update_own" on public.profiles for update to authenticated using ((select auth.uid()) = id) with check ((select auth.uid()) = id);

drop policy if exists "decks_owner_all" on public.decks;
create policy "decks_owner_all" on public.decks for all to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

drop policy if exists "note_type_definitions_owner_all" on public.note_type_definitions;
create policy "note_type_definitions_owner_all" on public.note_type_definitions for all to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

drop policy if exists "cards_owner_all" on public.cards;
create policy "cards_owner_all" on public.cards for all to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

drop policy if exists "card_variants_owner_all" on public.card_variants;
create policy "card_variants_owner_all" on public.card_variants for all to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

drop policy if exists "learning_item_source_snapshots_owner_all" on public.learning_item_source_snapshots;
create policy "learning_item_source_snapshots_owner_all" on public.learning_item_source_snapshots for all to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

drop policy if exists "review_events_owner_all" on public.review_events;
create policy "review_events_owner_all" on public.review_events for all to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

drop policy if exists "source_documents_owner_all" on public.source_documents;
create policy "source_documents_owner_all" on public.source_documents for all to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

drop policy if exists "media_assets_owner_all" on public.media_assets;
create policy "media_assets_owner_all" on public.media_assets for all to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

drop policy if exists "sync_devices_owner_all" on public.sync_devices;
create policy "sync_devices_owner_all" on public.sync_devices for all to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

drop policy if exists "sync_conflicts_owner_all" on public.sync_conflicts;
create policy "sync_conflicts_owner_all" on public.sync_conflicts for all to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

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

create or replace function public.stamp_account_sync_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' and new.user_id is distinct from old.user_id then
    raise exception 'Account-Zuordnung darf nicht geändert werden.' using errcode = '23514';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(new.user_id::text, 1129270853));
  new.sync_change_id := pg_catalog.nextval('public.account_sync_change_id_seq'::regclass);
  return new;
end
$$;

revoke all on function public.stamp_account_sync_change() from public, anon, authenticated;

drop trigger if exists decks_stamp_account_sync_change on public.decks;
create trigger decks_stamp_account_sync_change before insert or update on public.decks
  for each row execute function public.stamp_account_sync_change();
drop trigger if exists note_type_definitions_stamp_account_sync_change on public.note_type_definitions;
create trigger note_type_definitions_stamp_account_sync_change before insert or update on public.note_type_definitions
  for each row execute function public.stamp_account_sync_change();
drop trigger if exists cards_stamp_account_sync_change on public.cards;
create trigger cards_stamp_account_sync_change before insert or update on public.cards
  for each row execute function public.stamp_account_sync_change();
drop trigger if exists card_variants_stamp_account_sync_change on public.card_variants;
create trigger card_variants_stamp_account_sync_change before insert or update on public.card_variants
  for each row execute function public.stamp_account_sync_change();
drop trigger if exists learning_item_source_snapshots_stamp_account_sync_change on public.learning_item_source_snapshots;
create trigger learning_item_source_snapshots_stamp_account_sync_change before insert or update on public.learning_item_source_snapshots
  for each row execute function public.stamp_account_sync_change();
drop trigger if exists review_events_stamp_account_sync_change on public.review_events;
create trigger review_events_stamp_account_sync_change before insert or update on public.review_events
  for each row execute function public.stamp_account_sync_change();
drop trigger if exists source_documents_stamp_account_sync_change on public.source_documents;
create trigger source_documents_stamp_account_sync_change before insert or update on public.source_documents
  for each row execute function public.stamp_account_sync_change();

create index if not exists decks_user_updated_id_idx
  on public.decks (user_id, updated_at, id);
create index if not exists note_type_definitions_user_updated_id_idx
  on public.note_type_definitions (user_id, updated_at, id);
create index if not exists cards_user_updated_id_idx
  on public.cards (user_id, updated_at, id);
create index if not exists card_variants_user_updated_id_idx
  on public.card_variants (user_id, updated_at, id);
create index if not exists source_documents_user_updated_id_idx
  on public.source_documents (user_id, updated_at, id);
create index if not exists review_events_user_answered_id_idx
  on public.review_events (user_id, answered_at, id);
create index if not exists learning_item_source_snapshots_user_created_id_idx
  on public.learning_item_source_snapshots (user_id, created_at, id);
create index if not exists decks_user_sync_change_id_idx
  on public.decks (user_id, sync_change_id, id);
create index if not exists note_type_definitions_user_sync_change_id_idx
  on public.note_type_definitions (user_id, sync_change_id, id);
create index if not exists cards_user_sync_change_id_idx
  on public.cards (user_id, sync_change_id, id);
create index if not exists card_variants_user_sync_change_id_idx
  on public.card_variants (user_id, sync_change_id, id);
create index if not exists learning_item_source_snapshots_user_sync_change_id_idx
  on public.learning_item_source_snapshots (user_id, sync_change_id, id);
create index if not exists review_events_user_sync_change_id_idx
  on public.review_events (user_id, sync_change_id, id);
create index if not exists source_documents_user_sync_change_id_idx
  on public.source_documents (user_id, sync_change_id, id);

create or replace function public.record_review_atomic(
  p_deck_id text,
  p_deck_base_revision integer,
  p_card_id text,
  p_card_base_revision integer,
  p_card_review_state jsonb,
  p_card_core_state jsonb,
  p_card_updated_at timestamptz,
  p_variant_id text,
  p_variant_base_revision integer,
  p_variant_review_state jsonb,
  p_variant_performance jsonb,
  p_variant_updated_at timestamptz,
  p_event jsonb,
  p_device_id text
)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
  event_id text := p_event->>'id';
  persisted_deck public.decks%rowtype;
  persisted_card public.cards%rowtype;
  persisted_variant public.card_variants%rowtype;
  persisted_event public.review_events%rowtype;
begin
  if current_user_id is null then
    raise exception 'Authentifizierung erforderlich.' using errcode = '42501';
  end if;
  if event_id is null or event_id = '' or p_device_id is null or p_device_id = '' then
    raise exception 'Review-Mutation ist unvollständig.' using errcode = '22023';
  end if;

  select * into persisted_event
  from public.review_events
  where user_id = current_user_id and id = event_id;

  if persisted_event.id is not null then
    if persisted_event.deck_id is distinct from p_deck_id
      or persisted_event.reviewable_type is distinct from p_event->>'reviewable_type'
      or persisted_event.reviewable_id is distinct from p_event->>'reviewable_id'
      or persisted_event.rating is distinct from p_event->>'rating'
      or persisted_event.answered_at is distinct from (p_event->>'answered_at')::timestamptz then
      raise exception 'Review-Event-ID kollidiert mit einer anderen Mutation.' using errcode = '23505';
    end if;
    select * into persisted_deck from public.decks where user_id = current_user_id and id = p_deck_id;
    select * into persisted_card from public.cards where user_id = current_user_id and id = p_card_id;
    if p_variant_id is not null then
      select * into persisted_variant from public.card_variants where user_id = current_user_id and id = p_variant_id;
    end if;
    return jsonb_build_object(
      'deck', to_jsonb(persisted_deck),
      'card', to_jsonb(persisted_card),
      'variant', case when p_variant_id is null then null else to_jsonb(persisted_variant) end,
      'event', to_jsonb(persisted_event),
      'idempotent', true
    );
  end if;

  select * into persisted_deck
  from public.decks
  where user_id = current_user_id and id = p_deck_id and deleted_at is null;
  if persisted_deck.id is null then
    raise exception 'Stapel wurde nicht gefunden.' using errcode = 'P0002';
  end if;

  select * into persisted_card
  from public.cards
  where user_id = current_user_id and id = p_card_id and deck_id = p_deck_id and deleted_at is null
  for update;
  if persisted_card.id is null then
    raise exception 'Karte wurde nicht gefunden.' using errcode = 'P0002';
  end if;

  if p_variant_id is not null then
    select * into persisted_variant
    from public.card_variants
    where user_id = current_user_id and id = p_variant_id and card_id = p_card_id and deleted_at is null
    for update;
    if persisted_variant.id is null then
      raise exception 'Variante wurde nicht gefunden.' using errcode = 'P0002';
    end if;
  end if;

  insert into public.review_events (
    id, user_id, deck_id, reviewable_type, reviewable_id, source_card_id, rating,
    answered_at, response_time_ms, scheduler_before, scheduler_after, flags,
    created_at, created_by_device_id
  ) values (
    event_id,
    current_user_id,
    p_deck_id,
    p_event->>'reviewable_type',
    p_event->>'reviewable_id',
    nullif(p_event->>'source_card_id', ''),
    p_event->>'rating',
    (p_event->>'answered_at')::timestamptz,
    nullif(p_event->>'response_time_ms', '')::integer,
    p_event->'scheduler_before',
    p_event->'scheduler_after',
    coalesce(p_event->'flags', '{}'::jsonb),
    coalesce((p_event->>'created_at')::timestamptz, (p_event->>'answered_at')::timestamptz, now()),
    p_device_id
  )
  on conflict (user_id, id) do nothing
  returning * into persisted_event;
  if persisted_event.id is null then
    select * into persisted_event from public.review_events where user_id = current_user_id and id = event_id;
    if persisted_event.deck_id is distinct from p_deck_id
      or persisted_event.reviewable_type is distinct from p_event->>'reviewable_type'
      or persisted_event.reviewable_id is distinct from p_event->>'reviewable_id'
      or persisted_event.rating is distinct from p_event->>'rating'
      or persisted_event.answered_at is distinct from (p_event->>'answered_at')::timestamptz then
      raise exception 'Review-Event-ID kollidiert mit einer anderen Mutation.' using errcode = '23505';
    end if;
    return jsonb_build_object(
      'deck', to_jsonb(persisted_deck),
      'card', to_jsonb(persisted_card),
      'variant', case when p_variant_id is null then null else to_jsonb(persisted_variant) end,
      'event', to_jsonb(persisted_event),
      'idempotent', true
    );
  end if;

  update public.cards
  set review_state = coalesce(p_card_review_state, '{}'::jsonb),
      core_state = coalesce(p_card_core_state, '{}'::jsonb),
      updated_at = coalesce(p_card_updated_at, now()),
      updated_by_device_id = p_device_id
  where user_id = current_user_id
    and id = p_card_id
    and deck_id = p_deck_id
    and deleted_at is null
    and not exists (
      select 1 from public.review_events as candidate
      where candidate.user_id = current_user_id
        and candidate.id <> event_id
        and (candidate.source_card_id = p_card_id
          or (candidate.reviewable_type in ('card', 'learning_item') and candidate.reviewable_id = p_card_id))
        and (candidate.answered_at, candidate.id) > ((p_event->>'answered_at')::timestamptz, event_id)
    )
  returning * into persisted_card;
  if persisted_card.id is null then
    select * into persisted_card from public.cards where user_id = current_user_id and id = p_card_id;
  end if;

  if p_variant_id is not null then
    update public.card_variants
    set review_state = coalesce(p_variant_review_state, '{}'::jsonb),
        performance = coalesce(p_variant_performance, '{}'::jsonb),
        updated_at = coalesce(p_variant_updated_at, p_card_updated_at, now()),
        updated_by_device_id = p_device_id
    where user_id = current_user_id
      and id = p_variant_id
      and card_id = p_card_id
      and deleted_at is null
      and not exists (
        select 1 from public.review_events as candidate
        where candidate.user_id = current_user_id
          and candidate.id <> event_id
          and candidate.reviewable_id = p_variant_id
          and (candidate.answered_at, candidate.id) > ((p_event->>'answered_at')::timestamptz, event_id)
      )
    returning * into persisted_variant;
    if persisted_variant.id is null then
      select * into persisted_variant from public.card_variants where user_id = current_user_id and id = p_variant_id;
    end if;
  end if;

  return jsonb_build_object(
    'deck', to_jsonb(persisted_deck),
    'card', to_jsonb(persisted_card),
    'variant', case when p_variant_id is null then null else to_jsonb(persisted_variant) end,
    'event', to_jsonb(persisted_event),
    'idempotent', false
  );
end
$$;

revoke all on function public.record_review_atomic(
  text, integer, text, integer, jsonb, jsonb, timestamptz,
  text, integer, jsonb, jsonb, timestamptz, jsonb, text
) from public, anon;
grant execute on function public.record_review_atomic(
  text, integer, text, integer, jsonb, jsonb, timestamptz,
  text, integer, jsonb, jsonb, timestamptz, jsonb, text
) to authenticated, service_role;


revoke all privileges on table
  public.profiles,
  public.decks,
  public.note_type_definitions,
  public.cards,
  public.card_variants,
  public.learning_item_source_snapshots,
  public.review_events,
  public.source_documents,
  public.media_assets,
  public.sync_devices,
  public.sync_conflicts
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
  public.decks,
  public.note_type_definitions,
  public.cards,
  public.card_variants,
  public.learning_item_source_snapshots,
  public.review_events,
  public.source_documents,
  public.media_assets,
  public.sync_devices,
  public.sync_conflicts
to authenticated;

grant all privileges on table
  public.profiles,
  public.decks,
  public.note_type_definitions,
  public.cards,
  public.card_variants,
  public.learning_item_source_snapshots,
  public.review_events,
  public.source_documents,
  public.media_assets,
  public.sync_devices,
  public.sync_conflicts
to service_role;

commit;
