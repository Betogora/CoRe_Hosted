import * as tus from "tus-js-client";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  APKG_ARTIFACT_MAX_BYTES,
  parseApkgImportProgress,
  parseApkgServerArtifact,
  type ApkgImportProgress,
  type ApkgServerArtifact,
} from "./serverApkgImportContract.ts";

const TUS_CHUNK_BYTES = 6 * 1024 * 1024;
const POLL_INTERVAL_MS = 1_000;
const LAST_JOB_KEY = "core.apkgImport.lastJobId";

interface ServerImportClientOptions {
  client: SupabaseClient | null;
  supabaseUrl: string;
  fetchImpl?: typeof fetch;
}

function safeFileName(value: string): string {
  return value.replace(/[\u0000-\u001f\u007f]/g, "").slice(0, 255) || "anki.apkg";
}

function resumableEndpoint(supabaseUrl: string) {
  const url = new URL(supabaseUrl);
  if (url.hostname.endsWith(".supabase.co")) url.hostname = url.hostname.replace(/\.supabase\.co$/, ".storage.supabase.co");
  url.pathname = "/storage/v1/upload/resumable";
  url.search = "";
  return url.toString();
}

async function gunzipJson(response: Response): Promise<unknown> {
  if (!response.ok || !response.body) throw new Error("Das Importergebnis konnte nicht geladen werden.");
  const body = typeof DecompressionStream === "undefined"
    ? response.body
    : response.body.pipeThrough(new DecompressionStream("gzip"));
  const bytes = await new Response(body).arrayBuffer();
  if (bytes.byteLength > APKG_ARTIFACT_MAX_BYTES) throw new Error("Das Importergebnis ist zu groß.");
  return JSON.parse(new TextDecoder().decode(bytes));
}

export function createServerApkgImportClient({ client, supabaseUrl, fetchImpl = fetch }: ServerImportClientOptions) {
  async function accessToken(): Promise<string> {
    if (!client) throw new Error("Der Serverimport benötigt eine aktive Cloud-Anmeldung.");
    const { data, error } = await client.auth.getSession();
    if (error || !data.session?.access_token) throw new Error("Die Cloud-Anmeldung ist abgelaufen.");
    return data.session.access_token;
  }

  async function request(method: "GET" | "POST", path: string, body?: unknown): Promise<any> {
    const token = await accessToken();
    const response = await fetchImpl(`/api/imports/apkg${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        ...(body ? { "Content-Type": "application/json" } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(String(payload?.message || "Der Serverimport ist fehlgeschlagen."));
    return payload;
  }

  function upload(file: File, userId: string, jobId: string, uploadToken: string, onProgress?: (progress: ApkgImportProgress) => void) {
    return new Promise<void>((resolve, reject) => {
      const uploadTask = new tus.Upload(file, {
        endpoint: resumableEndpoint(supabaseUrl),
        chunkSize: TUS_CHUNK_BYTES,
        retryDelays: [0, 1_000, 3_000, 5_000, 10_000],
        removeFingerprintOnSuccess: true,
        uploadSize: file.size,
        metadata: {
          bucketName: "core-imports",
          objectName: `${userId}/${jobId}/source.apkg`,
          contentType: file.type || "application/octet-stream",
          cacheControl: "no-cache",
        },
        headers: { "x-signature": uploadToken },
        onProgress(uploaded, total) {
          onProgress?.({ jobId, status: "uploading", phase: "upload", revision: 1, completed: uploaded, total, retryable: true });
        },
        onError(error) { reject(new Error(`Der Upload ist fehlgeschlagen: ${error.message}`)); },
        onSuccess() { resolve(); },
      });
      uploadTask.findPreviousUploads().then((previous) => {
        if (previous[0]) uploadTask.resumeFromPreviousUpload(previous[0]);
        uploadTask.start();
      }).catch(reject);
    });
  }

  async function get(jobId: string): Promise<ApkgImportProgress> {
    return parseApkgImportProgress(await request("GET", `?jobId=${encodeURIComponent(jobId)}`));
  }

  async function waitUntilReady(jobId: string, onProgress?: (progress: ApkgImportProgress) => void): Promise<ApkgImportProgress> {
    for (;;) {
      const progress = await get(jobId);
      onProgress?.(progress);
      if (["ready", "failed", "cancelled"].includes(progress.status)) return progress;
      await new Promise((resolve) => window.setTimeout(resolve, POLL_INTERVAL_MS));
    }
  }

  async function waitUntilFinished(jobId: string, onProgress?: (progress: ApkgImportProgress) => void): Promise<ApkgImportProgress> {
    for (;;) {
      const progress = await get(jobId);
      onProgress?.(progress);
      if (["succeeded", "failed", "cancelled"].includes(progress.status)) return progress;
      await new Promise((resolve) => window.setTimeout(resolve, POLL_INTERVAL_MS));
    }
  }

  return {
    async analyze(file: File, onProgress?: (progress: ApkgImportProgress) => void) {
      if (!client) throw new Error("Der Serverimport benötigt eine aktive Cloud-Anmeldung.");
      const userResult = await client.auth.getUser();
      if (userResult.error || !userResult.data.user) throw new Error("Die Cloud-Anmeldung ist abgelaufen.");
      const created = await request("POST", "", { action: "create", fileName: safeFileName(file.name), fileSize: file.size });
      globalThis.localStorage?.setItem(LAST_JOB_KEY, created.jobId);
      await upload(file, userResult.data.user.id, created.jobId, created.uploadToken, onProgress);
      const queued = parseApkgImportProgress(await request("POST", "", { action: "enqueue-analysis", jobId: created.jobId, revision: created.revision }));
      onProgress?.(queued);
      return waitUntilReady(created.jobId, onProgress);
    },
    getLastJobId() { return globalThis.localStorage?.getItem(LAST_JOB_KEY) ?? null; },
    get,
    waitUntilReady,
    waitUntilFinished,
    async retry(progress: ApkgImportProgress) {
      return parseApkgImportProgress(await request("POST", "", { action: "retry", jobId: progress.jobId, revision: progress.revision }));
    },
    async cancel(progress: ApkgImportProgress) {
      const cancelled = parseApkgImportProgress(await request("POST", "", { action: "cancel", jobId: progress.jobId, revision: progress.revision }));
      globalThis.localStorage?.removeItem(LAST_JOB_KEY);
      return cancelled;
    },
    async prepareCommit(progress: ApkgImportProgress): Promise<{ artifact: ApkgServerArtifact; progress: ApkgImportProgress }> {
      const prepared = await request("POST", "", { action: "prepare-commit", jobId: progress.jobId, revision: progress.revision });
      return {
        artifact: parseApkgServerArtifact(await gunzipJson(await fetchImpl(prepared.resultUrl))),
        progress: parseApkgImportProgress(prepared.progress),
      };
    },
    async finalize(progress: ApkgImportProgress, onProgress?: (progress: ApkgImportProgress) => void) {
      const syncing = parseApkgImportProgress(await request("POST", "", { action: "finalize", jobId: progress.jobId, revision: progress.revision }));
      onProgress?.(syncing);
      const finished = await waitUntilFinished(progress.jobId, onProgress);
      if (finished.status === "succeeded") globalThis.localStorage?.removeItem(LAST_JOB_KEY);
      return finished;
    },
  };
}

export type ServerApkgImportClient = ReturnType<typeof createServerApkgImportClient>;
