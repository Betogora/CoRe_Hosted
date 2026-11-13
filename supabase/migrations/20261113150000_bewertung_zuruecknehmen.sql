-- Eine Bewertung zurücknehmen (Strg+Z/U beim Lernen): Das Ereignis verschwindet aus Verlauf und Statistik
-- (der Löschtrigger rechnet die Tageswerte nach), Karte und Variante erhalten den Lernstand von vor der Bewertung.
-- Den Lernstand übernimmt die Karte nur, solange keine spätere Bewertung eines anderen Geräts existiert; dann bleibt
-- deren Stand; der Katalog rechnet den Verlauf trotzdem ohne das Ereignis neu. Ein schon entferntes Ereignis lässt
-- alles unverändert (Wiederholung desselben Auftrags).
create or replace function public.undo_review_atomic(
  p_event_id text,
  p_card_id text,
  p_study jsonb,
  p_card_updated_at timestamptz,
  p_variant_id text,
  p_variant_performance jsonb,
  p_variant_updated_at timestamptz,
  p_device_id text
)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
  removed_event public.review_events%rowtype;
  persisted_card public.cards%rowtype;
  persisted_variant public.card_variants%rowtype;
begin
  if current_user_id is null then
    raise exception 'Authentifizierung erforderlich.' using errcode = '42501';
  end if;
  if p_event_id is null or p_event_id = '' or p_card_id is null or p_device_id is null or p_device_id = '' then
    raise exception 'Rücknahme ist unvollständig.' using errcode = '22023';
  end if;

  select * into persisted_card from public.cards
  where user_id = current_user_id and id = p_card_id
  for update;
  if persisted_card.id is null then
    raise exception 'Karte wurde nicht gefunden.' using errcode = 'P0002';
  end if;

  delete from public.review_events
  where user_id = current_user_id and id = p_event_id and card_id = p_card_id and rating <> 'manual'
  returning * into removed_event;

  if removed_event.id is not null then
    update public.cards set
      state = p_study->>'state',
      due_at = (p_study->>'due_at')::timestamptz,
      stability = (p_study->>'stability')::double precision,
      difficulty = (p_study->>'difficulty')::double precision,
      reps = (p_study->>'reps')::integer,
      lapses = (p_study->>'lapses')::integer,
      interval_days = (p_study->>'interval_days')::double precision,
      learning_step_index = (p_study->>'learning_step_index')::integer,
      last_reviewed_at = nullif(p_study->>'last_reviewed_at', '')::timestamptz,
      last_rating = nullif(p_study->>'last_rating', ''),
      leeched_at = nullif(p_study->>'leeched_at', '')::timestamptz,
      study_extra = coalesce(p_study->'study_extra', '{}'::jsonb),
      study_revision = study_revision + 1,
      updated_at = coalesce(p_card_updated_at, now()),
      updated_by_device_id = p_device_id
    where user_id = current_user_id
      and id = p_card_id
      and not exists (
        select 1 from public.review_events as candidate
        where candidate.user_id = current_user_id
          and candidate.card_id = p_card_id
          and (candidate.answered_at, candidate.id) > (removed_event.answered_at, removed_event.id)
      )
    returning * into persisted_card;
    -- A later answer keeps its study state; the touch still lets the catalog recompute the history without the event.
    if persisted_card.id is null then
      update public.cards set updated_by_device_id = p_device_id
      where user_id = current_user_id and id = p_card_id
      returning * into persisted_card;
    end if;

    if p_variant_id is not null then
      update public.card_variants set
        performance = coalesce(p_variant_performance, '{}'::jsonb),
        updated_at = coalesce(p_variant_updated_at, p_card_updated_at, now()),
        updated_by_device_id = p_device_id
      where user_id = current_user_id
        and id = p_variant_id
        and card_id = p_card_id
        and not exists (
          select 1 from public.review_events as candidate
          where candidate.user_id = current_user_id
            and candidate.card_id = p_card_id
            and candidate.variant_id = p_variant_id
            and (candidate.answered_at, candidate.id) > (removed_event.answered_at, removed_event.id)
        );
    end if;
  end if;

  if p_variant_id is not null then
    select * into persisted_variant from public.card_variants
    where user_id = current_user_id and id = p_variant_id and card_id = p_card_id;
  end if;

  return pg_catalog.jsonb_build_object(
    'card', pg_catalog.to_jsonb(persisted_card),
    'variant', case when persisted_variant.id is null then null else pg_catalog.to_jsonb(persisted_variant) end,
    'idempotent', removed_event.id is null
  );
end;
$$;

revoke all on function public.undo_review_atomic(text, text, jsonb, timestamptz, text, jsonb, timestamptz, text) from public, anon;
grant execute on function public.undo_review_atomic(text, text, jsonb, timestamptz, text, jsonb, timestamptz, text) to authenticated, service_role;
