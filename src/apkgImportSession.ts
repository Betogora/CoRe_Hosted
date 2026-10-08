import type { ApkgCreationPreview } from "./creationWorkflow.ts";
import type { ImportCloudSyncTask } from "./importCloudSyncTask.ts";
import type { Deck } from "./coreTypes.ts";
import type { MediaSyncProgress, MediaSyncResult, MediaSyncStatus, MediaSyncTask } from "./mediaStore.ts";

export interface ApkgImportJob {
  fileName?: string;
  fileSize?: number;
  status: string;
  warnings: string[];
  errors: string[];
}

export type ApkgCloudProgress = MediaSyncProgress & { status: MediaSyncStatus };
export type ApkgProgressPhase = "analyzing" | "committing" | "syncing_cloud" | "syncing_media";

export interface ApkgImportSession {
  version: number;
  selectedFile: File | null;
  job: ApkgImportJob | null;
  preview: ApkgCreationPreview | null;
  mediaStatus: MediaSyncResult | null;
  isParsing: boolean;
  mediaTask: MediaSyncTask | null;
  cloudTask: ImportCloudSyncTask | null;
  cloudProgress: ApkgCloudProgress | null;
  completedDeck: Deck | null;
  completedCount: number;
  /** Reimport result: kept local edits and Anki cards missing from the package (K5.7). */
  reimport: { keptLocalEdits: number; missingInPackage: number } | null;
  phaseProgress: { phase: ApkgProgressPhase; percent: number } | null;
}

export function createEmptyApkgImportSession(version = 0): ApkgImportSession {
  return {
    version,
    selectedFile: null,
    job: null,
    preview: null,
    mediaStatus: null,
    isParsing: false,
    mediaTask: null,
    cloudTask: null,
    cloudProgress: null,
    completedDeck: null,
    completedCount: 0,
    reimport: null,
    phaseProgress: null,
  };
}

export function hasVisibleApkgImportSession(session: ApkgImportSession): boolean {
  return Boolean(session.selectedFile || session.job || session.preview || session.completedDeck || session.isParsing);
}

export function resolveApkgCreationMethod<T extends string>(requestedMethod: T, session: ApkgImportSession): T | "import" {
  if (requestedMethod) return requestedMethod;
  return hasVisibleApkgImportSession(session) ? "import" : requestedMethod;
}

export function disposeApkgImportPreview(session: ApkgImportSession): void {
  session.preview?.commitGraph.dispose();
}
