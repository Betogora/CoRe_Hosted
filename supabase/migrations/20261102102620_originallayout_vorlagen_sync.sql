begin;

-- Originallayout importierter Karten (ADR-047): Anki-Vorlagen müssen auf jedem Gerät vorliegen, auch offline.
-- Sie sind wenige Zeilen je Konto und laufen deshalb wie Stapel durch den Katalog-Delta-Sync; ein Reimport,
-- der eine Vorlage per Upsert ersetzt, erreicht so alle Geräte.

alter table public.note_type_sources add column sync_change_id bigint;
update public.note_type_sources set sync_change_id = pg_catalog.nextval('public.account_sync_change_id_seq'::regclass);
alter table public.note_type_sources
  alter column sync_change_id set default 0,
  alter column sync_change_id set not null,
  add constraint note_type_sources_sync_change_id_check check (sync_change_id > 0);
create index note_type_sources_user_sync_change_id_idx on public.note_type_sources (user_id, sync_change_id, id);

-- Der Stempel prüft wie `guard_account_owner` die Account-Zuordnung.
drop trigger note_type_sources_guard_account_owner on public.note_type_sources;
create trigger note_type_sources_stamp_account_sync_change before insert or update on public.note_type_sources
  for each row execute function private.stamp_account_sync_change();

create or replace function public.pull_account_catalog_delta(
  p_cursor bigint default 0,
  p_limit integer default 500,
  p_max_bytes integer default 1048576
)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  with account_changes as materialized (
    (select deck_row.sync_change_id, 'decks'::text as table_name, deck_row.id, pg_catalog.to_jsonb(deck_row) as row_data
      from public.decks as deck_row
      where deck_row.user_id = (select auth.uid()) and deck_row.sync_change_id > greatest(p_cursor, 0)
      order by deck_row.sync_change_id, deck_row.id limit least(greatest(p_limit, 1), 1000) + 1)
    union all
    (select catalog_row.sync_change_id, 'card_catalog', catalog_row.id, pg_catalog.to_jsonb(catalog_row)
      from public.card_catalog as catalog_row
      where catalog_row.user_id = (select auth.uid()) and catalog_row.sync_change_id > greatest(p_cursor, 0)
      order by catalog_row.sync_change_id, catalog_row.id limit least(greatest(p_limit, 1), 1000) + 1)
    union all
    (select summary_row.sync_change_id, 'deck_study_summaries', summary_row.deck_id, pg_catalog.to_jsonb(summary_row)
      from public.deck_study_summaries as summary_row
      where summary_row.user_id = (select auth.uid()) and summary_row.sync_change_id > greatest(p_cursor, 0)
      order by summary_row.sync_change_id, summary_row.deck_id limit least(greatest(p_limit, 1), 1000) + 1)
    union all
    (select type_row.sync_change_id, 'note_type_sources', type_row.id, pg_catalog.to_jsonb(type_row)
      from public.note_type_sources as type_row
      where type_row.user_id = (select auth.uid()) and type_row.sync_change_id > greatest(p_cursor, 0)
      order by type_row.sync_change_id, type_row.id limit least(greatest(p_limit, 1), 1000) + 1)
  ), candidates as materialized (
    select change_row.sync_change_id, change_row.table_name, change_row.id,
      pg_catalog.jsonb_build_object('table', change_row.table_name, 'row', change_row.row_data) as entry
    from account_changes as change_row
    order by change_row.sync_change_id, change_row.table_name, change_row.id
    limit least(greatest(p_limit, 1), 1000) + 1
  ), ranked as materialized (
    select candidates.*,
      pg_catalog.row_number() over (order by sync_change_id, table_name, id) as position,
      pg_catalog.sum(pg_catalog.octet_length(entry::text)) over (order by sync_change_id, table_name, id) as cumulative_bytes
    from candidates
  ), page as materialized (
    select * from ranked
    where position <= least(greatest(p_limit, 1), 1000)
      and (cumulative_bytes <= least(greatest(p_max_bytes, 65536), 2097152) or position = 1)
    order by sync_change_id, table_name, id
  )
  select pg_catalog.jsonb_build_object(
    'changes', coalesce((select pg_catalog.jsonb_agg(entry order by sync_change_id, table_name, id) from page), '[]'::jsonb),
    'nextCursor', coalesce((select max(sync_change_id) from page), greatest(p_cursor, 0)),
    'hasMore', (select count(*) from ranked) > (select count(*) from page)
  );
