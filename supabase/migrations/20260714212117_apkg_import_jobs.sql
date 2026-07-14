begin;

create table public.apkg_import_jobs (
  user_id uuid not null references auth.users(id) on delete cascade,
  id uuid not null,
  status text not null default 'uploading',
  phase text not null default 'upload',
  revision bigint not null default 1,
  file_name text not null,
  file_size bigint not null,
  source_path text not null,
  result_path text,
  execution_ref text,
  report jsonb not null default '{}'::jsonb,
  progress_completed bigint not null default 0,
  progress_total bigint not null default 0,
  attempt_count integer not null default 0,
  max_attempts integer not null default 3,
  retryable boolean not null default false,
  error_class text,
  error_code text,
  cancel_requested_at timestamptz,
  expires_at timestamptz not null default (now() + interval '7 days'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  started_at timestamptz,
  finished_at timestamptz,
  primary key (id),
  constraint apkg_import_jobs_status_check check (status in ('uploading', 'queued', 'analyzing', 'ready', 'committing', 'syncing_media', 'succeeded', 'failed', 'cancelled')),
  constraint apkg_import_jobs_phase_check check (phase in ('upload', 'download', 'validate', 'parse', 'preview', 'commit', 'media', 'cleanup', 'done')),
  constraint apkg_import_jobs_revision_check check (revision > 0),
  constraint apkg_import_jobs_file_size_check check (file_size > 268435456 and file_size <= 1073741824),
  constraint apkg_import_jobs_progress_check check (progress_completed >= 0 and progress_total >= 0 and progress_completed <= progress_total),
  constraint apkg_import_jobs_attempts_check check (attempt_count >= 0 and max_attempts between 1 and 3),
  constraint apkg_import_jobs_error_code_check check (error_code is null or error_code ~ '^[a-z0-9_]{1,80}$')
);

create index apkg_import_jobs_user_created_at_idx on public.apkg_import_jobs (user_id, created_at desc);
create unique index apkg_import_jobs_one_active_per_user_idx on public.apkg_import_jobs (user_id)
  where status in ('uploading', 'queued', 'analyzing', 'ready', 'committing', 'syncing_media');

alter table public.apkg_import_jobs enable row level security;
revoke all privileges on table public.apkg_import_jobs from public, anon, authenticated;
grant all privileges on table public.apkg_import_jobs to service_role;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('core-imports', 'core-imports', false, 1073741824, null)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

commit;
