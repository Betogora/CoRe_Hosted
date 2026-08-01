import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { isLocalSupabaseUrl } from "./localE2EEnvironment.ts";

const DELETE_BATCH_SIZE = 1_000;

export interface RetiredLabsStorageManifest {
  projectRef: string;
  retiredDeckIds: string[];
  retiredCardIds: string[];
  coreMediaPaths: string[];
}

interface CleanupOptions {
  supabaseUrl: string;
  secretKey: string;
  manifest: RetiredLabsStorageManifest;
  confirmedProjectRef: string;
  allowLocal?: boolean;
  client?: SupabaseClient;
}

function assertStringArray(value: unknown, field: string): asserts value is string[] {
  if (!Array.isArray(value) || value.some((entry) => typeof entry !== "string" || !entry.trim())) {
    throw new Error(`Das Ausführungsmanifest enthält kein gültiges Feld ${field}.`);
  }
}

export function validateRetiredLabsStorageManifest(value: unknown): RetiredLabsStorageManifest {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Das Ausführungsmanifest ist ungültig.");
  const manifest = value as Partial<RetiredLabsStorageManifest>;
  if (!manifest.projectRef?.trim()) throw new Error("Das Ausführungsmanifest enthält keinen CoRe-Projekt-Ref.");
  assertStringArray(manifest.retiredDeckIds, "retiredDeckIds");
  assertStringArray(manifest.retiredCardIds, "retiredCardIds");
  assertStringArray(manifest.coreMediaPaths, "coreMediaPaths");
  for (const path of manifest.coreMediaPaths) {
    if (path.startsWith("/") || path.split("/").includes("..")) throw new Error(`Unsicherer Storage-Pfad im Manifest: ${path}`);
  }
  return manifest as RetiredLabsStorageManifest;
}

function projectRefFromUrl(supabaseUrl: string) {
  const hostname = new URL(supabaseUrl).hostname;
  return hostname.endsWith(".supabase.co") ? hostname.slice(0, -".supabase.co".length) : "";
}

async function removePaths(client: SupabaseClient, bucket: string, paths: string[]) {
  for (let offset = 0; offset < paths.length; offset += DELETE_BATCH_SIZE) {
    const { error } = await client.storage.from(bucket).remove(paths.slice(offset, offset + DELETE_BATCH_SIZE));
    if (error) throw new Error(`Storage-Objekte in ${bucket} konnten nicht gelöscht werden: ${error.message}`);
  }
}

async function listAllFiles(client: SupabaseClient, bucket: string) {
  const files: string[] = [];
  const folders = [""];
  while (folders.length > 0) {
    const folder = folders.pop() ?? "";
    for (let offset = 0; ; offset += DELETE_BATCH_SIZE) {
      const { data, error } = await client.storage.from(bucket).list(folder, {
        limit: DELETE_BATCH_SIZE,
        offset,
        sortBy: { column: "name", order: "asc" },
      });
      if (error) throw new Error(`Bucket ${bucket} konnte nicht aufgelistet werden: ${error.message}`);
      for (const entry of data) {
        const path = folder ? `${folder}/${entry.name}` : entry.name;
        if (entry.id) files.push(path);
        else folders.push(path);
      }
      if (data.length < DELETE_BATCH_SIZE) break;
    }
  }
  return files;
}

export async function retireLabsStorage({
  supabaseUrl,
  secretKey,
  manifest,
  confirmedProjectRef,
  allowLocal = false,
  client = createClient(supabaseUrl, secretKey, {
    auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
  }),
}: CleanupOptions) {
  const local = isLocalSupabaseUrl(supabaseUrl);
  const actualProjectRef = local ? "local" : projectRefFromUrl(supabaseUrl);
  if (local && !allowLocal) throw new Error("Lokaler Storage darf nur mit expliziter Freigabe bereinigt werden.");
  if (!local && (!actualProjectRef || manifest.projectRef !== actualProjectRef)) {
    throw new Error(`Supabase-URL und CoRe-Projekt-Ref stimmen nicht überein (${actualProjectRef || "unbekannt"}).`);
  }
  if (confirmedProjectRef !== manifest.projectRef) throw new Error("Die bestätigte Projekt-Ref stimmt nicht mit dem Manifest überein.");

  await removePaths(client, "core-media", [...new Set(manifest.coreMediaPaths)]);
  const { data: importsBucket, error: bucketError } = await client.storage.getBucket("core-imports");
  if (bucketError && !/not found/i.test(bucketError.message)) throw new Error(`Bucket core-imports konnte nicht geprüft werden: ${bucketError.message}`);
  if (importsBucket) {
    await removePaths(client, "core-imports", await listAllFiles(client, "core-imports"));
    const { error } = await client.storage.deleteBucket("core-imports");
    if (error) throw new Error(`Bucket core-imports konnte nicht gelöscht werden: ${error.message}`);
  }

  return { deletedCoreMediaObjects: new Set(manifest.coreMediaPaths).size, deletedImportsBucket: Boolean(importsBucket) };
}

async function main() {
  const manifestPath = process.argv[2];
  const confirmationIndex = process.argv.indexOf("--confirm-project-ref");
  const confirmedProjectRef = confirmationIndex >= 0 ? process.argv[confirmationIndex + 1] : "";
  if (!manifestPath || !confirmedProjectRef) {
    throw new Error("Aufruf: npm run storage:retire-labs -- <manifest.json> --confirm-project-ref <CoRe-Projekt-Ref>");
  }
  const manifest = validateRetiredLabsStorageManifest(JSON.parse(await readFile(manifestPath, "utf8")));
  const supabaseUrl = String(process.env.SUPABASE_URL ?? "").trim();
  const secretKey = String(process.env.SUPABASE_SECRET_KEY ?? "").trim();
  if (!supabaseUrl || !secretKey) throw new Error("SUPABASE_URL und SUPABASE_SECRET_KEY müssen gesetzt sein.");
  console.log(JSON.stringify(await retireLabsStorage({ supabaseUrl, secretKey, manifest, confirmedProjectRef })));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
