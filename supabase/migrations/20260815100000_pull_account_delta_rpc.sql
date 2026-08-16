create or replace function public.pull_account_delta(
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
    where deck_row.user_id = (select auth.uid())
      and deck_row.sync_change_id > greatest(p_cursor, 0::bigint)
    order by deck_row.sync_change_id, deck_row.id
    limit least(greatest(p_limit, 1), 1000) + 1)
    union all
    (select definition_row.sync_change_id, 'note_type_definitions', definition_row.id, pg_catalog.to_jsonb(definition_row)
    from public.note_type_definitions as definition_row
    where definition_row.user_id = (select auth.uid())
      and definition_row.sync_change_id > greatest(p_cursor, 0::bigint)
    order by definition_row.sync_change_id, definition_row.id
    limit least(greatest(p_limit, 1), 1000) + 1)
    union all
    (select card_row.sync_change_id, 'cards', card_row.id, pg_catalog.to_jsonb(card_row)
    from public.cards as card_row
    where card_row.user_id = (select auth.uid())
      and card_row.sync_change_id > greatest(p_cursor, 0::bigint)
    order by card_row.sync_change_id, card_row.id
    limit least(greatest(p_limit, 1), 1000) + 1)
    union all
    (select variant_row.sync_change_id, 'card_variants', variant_row.id, pg_catalog.to_jsonb(variant_row)
    from public.card_variants as variant_row
    where variant_row.user_id = (select auth.uid())
      and variant_row.sync_change_id > greatest(p_cursor, 0::bigint)
    order by variant_row.sync_change_id, variant_row.id
    limit least(greatest(p_limit, 1), 1000) + 1)
    union all
    (select snapshot_row.sync_change_id, 'learning_item_source_snapshots', snapshot_row.id, pg_catalog.to_jsonb(snapshot_row)
    from public.learning_item_source_snapshots as snapshot_row
    where snapshot_row.user_id = (select auth.uid())
      and snapshot_row.sync_change_id > greatest(p_cursor, 0::bigint)
    order by snapshot_row.sync_change_id, snapshot_row.id
    limit least(greatest(p_limit, 1), 1000) + 1)
    union all
    (select review_row.sync_change_id, 'review_events', review_row.id, pg_catalog.to_jsonb(review_row)
    from public.review_events as review_row
    where review_row.user_id = (select auth.uid())
      and review_row.sync_change_id > greatest(p_cursor, 0::bigint)
    order by review_row.sync_change_id, review_row.id
    limit least(greatest(p_limit, 1), 1000) + 1)
    union all
    (select document_row.sync_change_id, 'source_documents', document_row.id, pg_catalog.to_jsonb(document_row)
    from public.source_documents as document_row
    where document_row.user_id = (select auth.uid())
      and document_row.sync_change_id > greatest(p_cursor, 0::bigint)
    order by document_row.sync_change_id, document_row.id
    limit least(greatest(p_limit, 1), 1000) + 1)
  ),
  candidates as materialized (
    select
      change_row.sync_change_id,
      change_row.table_name,
      change_row.id,
      pg_catalog.jsonb_build_object('table', change_row.table_name, 'row', change_row.row_data) as entry
    from account_changes as change_row
    order by change_row.sync_change_id, change_row.table_name, change_row.id
    limit least(greatest(p_limit, 1), 1000) + 1
  ),
  ranked as materialized (
    select
      candidate_row.*,
      pg_catalog.row_number() over (order by candidate_row.sync_change_id, candidate_row.table_name, candidate_row.id) as position,
      pg_catalog.sum(pg_catalog.octet_length(candidate_row.entry::text)) over (
        order by candidate_row.sync_change_id, candidate_row.table_name, candidate_row.id
      ) as cumulative_bytes
    from candidates as candidate_row
  ),
  page as materialized (
    select ranked_row.*
    from ranked as ranked_row
    where ranked_row.position <= least(greatest(p_limit, 1), 1000)
      and (
        ranked_row.cumulative_bytes <= least(greatest(p_max_bytes, 65536), 2097152)
        or ranked_row.position = 1
      )
    order by ranked_row.sync_change_id, ranked_row.table_name, ranked_row.id
  )
  select pg_catalog.jsonb_build_object(
    'changes', coalesce((select pg_catalog.jsonb_agg(page_row.entry order by page_row.sync_change_id, page_row.table_name, page_row.id) from page as page_row), '[]'::jsonb),
    'nextCursor', coalesce((select pg_catalog.max(page_row.sync_change_id) from page as page_row), greatest(p_cursor, 0::bigint)),
    'hasMore', (select pg_catalog.count(*) from ranked) > (select pg_catalog.count(*) from page)
  );
$$;

revoke all on function public.pull_account_delta(bigint, integer, integer) from public;
revoke all on function public.pull_account_delta(bigint, integer, integer) from anon;
grant execute on function public.pull_account_delta(bigint, integer, integer) to authenticated;

create or replace function public.get_account_bootstrap()
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  select pg_catalog.jsonb_build_object(
    'profile', (
      select pg_catalog.to_jsonb(profile_row)
      from public.profiles as profile_row
      where profile_row.id = (select auth.uid())
      limit 1
    ),
    'decks', coalesce((
      select pg_catalog.jsonb_agg(pg_catalog.to_jsonb(deck_row) order by deck_row.hierarchy_path, deck_row.name, deck_row.id)
      from public.decks as deck_row
      where deck_row.user_id = (select auth.uid())
    ), '[]'::jsonb),
    'conflictCount', (
      select pg_catalog.count(*)
      from public.sync_conflicts as conflict_row
      where conflict_row.user_id = (select auth.uid())
        and conflict_row.status in ('open', 'ignored')
    )
  );
$$;

revoke all on function public.get_account_bootstrap() from public;
revoke all on function public.get_account_bootstrap() from anon;
grant execute on function public.get_account_bootstrap() to authenticated;
