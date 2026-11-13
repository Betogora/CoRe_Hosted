-- Einmalige Reparatur der Stapelpfade: Ein Reimport legte neue Unterstapel mit dem Anki-Pfad an, auch wenn ihr
-- vorhandener Oberstapel lokal verschoben oder umbenannt war. Die Migration leitet `hierarchy_path` jedes lebenden
-- Stapels, der von einem Hauptstapel aus erreichbar ist, aus seiner Baumposition ab. Revision und Änderungszeit
-- bleiben; der Sync-Stempel-Trigger vergibt eine neue `sync_change_id`, sodass jedes Gerät die Pfade übernimmt.

with recursive tree as (
  select user_id, id, array[name]::text[] as path
  from public.decks
  where parent_deck_id is null and deleted_at is null
  union all
  select child.user_id, child.id, tree.path || child.name
  from public.decks as child
  join tree on tree.user_id = child.user_id and tree.id = child.parent_deck_id
  where child.deleted_at is null
)
update public.decks as deck
set hierarchy_path = tree.path
from tree
where deck.user_id = tree.user_id
  and deck.id = tree.id
  and deck.hierarchy_path is distinct from tree.path;
