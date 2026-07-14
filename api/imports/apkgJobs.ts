import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { runs, tasks } from "@trigger.dev/sdk/v3";
import type { ApkgImportAction, ApkgImportProgress } from "../../src/serverApkgImportContract.ts";

const ACTIVE_STATUSES = ["uploading", "queued", "analyzing", "ready", "committing", "syncing_media"] as const;

interface ApkgJobEnv {
  SUPABASE_URL?: string;
  VITE_SUPABASE_URL?: string;
  SUPABASE_SECRET_KEY?: string;
  SUPABASE_SERVICE_ROLE_KEY?: string;
  SUPABASE_PUBLISHABLE_KEY?: string;
  VITE_SUPABASE_PUBLISHABLE_KEY?: string;
}

export interface ApkgTaskRunner {
  trigger(taskId: "analyze-apkg" | "finalize-apkg-media" | "cleanup-apkg", jobId: string, revision: number, delay?: string): Promise<string>;
  cancel(runId: string): Promise<void>;
}

export class ApkgJobError extends Error {
  constructor(readonly statusCode: number, readonly code: string, message: string) {
    super(message);
  }
}

export function createTriggerApkgRunner(): ApkgTaskRunner {
  return {
    async trigger(taskId, jobId, revision, delay) {
      const handle = await tasks.trigger(taskId, { jobId }, {
        idempotencyKey: `${jobId}:${taskId}:${revision}`,
        idempotencyKeyTTL: "7d",
        machine: "large-1x",
        region: "eu-central-1",
        ...(delay ? { delay } : {}),
      });
      return handle.id;
    },
    async cancel(runId) {
      await runs.cancel(runId);
    },
  };
}

function serverClient(env: ApkgJobEnv): SupabaseClient {
  const url = env.SUPABASE_URL ?? env.VITE_SUPABASE_URL;
  const secret = env.SUPABASE_SECRET_KEY ?? env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !secret) throw new ApkgJobError(503, "imports_unavailable", "Der Serverimport ist nicht konfiguriert.");
  return createClient(url, secret, { auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false } });
}

async function authenticate(env: ApkgJobEnv, accessToken: string): Promise<string> {
  const url = env.SUPABASE_URL ?? env.VITE_SUPABASE_URL;
  const key = env.SUPABASE_PUBLISHABLE_KEY ?? env.VITE_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) throw new ApkgJobError(503, "auth_unavailable", "Die Anmeldung kann gerade nicht geprüft werden.");
  const client = createClient(url, key, {
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
    auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
  });
  const result = await client.auth.getUser(accessToken);
  if (result.error || !result.data.user) throw new ApkgJobError(401, "unauthorized", "Deine Sitzung ist ungültig oder abgelaufen.");
  return result.data.user.id;
}

function projection(row: any): ApkgImportProgress {
  return {
    jobId: row.id,
    status: row.status,
    phase: row.phase,
    revision: Number(row.revision),
    completed: Number(row.progress_completed),
    total: Number(row.progress_total),
    retryable: Boolean(row.retryable),
    ...(row.error_code ? { errorCode: row.error_code } : {}),
    ...(row.status === "ready" && row.report && typeof row.report === "object" ? { report: row.report } : {}),
  };
}

async function ownedJob(client: SupabaseClient, userId: string, jobId: string) {
  const result = await client.from("apkg_import_jobs").select("*").eq("id", jobId).eq("user_id", userId).maybeSingle();
  if (result.error) throw new ApkgJobError(503, "job_store_unavailable", "Der Importstatus ist gerade nicht verfügbar.");
  if (!result.data) throw new ApkgJobError(404, "job_not_found", "Der Importauftrag wurde nicht gefunden.");
  return result.data;
}

async function casUpdate(client: SupabaseClient, row: any, expectedRevision: number, from: readonly string[], values: Record<string, unknown>) {
  if (Number(row.revision) !== expectedRevision || !from.includes(row.status)) {
    throw new ApkgJobError(409, "stale_job", "Der Importstatus hat sich geändert. Bitte lade ihn neu.");
  }
  const result = await client
    .from("apkg_import_jobs")
    .update({ ...values, revision: expectedRevision + 1, updated_at: new Date().toISOString() })
    .eq("id", row.id)
    .eq("user_id", row.user_id)
    .eq("revision", expectedRevision)
    .in("status", [...from])
    .select("*")
    .maybeSingle();
  if (result.error) throw new ApkgJobError(503, "job_store_unavailable", "Der Importstatus konnte nicht gespeichert werden.");
  if (!result.data) throw new ApkgJobError(409, "stale_job", "Der Importstatus hat sich geändert. Bitte lade ihn neu.");
  return result.data;
}

async function rememberRun(client: SupabaseClient, row: any, runId: string) {
  const result = await client.from("apkg_import_jobs").update({ execution_ref: runId }).eq("id", row.id).eq("revision", row.revision);
  if (result.error) throw new ApkgJobError(503, "job_store_unavailable", "Der Importauftrag konnte nicht gestartet werden.");
}

