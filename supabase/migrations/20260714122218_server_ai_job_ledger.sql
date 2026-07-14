begin;

alter table public.ai_jobs
  alter column deck_id drop not null,
  add column if not exists contract_version integer not null default 0,
  add column if not exists prompt_version text,
  add column if not exists schema_version text,
  add column if not exists idempotency_key text,
  add column if not exists request_fingerprint text,
  add column if not exists attempt_count integer not null default 0,
  add column if not exists max_attempts integer not null default 3,
  add column if not exists retryable boolean not null default false,
  add column if not exists next_retry_at timestamptz,
  add column if not exists provider text,
  add column if not exists model text,
  add column if not exists error_class text,
  add column if not exists error_code text,
  add column if not exists input_tokens bigint,
  add column if not exists output_tokens bigint,
  add column if not exists total_tokens bigint,
  add column if not exists pricing_version text,
  add column if not exists cost_micros bigint,
  add column if not exists cost_currency text,
  add column if not exists updated_at timestamptz not null default now();

alter table public.ai_jobs
  add constraint ai_jobs_contract_version_check check (contract_version in (0, 1)),
  add constraint ai_jobs_attempt_count_check check (attempt_count >= 0),
  add constraint ai_jobs_max_attempts_check check (max_attempts between 1 and 10),
  add constraint ai_jobs_token_counts_check check (
    (input_tokens is null or input_tokens >= 0)
    and (output_tokens is null or output_tokens >= 0)
    and (total_tokens is null or total_tokens >= 0)
  ),
  add constraint ai_jobs_cost_check check (cost_micros is null or cost_micros >= 0),
  add constraint ai_jobs_cost_currency_check check (cost_currency is null or cost_currency ~ '^[A-Z]{3}$'),
  add constraint ai_jobs_v1_contract_check check (
    contract_version = 0
    or (
      prompt_version is not null
      and schema_version is not null
      and idempotency_key is not null
      and request_fingerprint is not null
      and provider is not null
      and model is not null
    )
  );

create unique index ai_jobs_user_idempotency_v1_idx
  on public.ai_jobs (user_id, idempotency_key)
  where contract_version = 1;

create index ai_jobs_user_created_at_idx
  on public.ai_jobs (user_id, created_at desc);

drop policy if exists "ai_jobs_owner_all" on public.ai_jobs;
drop policy if exists "ai_jobs_select_own" on public.ai_jobs;
create policy "ai_jobs_select_own" on public.ai_jobs
  for select to authenticated
  using ((select auth.uid()) = user_id);

revoke all privileges on table public.ai_jobs from anon, authenticated;
grant select on table public.ai_jobs to authenticated;
grant all privileges on table public.ai_jobs to service_role;

commit;