$$;

create or replace function public.get_account_bootstrap(
  p_cursor text default '',
  p_limit integer default 200,
  p_max_bytes integer default 204800
)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  with learning_context as materialized (
    select
      coalesce(profile_row.timezone, 'UTC') as time_zone,
      least(greatest(case
        when profile_row.scheduler_preferences->>'dayStartHour' ~ '^\d{1,2}$'
          then (profile_row.scheduler_preferences->>'dayStartHour')::integer
        else 0
      end, 0), 23) as day_start_hour
    from (select 1) as singleton
    left join public.profiles as profile_row on profile_row.id = (select auth.uid())
  ), learning_range as materialized (
    select time_zone, day_start_hour, day_key,
      (day_key::timestamp + pg_catalog.make_interval(hours => day_start_hour)) at time zone time_zone as starts_at,
      ((day_key + 1)::timestamp + pg_catalog.make_interval(hours => day_start_hour)) at time zone time_zone as ends_at
    from (
      select learning_context.*,
        ((now() at time zone time_zone) - pg_catalog.make_interval(hours => day_start_hour))::date as day_key
      from learning_context
    ) as dated
  ), deck_candidates as materialized (
    select
      deck_row.id,
      pg_catalog.jsonb_build_object(
        'deck', pg_catalog.to_jsonb(deck_row),
        'summary', pg_catalog.jsonb_build_object(
          'deckId', deck_row.id,
          'totalCount', coalesce(summary_row.total_count, 0),
          'newCount', coalesce(summary_row.new_count, 0),
          'learningCount', coalesce(summary_row.learning_count, 0),
          'matureCount', coalesce(summary_row.mature_count, 0),
          'suspendedCount', coalesce(summary_row.suspended_count, 0),
          'activeVariantCount', coalesce(summary_row.active_variant_count, 0),
          'syncChangeId', coalesce(summary_row.sync_change_id, 0),
          'updatedAt', summary_row.updated_at
        )
      ) as entry
    from public.decks as deck_row
    left join public.deck_study_summaries as summary_row
      on summary_row.user_id = deck_row.user_id and summary_row.deck_id = deck_row.id
    where deck_row.user_id = (select auth.uid())
      and deck_row.id > coalesce(p_cursor, '')
    order by deck_row.id
    limit least(greatest(p_limit, 1), 500) + 1
  ), ranked as materialized (
    select deck_candidates.*,
      pg_catalog.row_number() over (order by id) as position,
      pg_catalog.sum(pg_catalog.octet_length(entry::text)) over (order by id) as cumulative_bytes
    from deck_candidates
  ), page as materialized (
    select * from ranked
    where position <= least(greatest(p_limit, 1), 500)
      and (cumulative_bytes <= least(greatest(p_max_bytes, 65536), 204800) or position = 1)
    order by id
  ), today_events as materialized (
    select review_row.deck_id, review_row.card_id,
      bool_or(coalesce(review_row.scheduler_before->'card'->>'state', 'new') = 'new') as introduced
    from public.review_events as review_row, learning_range
    where coalesce(p_cursor, '') = ''
      and review_row.user_id = (select auth.uid())
      and review_row.rating <> 'manual'
      and review_row.answered_at >= learning_range.starts_at
      and review_row.answered_at < learning_range.ends_at
    group by review_row.deck_id, review_row.card_id
  ), bury_modes as materialized (
    select answered_card.note_id,
      bool_or(answered_deck.deck_settings->>'buryNewSiblings' = 'true') as bury_new,
      bool_or(answered_deck.deck_settings->>'buryReviewSiblings' = 'true') as bury_review,
      bool_or(answered_deck.deck_settings->>'buryInterdayLearningSiblings' = 'true') as bury_interday
    from today_events
    join public.cards as answered_card
      on answered_card.user_id = (select auth.uid()) and answered_card.id = today_events.card_id
    join public.decks as answered_deck
      on answered_deck.user_id = answered_card.user_id and answered_deck.id = answered_card.deck_id
    group by answered_card.note_id
  ), manually_buried as materialized (
    select latest.card_id as id
    from (
      select distinct on (review_row.card_id) review_row.card_id, review_row.flags->>'kind' as kind
      from public.review_events as review_row, learning_range
      where coalesce(p_cursor, '') = ''
        and review_row.user_id = (select auth.uid())
        and review_row.rating = 'manual'
        and review_row.flags->>'kind' in ('manual_bury', 'manual_unbury')
        and review_row.answered_at >= learning_range.starts_at
        and review_row.answered_at < learning_range.ends_at
      order by review_row.card_id, review_row.answered_at desc, review_row.id desc
    ) as latest
    where latest.kind = 'manual_bury'
  ), buried as materialized (
    select sibling.id
    from bury_modes
    join public.cards as sibling
      on sibling.user_id = (select auth.uid()) and sibling.note_id = bury_modes.note_id
    where not exists (select 1 from today_events where today_events.card_id = sibling.id)
      and ((sibling.state = 'new' and bury_modes.bury_new)
        or (sibling.state = 'review' and bury_modes.bury_review)
        or (sibling.state in ('learning', 'relearning') and bury_modes.bury_interday))
    union
    select id from manually_buried
  ), available as materialized (
    select card_row.deck_id,
      count(*) filter (where card_row.state = 'new')::integer as new_count,
      count(*) filter (where card_row.state in ('learning', 'relearning'))::integer as learning_count,
      count(*) filter (where card_row.state = 'review')::integer as due_count
    from public.cards as card_row, learning_range
    where coalesce(p_cursor, '') = ''
      and card_row.user_id = (select auth.uid())
      and card_row.status = 'active'
      and card_row.deleted_at is null
      and card_row.due_at < learning_range.ends_at
      and not exists (select 1 from buried where buried.id = card_row.id)
    group by card_row.deck_id
  )
  select pg_catalog.jsonb_build_object(
    'profile', (
      select pg_catalog.to_jsonb(profile_row) from public.profiles as profile_row
      where profile_row.id = (select auth.uid()) limit 1
    ),
    'decks', coalesce((select pg_catalog.jsonb_agg(entry order by id) from page), '[]'::jsonb),
    'nextCursor', coalesce((select max(id) from page), coalesce(p_cursor, '')),
    'hasMore', (select count(*) from ranked) > (select count(*) from page),
    'confirmedEmpty', not exists (
      select 1 from public.decks as active_deck
      where active_deck.user_id = (select auth.uid()) and active_deck.deleted_at is null
    ),
    'conflictCount', (
      select count(*) from public.sync_conflicts as conflict_row
      where conflict_row.user_id = (select auth.uid()) and conflict_row.status in ('open', 'ignored')
    ),
    'serverCatalogCursor', greatest(
      coalesce((select max(sync_change_id) from public.decks where user_id = (select auth.uid())), 0),
      coalesce((select max(sync_change_id) from public.card_catalog where user_id = (select auth.uid())), 0),
      coalesce((select max(sync_change_id) from public.deck_study_summaries where user_id = (select auth.uid())), 0),
      coalesce((select max(sync_change_id) from public.note_type_sources where user_id = (select auth.uid())), 0)
    ),
    'studyOverview', case when coalesce(p_cursor, '') = '' then pg_catalog.jsonb_build_object(
      'contextKey', (select time_zone || ':' || day_start_hour::text from learning_range),
      'dayKey', (select day_key::text from learning_range),
      'introducedTodayByDeck', coalesce((
        select pg_catalog.jsonb_object_agg(deck_id, total order by deck_id)
        from (select deck_id, count(*)::integer as total from today_events where introduced group by deck_id) as introduced
      ), '{}'::jsonb),
      'reviewedTodayByDeck', coalesce((
        select pg_catalog.jsonb_object_agg(deck_id, total order by deck_id)
        from (select deck_id, count(*)::integer as total from today_events where not introduced group by deck_id) as reviewed
      ), '{}'::jsonb),
      'availableNewByDeck', coalesce((
        select pg_catalog.jsonb_object_agg(deck_id, new_count order by deck_id) from available where new_count > 0
      ), '{}'::jsonb),
      'availableLearningByDeck', coalesce((
        select pg_catalog.jsonb_object_agg(deck_id, learning_count order by deck_id) from available where learning_count > 0
      ), '{}'::jsonb),
      'dueByDeck', coalesce((
        select pg_catalog.jsonb_object_agg(deck_id, due_count order by deck_id) from available where due_count > 0
      ), '{}'::jsonb),
      'forecastByDay', '{}'::jsonb,
      'generatedAt', now()
    ) else null end
  );
$$;

commit;
