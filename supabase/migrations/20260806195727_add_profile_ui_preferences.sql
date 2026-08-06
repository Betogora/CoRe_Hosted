alter table public.profiles
  add column if not exists ui_preferences jsonb not null default '{}'::jsonb;
