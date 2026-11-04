begin;

-- Kartenverwaltung 2.0, KV1: Die Web-Replica durchsucht einen vollständigen Katalog lokal. Dafür braucht sie den
-- Volltext jedes Inhalts, den der Katalog nicht trägt. Er läuft als eigene Zeile je Inhalt durch den
-- Katalog-Delta-Sync und ändert sich nur mit dem Text, nicht mit jeder Bewertung einer Karte.

create table public.note_search (
  user_id uuid not null references auth.users(id) on delete cascade,
  note_id text not null,
  search_text text not null default '',
  sync_change_id bigint not null default 0 check (sync_change_id > 0),
  deleted_at timestamptz,
  updated_at timestamptz not null default now(),
  primary key (user_id, note_id),
  constraint note_search_note_owner_fk foreign key (user_id, note_id)
    references public.notes (user_id, id) on delete cascade
);
comment on table public.note_search is 'Volltext je Inhalt für die lokale Kartensuche der Web-Replica.';
create index note_search_user_sync_change_id_idx on public.note_search (user_id, sync_change_id, note_id);

alter table public.note_search enable row level security;
create policy "note_search_owner_select" on public.note_search for select to authenticated
  using ((select auth.uid()) = user_id);
grant select on table public.note_search to authenticated, service_role;

create trigger note_search_stamp_account_sync_change before insert or update on public.note_search
  for each row execute function private.stamp_account_sync_change();

-- Gepflegt nur aus `notes`; eine Zeile ändert sich erst, wenn Text oder Löschung sich ändern.
create or replace function private.refresh_note_search()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.note_search (user_id, note_id, search_text, deleted_at, updated_at)
  select changed_note.user_id, changed_note.id, left(changed_note.search_text, 4000), changed_note.deleted_at, pg_catalog.now()
  from new_rows as changed_note
  on conflict (user_id, note_id) do update set
    search_text = excluded.search_text,
    deleted_at = excluded.deleted_at,
    updated_at = excluded.updated_at
  where (public.note_search.search_text, public.note_search.deleted_at)
    is distinct from (excluded.search_text, excluded.deleted_at);
  return null;
end
$$;
revoke all on function private.refresh_note_search() from public, anon, authenticated, service_role;

create trigger notes_search_after_insert after insert on public.notes
  referencing new table as new_rows for each statement execute function private.refresh_note_search();
create trigger notes_search_after_update after update on public.notes
  referencing new table as new_rows for each statement execute function private.refresh_note_search();

insert into public.note_search (user_id, note_id, search_text, deleted_at, updated_at)
select note_row.user_id, note_row.id, left(note_row.search_text, 4000), note_row.deleted_at, pg_catalog.now()
from public.notes as note_row;

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
    union all
    (select search_row.sync_change_id, 'note_search', search_row.note_id, pg_catalog.to_jsonb(search_row)
      from public.note_search as search_row
      where search_row.user_id = (select auth.uid()) and search_row.sync_change_id > greatest(p_cursor, 0)
      order by search_row.sync_change_id, search_row.note_id limit least(greatest(p_limit, 1), 1000) + 1)
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

commit;
