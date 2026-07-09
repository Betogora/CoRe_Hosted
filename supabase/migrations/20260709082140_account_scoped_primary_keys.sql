begin;

alter table public.ai_jobs drop constraint if exists ai_jobs_deck_owner_fk;
alter table public.review_events drop constraint if exists review_events_deck_owner_fk;
alter table public.card_variants drop constraint if exists card_variants_card_owner_fk;
alter table public.cards drop constraint if exists cards_deck_owner_fk;

alter table public.decks drop constraint if exists decks_pkey;
alter table public.cards drop constraint if exists cards_pkey;
alter table public.card_variants drop constraint if exists card_variants_pkey;
alter table public.review_events drop constraint if exists review_events_pkey;
alter table public.source_documents drop constraint if exists source_documents_pkey;
alter table public.ai_jobs drop constraint if exists ai_jobs_pkey;

alter table public.decks add constraint decks_pkey primary key (user_id, id);
alter table public.cards add constraint cards_pkey primary key (user_id, id);
alter table public.card_variants add constraint card_variants_pkey primary key (user_id, id);
alter table public.review_events add constraint review_events_pkey primary key (user_id, id);
alter table public.source_documents add constraint source_documents_pkey primary key (user_id, id);
alter table public.ai_jobs add constraint ai_jobs_pkey primary key (user_id, id);

create unique index if not exists decks_id_user_id_idx on public.decks (id, user_id);
create unique index if not exists cards_id_user_id_idx on public.cards (id, user_id);
create unique index if not exists card_variants_id_user_id_idx on public.card_variants (id, user_id);
create unique index if not exists review_events_id_user_id_idx on public.review_events (id, user_id);
create unique index if not exists source_documents_id_user_id_idx on public.source_documents (id, user_id);
create unique index if not exists ai_jobs_id_user_id_idx on public.ai_jobs (id, user_id);

alter table public.cards
  add constraint cards_deck_owner_fk
  foreign key (deck_id, user_id)
  references public.decks (id, user_id)
  on delete cascade;

alter table public.card_variants
  add constraint card_variants_card_owner_fk
  foreign key (card_id, user_id)
  references public.cards (id, user_id)
  on delete cascade;

alter table public.review_events
  add constraint review_events_deck_owner_fk
  foreign key (deck_id, user_id)
  references public.decks (id, user_id)
  on delete cascade;

alter table public.ai_jobs
  add constraint ai_jobs_deck_owner_fk
  foreign key (deck_id, user_id)
  references public.decks (id, user_id)
  on delete cascade;

drop policy if exists "decks_owner_all" on public.decks;
create policy "decks_owner_all" on public.decks for all to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

drop policy if exists "cards_owner_all" on public.cards;
create policy "cards_owner_all" on public.cards for all to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

drop policy if exists "card_variants_owner_all" on public.card_variants;
create policy "card_variants_owner_all" on public.card_variants for all to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

drop policy if exists "review_events_owner_all" on public.review_events;
create policy "review_events_owner_all" on public.review_events for all to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

drop policy if exists "source_documents_owner_all" on public.source_documents;
create policy "source_documents_owner_all" on public.source_documents for all to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

drop policy if exists "ai_jobs_owner_all" on public.ai_jobs;
create policy "ai_jobs_owner_all" on public.ai_jobs for all to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

revoke all privileges on table
  public.profiles,
  public.core_portable_exports,
  public.decks,
  public.cards,
  public.card_variants,
  public.review_events,
  public.source_documents,
  public.ai_jobs
from anon;

grant usage on schema public to authenticated, service_role;
grant select, insert, update, delete on table
  public.profiles,
  public.core_portable_exports,
  public.decks,
  public.cards,
  public.card_variants,
  public.review_events,
  public.source_documents,
  public.ai_jobs
to authenticated;

grant all privileges on table
  public.profiles,
  public.core_portable_exports,
  public.decks,
  public.cards,
  public.card_variants,
  public.review_events,
  public.source_documents,
  public.ai_jobs
to service_role;

commit;
