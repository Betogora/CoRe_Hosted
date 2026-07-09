begin;

alter table public.decks
  drop constraint if exists decks_source_check,
  add constraint decks_source_check
    check (source in ('anki-apkg', 'manual', 'ai-assisted', 'community', 'text-import', 'csv-import', 'json-import', 'spreadsheet-import'));

alter table public.cards
  drop constraint if exists cards_source_check,
  add constraint cards_source_check
    check (source in ('anki-apkg', 'manual', 'ai-assisted', 'community', 'text-import', 'csv-import', 'json-import', 'spreadsheet-import'));

alter table public.card_variants
  drop constraint if exists card_variants_transform_type_check,
  add constraint card_variants_transform_type_check
    check (transform_type in ('original', 'rephrase', 'front_back_style_shift', 'cloze_conversion'));

alter table public.card_variants
  add column if not exists variant_type text not null default 'basic',
  add column if not exists variant_level integer not null default 1,
  add column if not exists generation_source text not null default 'user_edited',
  add column if not exists parent_variant_id text,
  add column if not exists anchor_variant_id text,
  add column if not exists is_original boolean not null default false,
  add column if not exists is_active boolean not null default true,
  add column if not exists explanation text not null default '',
  add column if not exists hints_json jsonb,
  add column if not exists answer_options_json jsonb,
  add column if not exists expected_answer_json jsonb,
  add column if not exists performance jsonb not null default '{}'::jsonb;

alter table public.card_variants
  drop constraint if exists card_variants_variant_type_check,
  add constraint card_variants_variant_type_check
    check (variant_type in ('basic', 'reverse', 'cloze', 'mcq', 'transfer', 'case', 'image_occlusion', 'custom')),
  drop constraint if exists card_variants_generation_source_check,
  add constraint card_variants_generation_source_check
    check (generation_source in ('original', 'ai_generated', 'user_edited', 'imported')),
  drop constraint if exists card_variants_variant_level_check,
  add constraint card_variants_variant_level_check
    check (variant_level between 1 and 5);

revoke all privileges on table
  public.profiles,
  public.core_portable_exports,
  public.decks,
  public.cards,
  public.card_variants,
  public.review_events,
  public.source_documents,
  public.ai_jobs
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
  public.ai_jobs
to authenticated;

grant all privileges on table
  public.profiles,
  public.core_portable_exports,
  public.decks,
  public.cards,
  public.card_variants,
  public.review_events,
  public.source_documents,
  public.ai_jobs
to service_role;

commit;
