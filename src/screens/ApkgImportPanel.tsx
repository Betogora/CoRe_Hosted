import React from "react";
import { AlertCircle, CheckCircle2, Database, FileArchive, Loader2, Upload } from "lucide-react";
import type { ApkgCreationPreview, CreationWorkflow } from "../creationWorkflow.ts";
import type { Deck } from "../coreTypes.ts";
import { projectImportUiState, type ImportUiState } from "../importUiState.ts";
import type { AccountMediaStore, MediaSyncProgress, MediaSyncResult, MediaSyncStatus, MediaSyncTask } from "../mediaStore.ts";
import { LOCAL_APKG_MAX_BYTES, type ApkgImportProgress } from "../serverApkgImportContract.ts";
import { CardHtml, useDeckMediaUrls } from "../ui/cardMedia.tsx";
import { OrbIcon, SoftPanel } from "../ui/coreUi.tsx";
import { formatBytes, importSteps } from "./screenConstants.ts";
import type { ApkgImportReportV1 } from "../apkgImport.ts";

type ApkgWorkflow = Pick<
  CreationWorkflow,
  | "cancelApkgProgress"
  | "commitApkgPreview"
  | "parseApkgFile"
  | "resumeApkgPreview"
  | "retryApkgPreview"
>;

interface ApkgImportJob {
  fileName?: string;
  fileSize?: number;
  status: string;
  warnings: string[];
  errors: string[];
  progress?: ApkgImportProgress;
}

export interface ApkgImportPanelProps {
  existingDecks: Deck[];
  workflow: ApkgWorkflow;
  mediaStore: AccountMediaStore | null;
  serverApkgEnabled?: boolean;
  resumeOnMount?: boolean;
  onCompleted: (deck: Deck) => unknown;
}

type CloudProgress = MediaSyncProgress & { status: MediaSyncStatus };
type PreviewMediaStatus = { persisted: boolean; count: number; errors: string[] };

const notetypeLabels: Record<ApkgImportReportV1["notetypes"][number]["classification"], string> = {
  basic: "Einfach",
  reverse: "Einfach + umgekehrt",
  optional_reverse: "Optional umgekehrt",
  cloze: "Lückentext",
  custom: "Sicherer Fallback",
};

const serverPhaseLabels: Record<ApkgImportProgress["phase"], string> = {
  upload: "Hochladen",
  download: "Datei laden",
  validate: "Sicherheitsprüfung",
  parse: "Anki-Daten lesen",
  preview: "Vorschau erstellen",
  commit: "Import übernehmen",
  media: "Medien synchronisieren",
  cleanup: "Aufräumen",
  done: "Abgeschlossen",
};

function formatServerProgress(progress: ApkgImportProgress): string {
  if (progress.phase === "media" || progress.phase === "done") return `${progress.completed} / ${progress.total} Medien`;
  return `${formatBytes(progress.completed)} / ${formatBytes(progress.total)}`;
}

function toStrings(value: unknown): string[] {
  return Array.isArray(value) ? value.map(String) : [];
}

function toImportJob(value: unknown): ApkgImportJob {
  const job = value && typeof value === "object" ? value as Record<string, unknown> : {};
  return {
    fileName: typeof job.fileName === "string" ? job.fileName : undefined,
    fileSize: typeof job.fileSize === "number" ? job.fileSize : undefined,
    status: typeof job.status === "string" ? job.status : "error",
    warnings: toStrings(job.warnings),
    errors: toStrings(job.errors),
    progress: job.progress as ApkgImportProgress | undefined,
  };
}

function importStatusLabel(status: ImportUiState["status"]): string {
  return {
    idle: "Bereit",
    analyzing: "Analysieren",
    preview: "Vorschau bereit",
    committing: "Übernehmen",
    syncing_media: "Medien werden synchronisiert",
    succeeded: "Erfolgreich",
    partial: "Teilweise fertig",
    failed_retryable: "Fehlgeschlagen, erneut versuchbar",
    failed_terminal: "Fehlgeschlagen",
    cancelled: "Abgebrochen",
  }[status];
}

