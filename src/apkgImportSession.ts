import type { ApkgCreationPreview } from "./creationWorkflow.ts";
import type { Deck } from "./coreTypes.ts";
import type { ImportMediaFile, ImportSample } from "./apkgImport.ts";

export interface ApkgImportJob {
  fileName?: string;
  fileSize?: number;
  status: string;
  warnings: string[];
  errors: string[];
}

export type ApkgProgressPhase = "analyzing" | "committing";

/** A finished takeover: the cards are stored on the device; cloud and media sync continue in the background. */
export interface ImportCompletion {
  deck: Deck;
  createdCount: number;
  /** Reimport result: kept local edits and Anki cards missing from the package (K5.7). */
  reimport: { keptLocalEdits: number; missingInPackage: number } | null;
  samples: ImportSample[];
  sampleMedia: ImportMediaFile[];
}

export interface ApkgImportSession {
  version: number;
  selectedFile: File | null;
  job: ApkgImportJob | null;
  preview: ApkgCreationPreview | null;
  isParsing: boolean;
  /** Stops the running package analysis; null outside the analysis. */
  analysisAbort: AbortController | null;
  /** Delivered to the creation screen once it is shown, so a takeover finishing elsewhere does not navigate. */
  completion: ImportCompletion | null;
  phaseProgress: { phase: ApkgProgressPhase; percent: number } | null;
}

export function createEmptyApkgImportSession(version = 0): ApkgImportSession {
  return {
    version,
    selectedFile: null,
    job: null,
    preview: null,
    isParsing: false,
    analysisAbort: null,
    completion: null,
    phaseProgress: null,
  };
}

export function hasVisibleApkgImportSession(session: ApkgImportSession): boolean {
  return Boolean(session.selectedFile || session.job || session.preview || session.completion || session.isParsing);
}

export function resolveApkgCreationMethod<T extends string>(requestedMethod: T, session: ApkgImportSession): T | "import" {
  if (requestedMethod) return requestedMethod;
  return hasVisibleApkgImportSession(session) ? "import" : requestedMethod;
}

export function disposeApkgImportPreview(session: ApkgImportSession): void {
  session.analysisAbort?.abort();
  session.preview?.commitGraph.dispose();
}
