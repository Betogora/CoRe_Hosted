begin;

create temporary table retired_deck_ids on commit drop as
select user_id, id
from public.decks
where source in ('ai-assisted', 'community');

create temporary table retired_card_ids on commit drop as
select c.user_id, c.id
from public.cards c
where c.source in ('ai-assisted', 'community')
   or exists (
     select 1
     from retired_deck_ids d
     where d.user_id = c.user_id and d.id = c.deck_id
   );

delete from public.sync_conflicts sc
where (sc.entity_table = 'cards' and exists (
  select 1 from retired_card_ids c where c.user_id = sc.user_id and c.id = sc.entity_id
)) or (sc.entity_table = 'decks' and exists (
  select 1 from retired_deck_ids d where d.user_id = sc.user_id and d.id = sc.entity_id
));

delete from public.review_events r
where exists (
  select 1 from retired_card_ids c where c.user_id = r.user_id and c.id = r.source_card_id
);

delete from public.cards c
where exists (
  select 1 from retired_card_ids retired where retired.user_id = c.user_id and retired.id = c.id
);

delete from public.decks d
where exists (
  select 1 from retired_deck_ids retired where retired.user_id = d.user_id and retired.id = d.id
);

drop table if exists public.ai_jobs;
drop table if exists public.apkg_import_jobs;
drop table if exists public.core_portable_exports;
drop table if exists public.admin_audit_events;

alter table public.profiles drop column if exists privacy;
alter table public.decks
  drop column if exists graph,
  drop column if exists community_refs,
  drop column if exists visibility;

alter table public.decks drop constraint if exists decks_source_check;
alter table public.decks add constraint decks_source_check
  check (source in ('anki-apkg', 'manual', 'text-import', 'csv-import', 'json-import', 'spreadsheet-import'));

alter table public.cards drop constraint if exists cards_source_check;
alter table public.cards add constraint cards_source_check
  check (source in ('anki-apkg', 'manual', 'text-import', 'csv-import', 'json-import', 'spreadsheet-import'));

comment on table public.decks is 'Accountgebundene, implizit private CoRe-Kartenstapel.';

commit;
