create sequence if not exists public.account_sync_change_id_seq as bigint;

alter table public.decks
  add column if not exists sync_change_id bigint;
alter table public.note_type_definitions
  add column if not exists sync_change_id bigint;
alter table public.cards
  add column if not exists sync_change_id bigint;
alter table public.card_variants
  add column if not exists sync_change_id bigint;
alter table public.learning_item_source_snapshots
  add column if not exists sync_change_id bigint;
alter table public.review_events
  add column if not exists sync_change_id bigint;
alter table public.source_documents
  add column if not exists sync_change_id bigint;

update public.decks set sync_change_id = nextval('public.account_sync_change_id_seq') where sync_change_id is null;
update public.note_type_definitions set sync_change_id = nextval('public.account_sync_change_id_seq') where sync_change_id is null;
update public.cards set sync_change_id = nextval('public.account_sync_change_id_seq') where sync_change_id is null;
update public.card_variants set sync_change_id = nextval('public.account_sync_change_id_seq') where sync_change_id is null;
update public.learning_item_source_snapshots set sync_change_id = nextval('public.account_sync_change_id_seq') where sync_change_id is null;
update public.review_events set sync_change_id = nextval('public.account_sync_change_id_seq') where sync_change_id is null;
update public.source_documents set sync_change_id = nextval('public.account_sync_change_id_seq') where sync_change_id is null;

alter table public.decks alter column sync_change_id set not null;
alter table public.note_type_definitions alter column sync_change_id set not null;
alter table public.cards alter column sync_change_id set not null;
alter table public.card_variants alter column sync_change_id set not null;
alter table public.learning_item_source_snapshots alter column sync_change_id set not null;
alter table public.review_events alter column sync_change_id set not null;
alter table public.source_documents alter column sync_change_id set not null;

alter table public.decks alter column sync_change_id set default 0;
alter table public.note_type_definitions alter column sync_change_id set default 0;
alter table public.cards alter column sync_change_id set default 0;
alter table public.card_variants alter column sync_change_id set default 0;
alter table public.learning_item_source_snapshots alter column sync_change_id set default 0;
alter table public.review_events alter column sync_change_id set default 0;
alter table public.source_documents alter column sync_change_id set default 0;

alter table public.decks add constraint decks_sync_change_id_check check (sync_change_id > 0);
alter table public.note_type_definitions add constraint note_type_definitions_sync_change_id_check check (sync_change_id > 0);
alter table public.cards add constraint cards_sync_change_id_check check (sync_change_id > 0);
alter table public.card_variants add constraint card_variants_sync_change_id_check check (sync_change_id > 0);
alter table public.learning_item_source_snapshots add constraint learning_item_source_snapshots_sync_change_id_check check (sync_change_id > 0);
alter table public.review_events add constraint review_events_sync_change_id_check check (sync_change_id > 0);
alter table public.source_documents add constraint source_documents_sync_change_id_check check (sync_change_id > 0);

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

  update public.decks
  set revision = revision + 1,
      updated_at = coalesce(p_card_updated_at, now()),
      updated_by_device_id = p_device_id
  where user_id = current_user_id
    and id = p_deck_id
    and revision = p_deck_base_revision
    and deleted_at is null
  returning * into persisted_deck;
  if persisted_deck.id is null then
    raise exception 'Deck-Revision hat sich geändert.' using errcode = '40001';
  end if;

  update public.cards
  set review_state = coalesce(p_card_review_state, '{}'::jsonb),
      core_state = coalesce(p_card_core_state, '{}'::jsonb),
      revision = revision + 1,
      updated_at = coalesce(p_card_updated_at, now()),
      updated_by_device_id = p_device_id
  where user_id = current_user_id
    and id = p_card_id
    and deck_id = p_deck_id
    and revision = p_card_base_revision
    and deleted_at is null
  returning * into persisted_card;
  if persisted_card.id is null then
    raise exception 'Karten-Revision hat sich geändert.' using errcode = '40001';
  end if;

  if p_variant_id is not null then
    update public.card_variants
    set review_state = coalesce(p_variant_review_state, '{}'::jsonb),
        performance = coalesce(p_variant_performance, '{}'::jsonb),
        revision = revision + 1,
        updated_at = coalesce(p_variant_updated_at, p_card_updated_at, now()),
        updated_by_device_id = p_device_id
    where user_id = current_user_id
      and id = p_variant_id
      and card_id = p_card_id
      and revision = p_variant_base_revision
      and deleted_at is null
    returning * into persisted_variant;
    if persisted_variant.id is null then
      raise exception 'Varianten-Revision hat sich geändert.' using errcode = '40001';
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
  returning * into persisted_event;

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
