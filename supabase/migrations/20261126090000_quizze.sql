-- Quizze liegen je Konto online wie Zusammenfassungen: Das Dokument (Fragen und Durchgänge) bleibt versioniertes
-- JSONB und wird in der App validiert; Revision und Zeitstempel vergibt derselbe Trigger wie bei den Lerndokumenten.
create table public.learning_quizzes (
  user_id uuid not null references auth.users(id) on delete cascade,
  id text not null check (pg_catalog.char_length(id) between 1 and 200),
  deck_id text not null,
  document jsonb not null
    check (pg_catalog.jsonb_typeof(document) = 'object' and pg_catalog.pg_column_size(document) <= 2097152),
  revision integer not null default 1 check (revision >= 1),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  primary key (user_id, id),
  foreign key (user_id, deck_id) references public.decks (user_id, id) on delete cascade
);
comment on table public.learning_quizzes is 'Accountgebundene Quizze je Stapel samt Durchgängen; document ist ein versioniertes App-Dokument.';
create index learning_quizzes_user_deck_idx on public.learning_quizzes (user_id, deck_id);

create trigger learning_quizzes_stamp before insert or update on public.learning_quizzes
  for each row execute function private.stamp_learning_document();

alter table public.learning_quizzes enable row level security;
create policy "learning_quizzes_owner_all" on public.learning_quizzes for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

revoke all privileges on table public.learning_quizzes from anon;
grant select, insert, update, delete on table public.learning_quizzes to authenticated;
grant all privileges on table public.learning_quizzes to service_role;
