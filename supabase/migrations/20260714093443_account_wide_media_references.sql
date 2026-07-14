do $$
begin
  if exists (
    select 1 from public.media_assets
    group by user_id, storage_bucket, sha1
    having count(distinct size) > 1
  ) then
    raise exception 'media migration preflight: one account/bucket/sha1 has conflicting sizes';
  end if;

  if exists (
    select 1 from public.media_assets
    group by user_id, storage_bucket, sha1
    having count(distinct storage_path) > 1
  ) then
    raise exception 'media migration preflight: one account/bucket/sha1 has multiple storage paths';
  end if;

  if exists (
    select 1
    from public.media_assets media
    left join public.decks deck on deck.id = media.deck_id and deck.user_id = media.user_id
    left join public.cards card on card.id = media.card_id and card.user_id = media.user_id
    where media.deck_id is null
       or deck.id is null
       or (media.card_id is not null and (card.id is null or card.deck_id <> media.deck_id))
  ) then
    raise exception 'media migration preflight: invalid deck/card ownership reference';
  end if;
end
$$;

drop index if exists public.media_assets_storage_path_idx;
create index media_assets_storage_path_idx on public.media_assets (storage_bucket, storage_path);

alter table public.media_assets alter column deck_id set not null;

create unique index if not exists cards_id_deck_id_user_id_idx
  on public.cards (id, deck_id, user_id);

alter table public.media_assets drop constraint if exists media_assets_card_owner_fk;
alter table public.media_assets
  add constraint media_assets_card_deck_owner_fk
  foreign key (card_id, deck_id, user_id)
  references public.cards (id, deck_id, user_id)
  on delete cascade;

create unique index if not exists media_assets_active_reference_idx
  on public.media_assets (user_id, storage_bucket, deck_id, coalesce(card_id, ''), sha1)
  where deleted_at is null;
