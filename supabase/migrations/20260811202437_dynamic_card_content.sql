begin;

create table if not exists public.note_type_definitions (
  id text,
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  definition jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  revision integer not null default 1 check (revision >= 1),
  deleted_at timestamptz,
  updated_by_device_id text,
  primary key (user_id, id)
);

create unique index if not exists note_type_definitions_id_user_id_idx
  on public.note_type_definitions (id, user_id);
create index if not exists note_type_definitions_user_id_idx
  on public.note_type_definitions (user_id);

alter table public.cards
  add column if not exists note_type_definition_id text,
  add column if not exists content_document jsonb not null default '{}'::jsonb,
  add column if not exists latest_source_snapshot_id text,
  add column if not exists content_revision integer not null default 1;

alter table public.cards
  add constraint cards_note_type_definition_owner_fk
  foreign key (note_type_definition_id, user_id)
  references public.note_type_definitions (id, user_id);

alter table public.cards
  add constraint cards_content_revision_check check (content_revision >= 1);

alter table public.cards
  drop constraint if exists cards_kind_check;

alter table public.cards
  add constraint cards_kind_check check (
    kind in (
      'basic',
      'basic-with-images',
      'basic-reversed',
      'cloze',
      'image-occlusion',
      'multiple-choice',
      'free-text',
      'multi-field',
      'case-vignette'
    )
  );

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
  primary key (user_id, id),
  constraint learning_item_source_snapshots_card_owner_fk
    foreign key (card_id, user_id)
    references public.cards (id, user_id)
    on delete cascade,
  constraint learning_item_source_snapshots_note_type_owner_fk
    foreign key (note_type_definition_id, user_id)
    references public.note_type_definitions (id, user_id)
);

create unique index if not exists learning_item_source_snapshots_id_user_id_idx
  on public.learning_item_source_snapshots (id, user_id);
create unique index if not exists learning_item_source_snapshots_card_user_id_id_idx
  on public.learning_item_source_snapshots (card_id, user_id, id);
create index if not exists learning_item_source_snapshots_user_id_idx
  on public.learning_item_source_snapshots (user_id);
create index if not exists learning_item_source_snapshots_card_id_idx
  on public.learning_item_source_snapshots (card_id);
create index if not exists learning_item_source_snapshots_import_fingerprint_idx
  on public.learning_item_source_snapshots (user_id, card_id, import_fingerprint);

alter table public.learning_item_source_snapshots
  add constraint learning_item_source_snapshots_previous_owner_fk
  foreign key (card_id, user_id, previous_snapshot_id)
  references public.learning_item_source_snapshots (card_id, user_id, id);

alter table public.cards
  add constraint cards_latest_source_snapshot_owner_fk
  foreign key (id, user_id, latest_source_snapshot_id)
  references public.learning_item_source_snapshots (card_id, user_id, id)
  on delete set null (latest_source_snapshot_id);

create index if not exists cards_note_type_definition_id_idx
  on public.cards (note_type_definition_id);
create index if not exists cards_latest_source_snapshot_id_idx
  on public.cards (latest_source_snapshot_id);

alter table public.card_variants
  add column if not exists projection jsonb not null default '{}'::jsonb,
  add column if not exists scheduling_mode text not null default 'independent-card',
  add column if not exists study_deck_id text,
  add column if not exists render_revision integer not null default 1;

alter table public.card_variants
  add constraint card_variants_scheduling_mode_check
  check (scheduling_mode in ('independent-card', 'adaptive-presentation'));

alter table public.card_variants
  add constraint card_variants_render_revision_check
  check (render_revision >= 1);

alter table public.card_variants
  add constraint card_variants_study_deck_owner_fk
  foreign key (study_deck_id, user_id)
  references public.decks (id, user_id)
  on delete set null (study_deck_id);

create index if not exists card_variants_study_deck_id_idx
  on public.card_variants (study_deck_id);

alter table public.note_type_definitions enable row level security;
alter table public.learning_item_source_snapshots enable row level security;

drop policy if exists "note_type_definitions_owner_all" on public.note_type_definitions;
create policy "note_type_definitions_owner_all"
  on public.note_type_definitions
  for all
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists "learning_item_source_snapshots_owner_all" on public.learning_item_source_snapshots;
create policy "learning_item_source_snapshots_owner_all"
  on public.learning_item_source_snapshots
  for all
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

revoke all privileges on table
  public.note_type_definitions,
  public.learning_item_source_snapshots
from anon;

grant select, insert, update, delete on table
  public.note_type_definitions,
  public.learning_item_source_snapshots
to authenticated;

grant all privileges on table
  public.note_type_definitions,
  public.learning_item_source_snapshots
to service_role;

commit;