async function markDispatchFailure(client: SupabaseClient, row: any, errorClass: "analysis" | "media") {
  const result = await client.from("apkg_import_jobs").update({
    status: "failed",
    retryable: Number(row.attempt_count) < Number(row.max_attempts),
    error_class: errorClass,
    error_code: "runner_unavailable",
    attempt_count: Number(row.attempt_count) + 1,
    finished_at: new Date().toISOString(),
    revision: Number(row.revision) + 1,
    updated_at: new Date().toISOString(),
  }).eq("id", row.id).eq("revision", row.revision).select("id").maybeSingle();
  if (result.error) throw new ApkgJobError(503, "job_store_unavailable", "Der Importstatus konnte nicht gespeichert werden.");
  if (!result.data) throw new ApkgJobError(409, "stale_job", "Der Importstatus hat sich geändert. Bitte lade ihn neu.");
  throw new ApkgJobError(503, "runner_unavailable", "Der Importauftrag konnte gerade nicht gestartet werden.");
}

async function dispatch(client: SupabaseClient, runner: ApkgTaskRunner, row: any, taskId: "analyze-apkg" | "finalize-apkg-media", errorClass: "analysis" | "media") {
  try {
    const runId = await runner.trigger(taskId, row.id, row.revision);
    await rememberRun(client, row, runId);
  } catch {
    await markDispatchFailure(client, row, errorClass);
  }
}

export function createApkgJobService({ env = process.env, runner = createTriggerApkgRunner() }: { env?: ApkgJobEnv; runner?: ApkgTaskRunner } = {}) {
  return {
    authenticate(accessToken: string) { return authenticate(env, accessToken); },

    async get(userId: string, jobId: string) {
      return projection(await ownedJob(serverClient(env), userId, jobId));
    },

    async act(userId: string, action: ApkgImportAction) {
      const client = serverClient(env);
      if (action.action === "create") {
        const id = crypto.randomUUID();
        const sourcePath = `${userId}/${id}/source.apkg`;
        const inserted = await client.from("apkg_import_jobs").insert({
          id,
          user_id: userId,
          file_name: action.fileName,
          file_size: action.fileSize,
          source_path: sourcePath,
          progress_total: action.fileSize,
        }).select("*").single();
        if (inserted.error) {
          if (inserted.error.code === "23505") throw new ApkgJobError(409, "active_job_exists", "Es läuft bereits ein APKG-Import.");
          throw new ApkgJobError(503, "job_store_unavailable", "Der Importauftrag konnte nicht angelegt werden.");
        }
        const signed = await client.storage.from("core-imports").createSignedUploadUrl(sourcePath);
        if (signed.error) throw new ApkgJobError(503, "upload_unavailable", "Der Upload konnte nicht vorbereitet werden.");
        await runner.trigger("cleanup-apkg", id, inserted.data.revision, "7d").catch(() => undefined);
        return { jobId: id, revision: inserted.data.revision, uploadToken: signed.data.token };
      }

      const row = await ownedJob(client, userId, action.jobId);
      if (action.action === "enqueue-analysis") {
        const queued = await casUpdate(client, row, action.revision, ["uploading"], {
          status: "queued", phase: "download", progress_completed: row.file_size, progress_total: row.file_size,
        });
        await dispatch(client, runner, queued, "analyze-apkg", "analysis");
        return projection(queued);
      }
      if (action.action === "prepare-commit") {
        const signed = await client.storage.from("core-imports").createSignedUrl(String(row.result_path), 300);
        if (signed.error) throw new ApkgJobError(503, "result_unavailable", "Das Importergebnis konnte nicht vorbereitet werden.");
        const committing = await casUpdate(client, row, action.revision, ["ready"], { status: "committing", phase: "commit" });
        return { progress: projection(committing), resultUrl: signed.data.signedUrl };
      }
      if (action.action === "finalize") {
        if (["syncing_media", "succeeded"].includes(row.status) && action.revision <= Number(row.revision)) return projection(row);
        const syncing = await casUpdate(client, row, action.revision, ["committing"], {
          status: "syncing_media", phase: "media", attempt_count: 0, progress_completed: 0, progress_total: 0,
        });
        await dispatch(client, runner, syncing, "finalize-apkg-media", "media");
        return projection(syncing);
      }
      if (action.action === "retry") {
        if (!row.retryable || Number(row.attempt_count) >= Number(row.max_attempts)) {
          throw new ApkgJobError(409, "retry_not_allowed", "Dieser Import kann nicht erneut versucht werden.");
        }
        const mediaRetry = row.error_class === "media";
        const next = await casUpdate(client, row, action.revision, ["failed"], {
          status: mediaRetry ? "syncing_media" : "queued", phase: mediaRetry ? "media" : "download", retryable: false, error_class: null, error_code: null,
        });
        await dispatch(client, runner, next, mediaRetry ? "finalize-apkg-media" : "analyze-apkg", mediaRetry ? "media" : "analysis");
        return projection(next);
      }
      const cancelled = await casUpdate(client, row, action.revision, ACTIVE_STATUSES, {
        status: "cancelled", phase: "cleanup", retryable: false, cancel_requested_at: new Date().toISOString(), finished_at: new Date().toISOString(),
      });
      if (row.execution_ref) await runner.cancel(row.execution_ref).catch(() => undefined);
      await runner.trigger("cleanup-apkg", row.id, cancelled.revision).catch(() => undefined);
      return projection(cancelled);
    },
  };
}

export type ApkgJobService = ReturnType<typeof createApkgJobService>;
