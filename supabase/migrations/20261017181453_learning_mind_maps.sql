-- W8b: Je Stapel liegt genau eine Mindmap online; ihre ID ist die Stapel-ID. Das Dokument bleibt versioniertes
-- JSONB, Revision und Zeitstempel vergibt derselbe Trigger wie bei Zusammenfassungen. Bilder liegen privat im Bucket
-- learning-mind-map-images unter <userId>/<sha1>.
create table public.learning_mind_maps (
  user_id uuid not null references auth.users(id) on delete cascade,
  id text not null check (pg_catalog.char_length(id) between 1 and 200),
  deck_id text not null check (deck_id = id),
  document jsonb not null
    check (pg_catalog.jsonb_typeof(document) = 'object' and pg_catalog.pg_column_size(document) <= 5242880),
  revision integer not null default 1 check (revision >= 1),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  primary key (user_id, id),
  foreign key (user_id, deck_id) references public.decks (user_id, id) on delete cascade
);
comment on table public.learning_mind_maps is 'Accountgebundene Infinity Map je Stapel; document ist ein versioniertes App-Dokument.';

create trigger learning_mind_maps_stamp before insert or update on public.learning_mind_maps
  for each row execute function private.stamp_learning_document();

alter table public.learning_mind_maps enable row level security;
create policy "learning_mind_maps_owner_all" on public.learning_mind_maps for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

revoke all privileges on table public.learning_mind_maps from anon;
grant select, insert, update, delete on table public.learning_mind_maps to authenticated;
grant all privileges on table public.learning_mind_maps to service_role;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('learning-mind-map-images', 'learning-mind-map-images', false, 2000000, array['image/png', 'image/jpeg', 'image/webp', 'image/gif'])
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create policy "learning_mind_map_images_select_own" on storage.objects for select to authenticated
using (bucket_id = 'learning-mind-map-images' and (select auth.uid())::text = (storage.foldername(name))[1]);

create policy "learning_mind_map_images_insert_own" on storage.objects for insert to authenticated
with check (bucket_id = 'learning-mind-map-images' and (select auth.uid())::text = (storage.foldername(name))[1]);

create policy "learning_mind_map_images_delete_own" on storage.objects for delete to authenticated
using (bucket_id = 'learning-mind-map-images' and (select auth.uid())::text = (storage.foldername(name))[1]);