function nestedImportIdentity(value: unknown): unknown {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  return (value as Record<string, unknown>).ankiImportIdentityV1;
}

export function ApkgImportPanel({ existingDecks, workflow, mediaStore, serverApkgEnabled = false, resumeOnMount = true, onCompleted }: ApkgImportPanelProps) {
  const fileInputRef = React.useRef<HTMLInputElement | null>(null);
  const [selectedFile, setSelectedFile] = React.useState<File | null>(null);
  const [job, setJob] = React.useState<ApkgImportJob | null>(null);
  const [preview, setPreview] = React.useState<ApkgCreationPreview | null>(null);
  const [mediaStatus, setMediaStatus] = React.useState<PreviewMediaStatus | MediaSyncResult | null>(null);
  const [isDragging, setIsDragging] = React.useState(false);
  const [isParsing, setIsParsing] = React.useState(false);
  const [mediaTask, setMediaTask] = React.useState<MediaSyncTask | null>(null);
  const [cloudProgress, setCloudProgress] = React.useState<CloudProgress | null>(null);
  const [serverProgress, setServerProgress] = React.useState<ApkgImportProgress | null>(null);
  const [completedDeck, setCompletedDeck] = React.useState<Deck | null>(null);
  const resumedRef = React.useRef(false);
  const localPreviewDeck = preview?.kind === "local" ? preview.deck : null;
  const { urls: previewMediaUrls, missing: previewMissingMedia } = useDeckMediaUrls(localPreviewDeck, mediaStore);

  function handleServerProgress(next: ApkgImportProgress) {
    setServerProgress(next);
    setPreview((current) => current?.kind === "server" ? { ...current, progress: next } : current);
  }

  React.useEffect(() => {
    if (!resumeOnMount || resumedRef.current) return;
    resumedRef.current = true;
    void workflow.resumeApkgPreview({ existingDecks, onProgress: handleServerProgress }).then((result) => {
      if (!result?.preview) return;
      setPreview(result.preview);
      setJob(toImportJob(result.job));
      setServerProgress(result.preview.progress);
    }).catch(() => undefined);
  }, [existingDecks, resumeOnMount, workflow]);

  async function parseFile(file: File) {
    setSelectedFile(file);
    setPreview(null);
    setServerProgress(null);
    setMediaStatus(null);
    setMediaTask(null);
    setCloudProgress(null);
    setCompletedDeck(null);
    if (file.size > LOCAL_APKG_MAX_BYTES && !serverApkgEnabled) {
      setJob({
        fileName: file.name,
        fileSize: file.size,
        status: "error",
        warnings: [],
        errors: ["In dieser Umgebung sind APKG-Dateien bis 250 MiB freigegeben."],
      });
      return;
    }
    setJob({ fileName: file.name, fileSize: file.size, status: "parsing", warnings: [], errors: [] });
    setIsParsing(true);

    try {
      const result = await workflow.parseApkgFile(file as unknown as Parameters<ApkgWorkflow["parseApkgFile"]>[0], { onProgress: handleServerProgress, existingDecks });
      setMediaStatus(result.mediaStatus);
      setJob(toImportJob(result.job));
      setPreview(result.preview);
    } catch (error) {
      setJob({
        fileName: file.name,
        fileSize: file.size,
        status: "error",
        warnings: [],
        errors: [error instanceof Error ? error.message : "Der Import ist fehlgeschlagen."],
      });
      setPreview(null);
    } finally {
      setIsParsing(false);
    }
  }

  function handleFileInput(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (file) void parseFile(file);
    event.target.value = "";
  }

  function handleDrop(event: React.DragEvent<HTMLLabelElement>) {
    event.preventDefault();
    setIsDragging(false);
    const file = event.dataTransfer.files?.[0];
    if (file) void parseFile(file);
  }

  async function handleCommit() {
    if (!preview) return;
    setJob((current) => ({ ...(current ?? { warnings: [], errors: [] }), status: "committing" }));
    setIsParsing(true);
    try {
      const result = await workflow.commitApkgPreview(preview, { existingDecks, onProgress: handleServerProgress });
      if (result.report.errors.length > 0 || !result.deck) {
        setJob((current) => ({
          ...(current ?? { warnings: [], errors: [] }),
          status: "error",
          warnings: [...new Set([...(current?.warnings ?? []), ...(result.report.warnings ?? [])])],
          errors: [...new Set([...(current?.errors ?? []), ...(result.report.errors ?? [])])],
        }));
        setPreview((current) => current ? { ...current, importReport: result.report } as ApkgCreationPreview : current);
        return;
      }
      if ("serverProgress" in result && result.serverProgress) handleServerProgress(result.serverProgress);
      const serverResultProgress = "serverProgress" in result ? result.serverProgress : undefined;
      setJob((current) => ({
        ...(current ?? { warnings: [], errors: [] }),
        status: serverResultProgress?.status ?? "done",
        progress: serverResultProgress ?? current?.progress,
        warnings: [...new Set([...(current?.warnings ?? []), ...(result.report.warnings ?? [])])],
      }));
      setPreview((current) => current ? { ...current, importReport: result.report } as ApkgCreationPreview : current);
      setCompletedDeck(result.deck);
      if (result.mediaTask) {
        setMediaTask(result.mediaTask);
        setJob((current) => ({ ...(current ?? { warnings: [], errors: [] }), status: "syncing_media" }));
        result.mediaTask.subscribe((progress: MediaSyncProgress, status: MediaSyncStatus) => setCloudProgress({ ...progress, status }));
        void result.mediaTask.result.then((mediaResult: MediaSyncResult) => {
          setMediaStatus(mediaResult);
          setCloudProgress({ ...mediaResult.progress, status: mediaResult.status });
          setJob((current) => ({ ...(current ?? { warnings: [], errors: [] }), status: mediaResult.status === "cloud-ready" ? "done" : "partial" }));
        });
      }
    } catch (error) {
      setJob((current) => ({
        ...(current ?? { warnings: [], errors: [] }),
        status: "error",
        errors: [...(current?.errors ?? []), error instanceof Error ? error.message : "Der Import ist fehlgeschlagen."],
      }));
    } finally {
      setIsParsing(false);
    }
  }

  async function handleCancelServerImport() {
    if (!serverProgress) return;
    const cancelled = await workflow.cancelApkgProgress(serverProgress);
    if (!cancelled) return;
    setServerProgress(cancelled);
    setJob((current) => ({ ...(current ?? { warnings: [], errors: [] }), status: "cancelled", progress: cancelled }));
    setIsParsing(false);
  }

  async function handleRetryServerImport() {
    if (!preview || preview.kind !== "server") return;
    setIsParsing(true);
    try {
      const next = await workflow.retryApkgPreview(preview, handleServerProgress);
      if (next) {
        setPreview(next);
        const status = next.progress.status === "ready" ? "preview" : next.progress.status === "succeeded" ? "done" : "error";
        setJob((current) => ({
          ...(current ?? { warnings: [], errors: [] }),
          status,
          progress: next.progress,
          errors: ["ready", "succeeded"].includes(next.progress.status) ? [] : current?.errors ?? [],
        }));
      }
    } finally {
      setIsParsing(false);
    }
  }

  const report = preview?.importReport ?? null;
  const apkgReport = report?.apkg?.contractVersion === 1 ? report.apkg : null;
  const previewWarnings = [...new Set([...(preview?.warnings ?? []), ...(report?.warnings ?? [])])];
  const previewErrors = [...new Set([...(job?.errors ?? []), ...(report?.errors ?? [])])];
  const uiState = projectImportUiState({
    jobStatus: job?.status,
    progressStatus: serverProgress?.status,
    retryable: serverProgress?.retryable,
    mediaStatus: cloudProgress?.status,
    hasPreview: Boolean(preview),
    hasMediaTask: Boolean(mediaTask),
    isBusy: isParsing,
  });
  const currentStepIndex = uiState.status === "idle" || uiState.status === "analyzing"
    ? 0
    : uiState.status === "preview"
    ? 1
    : uiState.status === "committing"
    ? 2
    : uiState.status === "syncing_media"
    ? 3
    : 4;
  const previewVisible = Boolean(preview) && !["failed_retryable", "failed_terminal", "cancelled"].includes(uiState.status);
  const presentMediaCount = apkgReport?.media.detected ?? 0;
  const cacheStatus = mediaStatus && "count" in mediaStatus ? mediaStatus : null;
  const syncStatus = mediaStatus && "message" in mediaStatus ? mediaStatus : null;
  const technicalIdentities = preview?.kind === "local"
    ? preview.sampleCards.flatMap((card) => [
        card.meta.ankiImportIdentityV1,
        ...card.variants.map((variant) => variant.meta.ankiImportIdentityV1 ?? nestedImportIdentity(variant.meta.metadataJson)),
      ]).filter(Boolean)
    : [];

  return (
    <div className="grid gap-5">
      <SoftPanel className="p-5 sm:p-6">
        <div className="mb-5 flex items-center gap-3">
          <OrbIcon icon={FileArchive} className="bg-teal-50 text-teal-700" />
          <div>
            <p className="text-sm font-semibold uppercase tracking-wide text-teal-700">Anki-Import</p>
            <h2 className="text-2xl font-semibold text-[#17214f]">APKG als Originalanker importieren</h2>
          </div>
        </div>

        <label
          onDragOver={(event) => {
            event.preventDefault();
            setIsDragging(true);
          }}
          onDragLeave={() => setIsDragging(false)}
          onDrop={handleDrop}
          className={`flex min-h-32 cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed px-5 py-5 text-center transition ${
            isDragging ? "border-teal-500 bg-teal-50" : "border-[#dfe4f5] bg-[#f8f9fe] hover:border-teal-400"
          }`}
        >
          <Upload className="mb-2 text-teal-700" size={26} aria-hidden="true" />
          <span className="text-base font-semibold text-[#17214f]">.apkg-Datei ablegen oder auswählen</span>
          <span className="mt-1 max-w-md text-sm leading-6 text-[#66709a]">Stapel, Karten und Medien werden vor dem Import geprüft.</span>
          <span className="mt-1 max-w-md text-xs leading-5 text-[#66709a]">{serverApkgEnabled ? "Explizit freigegeben bis 1 GiB." : "Freigegebene Dateigröße: bis 250 MiB."}</span>
          <input ref={fileInputRef} className="sr-only" type="file" accept=".apkg" onChange={handleFileInput} />
        </label>

        {selectedFile ? (
          <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[#e3e7f5] bg-white p-4">
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-[#17214f]">{selectedFile.name}</p>
            </div>
            <p className="mt-1 text-sm text-[#66709a]">{formatBytes(selectedFile.size)} · {importStatusLabel(uiState.status)}</p>
          </div>
        ) : null}

        {serverProgress ? (
          <div className="mt-4 rounded-xl border border-[#e3e7f5] bg-white p-4">
            <div className="flex items-center justify-between gap-3 text-sm">
              <span className="font-semibold text-[#4e5b8c]">Serverimport: {serverPhaseLabels[serverProgress.phase]}</span>
              <span className="text-[#66709a]">{formatServerProgress(serverProgress)}</span>
            </div>
            <progress className="mt-3 h-2 w-full accent-teal-700" max={Math.max(1, serverProgress.total)} value={serverProgress.completed} aria-label={`Serverimport: ${serverPhaseLabels[serverProgress.phase]}`} />
            <div className="mt-3 flex flex-wrap gap-2">
              {!['ready', 'succeeded', 'failed', 'cancelled'].includes(serverProgress.status) ? (
                <button type="button" onClick={() => void handleCancelServerImport()} className="min-h-10 rounded-xl border border-red-200 px-3 text-sm font-semibold text-red-700">Import abbrechen</button>
              ) : null}
            </div>
          </div>
        ) : null}

        <ol className="mt-5 grid gap-2 md:grid-cols-5" aria-label="Importstatus">
          {importSteps.map((step) => {
            const stepIndex = importSteps.findIndex((item) => item.id === step.id);
            const isActive = stepIndex === currentStepIndex;
            const isDone = stepIndex < currentStepIndex || uiState.status === "succeeded";
            const isFailure = ["failed_retryable", "failed_terminal", "cancelled"].includes(uiState.status);
            const label = step.id === "complete" && currentStepIndex === 4 ? importStatusLabel(uiState.status) : step.label;
            return (
              <li key={step.id} className={`flex items-center gap-2 rounded-xl border px-3 py-2 ${isActive ? isFailure ? "border-red-200 bg-red-50" : uiState.status === "partial" ? "border-amber-200 bg-amber-50" : "border-teal-200 bg-teal-50" : "border-[#e3e7f5]"}`}>
                {isActive && isParsing ? <Loader2 className="shrink-0 animate-spin text-teal-700" size={16} aria-hidden="true" /> : isDone ? <CheckCircle2 className="shrink-0 text-teal-700" size={16} aria-hidden="true" /> : isActive && isFailure ? <AlertCircle className="shrink-0 text-red-700" size={16} aria-hidden="true" /> : <span className="size-4 shrink-0 rounded-full border border-[#cfd6ed]" />}
                <span className="text-xs font-semibold text-[#4e5b8c]">{label}</span>
              </li>
            );
          })}
        </ol>

        {uiState.status === "succeeded" && completedDeck ? (
          <div className="core-status-success mt-4 text-sm" role="status" aria-live="polite">
            <p className="font-semibold">Import erfolgreich abgeschlossen.</p>
            <button type="button" onClick={() => onCompleted(completedDeck)} className="mt-3 min-h-10 rounded-xl bg-teal-700 px-4 font-semibold text-white">Import abschließen</button>
          </div>
        ) : null}

        {uiState.status === "partial" ? (
          <div className="core-status-warning mt-4 text-sm" role="status">
            <p>Import teilweise abgeschlossen. Die Karten sind übernommen; Medien sind noch nicht vollständig synchronisiert.</p>
            <div className="mt-3 flex flex-wrap gap-2">
              {mediaTask ? <button type="button" onClick={() => mediaTask.resume()} className="min-h-10 rounded-xl bg-amber-700 px-4 font-semibold text-white">Medien-Sync fortsetzen</button> : null}
              {completedDeck ? <button type="button" onClick={() => onCompleted(completedDeck)} className="min-h-10 rounded-xl border border-amber-300 bg-white px-4 font-semibold text-amber-900">Karten jetzt verwenden</button> : null}
            </div>
          </div>
        ) : null}

        {uiState.status === "failed_retryable" || uiState.status === "failed_terminal" ? (
          <div className="core-status-error mt-5 text-sm" role="alert">
            {(job?.errors.length ? job.errors : ["Die APKG-Datei konnte nicht verarbeitet werden."]).map((error, index) => (
              <p key={`${error}-${index}`}>{error}</p>
            ))}
            <button type="button" onClick={() => uiState.status === "failed_retryable" ? void handleRetryServerImport() : fileInputRef.current?.click()} className="mt-3 min-h-10 rounded-xl bg-red-700 px-4 text-sm font-semibold text-white">
              {uiState.status === "failed_retryable" ? "Erneut versuchen" : "Andere Datei auswählen"}
            </button>
          </div>
        ) : null}
        {uiState.status === "cancelled" ? (
          <div className="core-status-info mt-5 text-sm" role="status">
            <p>Import abgebrochen. Es wurden aus diesem Vorgang keine weiteren Karten übernommen.</p>
            <button type="button" onClick={() => fileInputRef.current?.click()} className="mt-3 min-h-10 rounded-xl border border-[#dfe4f5] bg-white px-4 font-semibold text-[#4f5eb1]">Andere Datei auswählen</button>
          </div>
        ) : null}
      </SoftPanel>

      <section className="grid gap-5">
        {previewVisible && preview ? (
          <>
            <SoftPanel className="p-6">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <p className="text-sm font-semibold uppercase tracking-wide text-teal-700">Importvorschau</p>
                  <h3 className="mt-1 text-2xl font-semibold text-[#17214f]">{preview.kind === "local" ? preview.deck.name : preview.deckSummary.name}</h3>
                </div>
                {uiState.status === "preview" ? (
                  <button type="button" disabled={previewErrors.length > 0 || isParsing} onClick={() => void handleCommit()} className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-teal-700 px-4 text-sm font-semibold text-white disabled:bg-slate-300">
                    <Database size={17} aria-hidden="true" />
                    Import übernehmen
                  </button>
                ) : null}
              </div>
              <div className="mt-4 rounded-xl border border-[#e3e7f5] bg-white/70 px-4 py-3 text-sm text-[#66709a]">
                <span className="font-semibold text-[#17214f]">{job?.fileName ?? selectedFile?.name ?? "APKG-Datei"}</span>
                <span> · {formatBytes(job?.fileSize ?? selectedFile?.size ?? 0)}</span>
              </div>
              <dl className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                {[
                  { label: "Erkannte Stapel", value: apkgReport?.decks.length ?? 0 },
                  { label: "Karten", value: apkgReport?.detectedCards ?? 0 },
                  { label: "Medien vorhanden", value: presentMediaCount },
                  { label: "Medien fehlen", value: apkgReport?.media.missing.length ?? 0 },
                ].map(({ label, value }) => (
                  <div key={label} className="rounded-xl border border-[#e3e7f5] bg-[#f8f9fe] p-3">
                    <dt className="text-xs font-semibold uppercase tracking-wide text-[#66709a]">{label}</dt>
                    <dd className="mt-1 text-2xl font-semibold text-[#17214f]">{value}</dd>
                  </div>
                ))}
              </dl>
              {apkgReport ? (
                <div className="mt-5 grid gap-4">
                  <section className="rounded-xl border border-[#e3e7f5] bg-white/70 p-4" aria-labelledby="apkg-decks-heading">
                    <h4 id="apkg-decks-heading" className="font-semibold text-[#17214f]">Erkannte Stapel</h4>
                    <div className="mt-3 grid gap-2 text-sm text-[#66709a]">
                      {apkgReport.decks.map((deck) => (
                        <div key={deck.id} className="flex flex-wrap items-center justify-between gap-2 border-b border-[#edf0f8] pb-2 last:border-0 last:pb-0">
                          <span className="font-medium text-[#4e5b8c]">{deck.path}</span>
                          <span>{deck.cardCount} Karten</span>
                        </div>
                      ))}
                    </div>
                  </section>

                  {apkgReport.media.missing.length > 0 ? (
                    <div className="flex gap-2 rounded-xl bg-amber-50 px-3 py-2 text-sm text-amber-900">
                      <AlertCircle className="mt-0.5 shrink-0" size={16} aria-hidden="true" />
                      <span>{apkgReport.media.missing.length} referenzierte Medien fehlen im Paket. Betroffene Karten können ohne Bild oder Ton erscheinen.</span>
                    </div>
                  ) : null}
                  {previewWarnings.length > 0 ? (
                    <details className="rounded-xl bg-amber-50 px-3 py-2 text-sm text-amber-900">
                      <summary className="flex cursor-pointer items-center gap-2 font-semibold">
                        <AlertCircle className="shrink-0" size={16} aria-hidden="true" />
                        {previewWarnings.length} {previewWarnings.length === 1 ? "Warnung" : "Warnungen"}
                      </summary>
                      <ul className="mt-3 list-disc space-y-1 pl-6">
                        {previewWarnings.map((warning) => <li key={warning}>{warning}</li>)}
                      </ul>
                    </details>
                  ) : null}

                  <details className="rounded-xl border border-[#e3e7f5] bg-white/70 p-4">
                    <summary className="cursor-pointer font-semibold text-[#17214f]">Technische Details</summary>
                    <div className="mt-4 grid gap-4">
                      <section className="rounded-xl bg-[#f8f9fe] p-4" aria-labelledby="apkg-notetypes-heading">
                        <h4 id="apkg-notetypes-heading" className="font-semibold text-[#17214f]">Kartentypen und Felder</h4>
                        <div className="mt-3 grid gap-3">
                          {apkgReport.notetypes.map((notetype) => (
                            <article key={notetype.id} className="rounded-lg bg-[#f8f9fe] p-3 text-sm">
                              <div className="flex flex-wrap items-center justify-between gap-2">
                                <span className="font-semibold text-[#4e5b8c]">{notetype.name}</span>
                                <span className="rounded-full bg-teal-50 px-2 py-1 text-xs font-semibold text-teal-800">{notetypeLabels[notetype.classification]}</span>
                              </div>
                              <p className="mt-2 break-all font-mono text-xs text-[#66709a]">Notetype-ID: {notetype.id}</p>
                              <p className="mt-2 text-[#66709a]">Templates: {notetype.templates.map((template) => `Ordinal ${template.ordinal}: ${template.name}`).join(", ") || "keine"}</p>
                              <p className="mt-1 text-[#66709a]">Zugeordnet: {notetype.mappedFields.join(", ") || "keine"}</p>
                              {notetype.unmappedFields.length > 0 ? <p className="mt-1 font-medium text-amber-800">Nicht zugeordnet: {notetype.unmappedFields.join(", ")}</p> : null}
                            </article>
                          ))}
                        </div>
                      </section>

                      <div className="grid gap-4 md:grid-cols-2">
                        <section className="rounded-xl bg-[#f8f9fe] p-4" aria-labelledby="apkg-media-heading">
                          <h4 id="apkg-media-heading" className="font-semibold text-[#17214f]">Medien</h4>
                          <div className="mt-3 grid gap-2 text-sm text-[#66709a]">
                            <p>Medien: {apkgReport.media.detected} erkannt · {apkgReport.media.referenced.length} referenziert · {apkgReport.media.missing.length} fehlend</p>
                            <p>Format: {apkgReport.mediaFormat} · Paket: {apkgReport.packageFormat}</p>
                            {cacheStatus ? <p>Lokaler Cache: {cacheStatus.persisted ? `${cacheStatus.count} Dateien persistent` : `${cacheStatus.count} Dateien nur temporär`}</p> : null}
                            {cloudProgress ? <p>Cloud: {cloudProgress.completed}/{cloudProgress.total} · {cloudProgress.uploaded} hochgeladen · {cloudProgress.reused} wiederverwendet · Status: {cloudProgress.status}</p> : null}
                            {syncStatus?.message ? <p>{syncStatus.message}</p> : null}
                            {previewMissingMedia.length > 0 ? <p>{previewMissingMedia.length} Medien sind nur lokal verfügbar oder fehlen.</p> : null}
                            {apkgReport.media.missing.length > 0 ? <p className="font-medium text-amber-800">Fehlend: {apkgReport.media.missing.join(", ")}</p> : null}
                            {apkgReport.media.assets.map((asset) => <p key={`${asset.name}-${asset.sha1}`} className="break-all font-mono text-xs">{asset.name} · {formatBytes(asset.size)} · SHA-1 {asset.sha1}</p>)}
                          </div>
                        </section>

                        <section className="rounded-xl bg-[#f8f9fe] p-4" aria-labelledby="apkg-reimport-heading">
                          <h4 id="apkg-reimport-heading" className="font-semibold text-[#17214f]">Reimport</h4>
                          <dl className="mt-3 grid grid-cols-2 gap-3 text-sm">
                            <div><dt className="text-[#66709a]">Neu</dt><dd className="font-semibold text-[#17214f]">{apkgReport.reimport.newItems}</dd></div>
                            <div><dt className="text-[#66709a]">Wiedererkannt</dt><dd className="font-semibold text-[#17214f]">{apkgReport.reimport.matchedItems}</dd></div>
                            <div><dt className="text-[#66709a]">Übersprungen</dt><dd className="font-semibold text-[#17214f]">{apkgReport.reimport.skippedItems}</dd></div>
                            <div><dt className="text-[#66709a]">Lokale Änderungen geschützt</dt><dd className="font-semibold text-[#17214f]">{apkgReport.reimport.protectedLocalEdits}</dd></div>
                          </dl>
                          <p className="mt-3 text-sm text-[#66709a]">Lernfortschritt: {apkgReport.hasAnkiScheduling ? "Anki-Daten erkannt, nicht übernommen" : "neuer CoRe-FSRS-State"}</p>
                        </section>
                      </div>
                      {technicalIdentities.length > 0 ? (
                        <section className="rounded-xl bg-[#f8f9fe] p-4" aria-labelledby="apkg-identities-heading">
                          <h4 id="apkg-identities-heading" className="font-semibold text-[#17214f]">Importidentitäten</h4>
                          <pre className="mt-3 max-h-72 overflow-auto whitespace-pre-wrap break-all text-xs text-[#66709a]">{JSON.stringify(technicalIdentities, null, 2)}</pre>
                        </section>
                      ) : null}
                    </div>
                  </details>
                </div>
              ) : null}
              {mediaTask && cloudProgress?.status !== "cloud-ready" && cloudProgress?.status !== "cancelled" ? (
                <div className="mt-4 flex flex-wrap gap-2">
                  {cloudProgress?.status === "paused" ? <button type="button" onClick={() => mediaTask.resume()} className="min-h-10 rounded-xl border border-[#dfe4f5] px-3 text-sm font-semibold text-[#4f5eb1]">Fortsetzen</button> : <button type="button" onClick={() => void mediaTask.pause()} className="min-h-10 rounded-xl border border-[#dfe4f5] px-3 text-sm font-semibold text-[#4f5eb1]">Pausieren</button>}
                  <button type="button" onClick={() => void mediaTask.cancel()} className="min-h-10 rounded-xl border border-red-200 px-3 text-sm font-semibold text-red-700">Upload abbrechen</button>
                </div>
              ) : null}
            </SoftPanel>

            {preview.sampleCards.length > 0 ? (
              <details className="core-surface-raised rounded-[18px] p-5">
                <summary className="cursor-pointer font-semibold text-[#17214f]">Kartenbeispiele</summary>
                <div className="mt-4 grid gap-4">
                  {preview.sampleCards.map((card) => (
                    <article key={card.id} className="core-surface-raised rounded-[18px] p-5">
                      <div className="mb-4 flex items-center justify-between gap-3">
                        <span className="rounded-xl bg-teal-50 px-3 py-1 text-xs font-semibold text-teal-800">Originalkarte</span>
                        <span className="text-xs font-medium uppercase tracking-wide text-[#66709a]">{card.kind}</span>
                      </div>
                      <div className="grid gap-4 md:grid-cols-2">
                        <div>
                          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-[#66709a]">Front</p>
                          <CardHtml html={card.originalFront} mediaUrls={previewMediaUrls} />
                        </div>
                        <div>
                          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-[#66709a]">Back</p>
                          <CardHtml html={card.originalBack} mediaUrls={previewMediaUrls} />
                        </div>
                      </div>
                    </article>
                  ))}
                </div>
              </details>
            ) : null}
          </>
        ) : (
          <SoftPanel className="p-6">
            <p className="text-sm font-semibold uppercase tracking-wide text-teal-700">Bereit</p>
            <h3 className="mt-1 text-2xl font-semibold text-[#17214f]">Importbericht erscheint nach dem Upload</h3>
          </SoftPanel>
        )}
      </section>
    </div>
  );
}
