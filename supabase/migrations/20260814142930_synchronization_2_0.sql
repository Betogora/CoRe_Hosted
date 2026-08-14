with ranked as (
  select user_id, id,
    row_number() over (
      partition by user_id, entity_table, entity_id
      order by created_at desc, id desc
    ) as position
  from public.sync_conflicts
  where status in ('open', 'ignored')
)
update public.sync_conflicts as conflict
set status = 'resolved',
    resolution = jsonb_build_object('action', 'automatic-duplicate-cleanup'),
    resolved_at = now()
from ranked
where conflict.user_id = ranked.user_id
  and conflict.id = ranked.id
  and ranked.position > 1;

create unique index if not exists sync_conflicts_one_active_entity_idx
  on public.sync_conflicts (user_id, entity_table, entity_id)
  where status in ('open', 'ignored');

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
  event_answered_at timestamptz := (p_event->>'answered_at')::timestamptz;
  inserted_event boolean := false;
  card_event_is_latest boolean := false;
  variant_event_is_latest boolean := false;
  persisted_deck public.decks%rowtype;
  persisted_card public.cards%rowtype;
  persisted_variant public.card_variants%rowtype;
  persisted_event public.review_events%rowtype;
begin
  if current_user_id is null then
    raise exception 'Authentifizierung erforderlich.' using errcode = '42501';
  end if;
  if event_id is null or event_id = '' or event_answered_at is null or p_device_id is null or p_device_id = '' then
    raise exception 'Review-Mutation ist unvollständig.' using errcode = '22023';
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
    event_answered_at,
    nullif(p_event->>'response_time_ms', '')::integer,
    p_event->'scheduler_before',
    p_event->'scheduler_after',
    coalesce(p_event->'flags', '{}'::jsonb),
    coalesce((p_event->>'created_at')::timestamptz, event_answered_at, now()),
    p_device_id
  )
  on conflict (user_id, id) do nothing
  returning * into persisted_event;

  inserted_event := persisted_event.id is not null;
  if not inserted_event then
    select * into persisted_event
    from public.review_events
    where user_id = current_user_id and id = event_id;
    if persisted_event.deck_id is distinct from p_deck_id
      or persisted_event.reviewable_type is distinct from p_event->>'reviewable_type'
      or persisted_event.reviewable_id is distinct from p_event->>'reviewable_id'
      or persisted_event.rating is distinct from p_event->>'rating'
      or persisted_event.answered_at is distinct from event_answered_at then
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

  select not exists (
    select 1 from public.review_events as candidate
    where candidate.user_id = current_user_id
      and candidate.id <> event_id
      and (candidate.source_card_id = p_card_id
        or (candidate.reviewable_type in ('card', 'learning_item') and candidate.reviewable_id = p_card_id))
      and (candidate.answered_at, candidate.id) > (event_answered_at, event_id)
  ) into card_event_is_latest;

  if card_event_is_latest then
    update public.cards
    set review_state = coalesce(p_card_review_state, '{}'::jsonb),
        core_state = coalesce(p_card_core_state, '{}'::jsonb),
        updated_at = coalesce(p_card_updated_at, event_answered_at),
        updated_by_device_id = p_device_id
    where user_id = current_user_id and id = p_card_id
    returning * into persisted_card;
  end if;

  if p_variant_id is not null then
    select not exists (
      select 1 from public.review_events as candidate
      where candidate.user_id = current_user_id
        and candidate.id <> event_id
        and candidate.reviewable_id = p_variant_id
        and (candidate.answered_at, candidate.id) > (event_answered_at, event_id)
    ) into variant_event_is_latest;
    if variant_event_is_latest then
      update public.card_variants
      set review_state = coalesce(p_variant_review_state, '{}'::jsonb),
          performance = coalesce(p_variant_performance, '{}'::jsonb),
          updated_at = coalesce(p_variant_updated_at, event_answered_at),
          updated_by_device_id = p_device_id
      where user_id = current_user_id and id = p_variant_id
      returning * into persisted_variant;
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
