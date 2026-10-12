-- ADR-034, Ergänzung 2026-10-12: Lernstand aller Karten gewählter Stapel ohne Kartenkörper.
-- Planungen wie die Prüfungsprognose brauchen FSRS-Werte jeder Karte, die Web-Replica hält aber nur ein Lernfenster.
-- Seiten nach Karten-ID; der Client blättert mit der letzten ID weiter, bis weniger als `p_limit` Zeilen kommen.
create or replace function public.list_account_card_study_states(
  p_deck_ids text[],
  p_after_card_id text default null,
  p_limit integer default 2000
)
returns table (
  card_id text,
  deck_id text,
  note_id text,
  status text,
  state text,
  due_at timestamptz,
  stability double precision,
  difficulty double precision,
  reps integer,
  lapses integer,
  interval_days double precision,
  learning_step_index integer,
  last_reviewed_at timestamptz,
  last_rating text,
  study_revision integer,
  active_variant_count integer
)
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
begin
  if current_user_id is null then
    raise exception 'Anmeldung erforderlich.' using errcode = '42501';
  end if;
  if coalesce(pg_catalog.array_length(p_deck_ids, 1), 0) > 5000 then
    raise exception 'Höchstens 5000 Stapel können gleichzeitig geladen werden.' using errcode = '22023';
  end if;

  return query
    select card_row.id, card_row.deck_id, card_row.note_id, card_row.status, card_row.state, card_row.due_at,
      card_row.stability, card_row.difficulty, card_row.reps, card_row.lapses, card_row.interval_days,
      card_row.learning_step_index, card_row.last_reviewed_at, card_row.last_rating, card_row.study_revision,
      coalesce(catalog_row.active_variant_count, 0)
    from public.cards as card_row
    left join public.card_catalog as catalog_row
      on catalog_row.user_id = card_row.user_id and catalog_row.id = card_row.id
    where card_row.user_id = current_user_id
      and card_row.deck_id = any(p_deck_ids)
      and card_row.deleted_at is null
      and (p_after_card_id is null or card_row.id > p_after_card_id)
    order by card_row.id
    limit least(greatest(coalesce(p_limit, 2000), 1), 5000);
end
$$;

revoke all on function public.list_account_card_study_states(text[], text, integer) from public, anon;
grant execute on function public.list_account_card_study_states(text[], text, integer) to authenticated, service_role;
