-- W8a: Zusammenfassungen liegen je Konto online. Das Dokument bleibt versioniertes JSONB und wird
-- in der App validiert; die Datenbank vergibt Revision und Zeitstempel, damit Schreibkonflikte erkennbar sind.
create table public.learning_summaries (
  user_id uuid not null references auth.users(id) on delete cascade,
  id text not null check (pg_catalog.char_length(id) between 1 and 200),
  deck_id text not null,
  document jsonb not null
    check (pg_catalog.jsonb_typeof(document) = 'object' and pg_catalog.pg_column_size(document) <= 1048576),
  revision integer not null default 1 check (revision >= 1),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  primary key (user_id, id),
  foreign key (user_id, deck_id) references public.decks (user_id, id) on delete cascade
);
comment on table public.learning_summaries is 'Accountgebundene Zusammenfassungen je Stapel; document ist ein versioniertes App-Dokument.';
create index learning_summaries_user_deck_idx on public.learning_summaries (user_id, deck_id);

-- Neue Dokumente beginnen bei Revision 1, jede Änderung erhöht sie um genau eins; Konto, ID und Stapel bleiben fest.
create or replace function private.stamp_learning_document()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' then
    if new.user_id is distinct from old.user_id or new.id is distinct from old.id or new.deck_id is distinct from old.deck_id then
      raise exception 'Konto, ID und Stapel eines Lerndokuments dürfen nicht geändert werden.' using errcode = '23514';
    end if;
    new.revision := old.revision + 1;
  else
    new.revision := 1;
  end if;
  new.updated_at := pg_catalog.now();
  return new;
end
$$;
revoke all on function private.stamp_learning_document() from public, anon, authenticated, service_role;

create trigger learning_summaries_stamp before insert or update on public.learning_summaries
  for each row execute function private.stamp_learning_document();

alter table public.learning_summaries enable row level security;
create policy "learning_summaries_owner_all" on public.learning_summaries for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

revoke all privileges on table public.learning_summaries from anon;
grant select, insert, update, delete on table public.learning_summaries to authenticated;
grant all privileges on table public.learning_summaries to service_role;
