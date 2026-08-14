import React from "react";
import { AlertCircle, CheckCircle2, Database, FileArchive, Loader2, Upload } from "lucide-react";
import type { ApkgCreationPreview, CreationWorkflow } from "../creationWorkflow.ts";
import type { ApkgCloudProgress, ApkgImportJob, ApkgImportSession, ApkgPreviewMediaStatus, ApkgProgressPhase } from "../apkgImportSession.ts";
import { getOriginalVariant } from "../coreModel.ts";
import type { Deck, LearningItem, NoteTypeDefinitionV1 } from "../coreTypes.ts";
import { projectImportUiState, type ImportUiState } from "../importUiState.ts";
import type { AccountMediaStore, MediaSyncProgress, MediaSyncResult, MediaSyncStatus, MediaSyncTask } from "../mediaStore.ts";
import { LOCAL_APKG_MAX_BYTES } from "../apkgImport.ts";
import { ActionButton } from "../ui/actionUi.tsx";
import { useCardMediaUrls } from "../ui/cardMedia.tsx";
import { CardPresentationSurface } from "../ui/CardPresentationSurface.tsx";
import { OrbIcon, SoftPanel, StatTile } from "../ui/coreUi.tsx";
import { formatBytes, importSteps } from "./screenConstants.ts";

type ApkgWorkflow = Pick<CreationWorkflow, "commitApkgPreview" | "parseApkgFile">;

export interface ApkgImportPanelProps {
  existingDecks: Deck[];
  workflow: ApkgWorkflow;
  mediaStore: AccountMediaStore | null;
  session: ApkgImportSession;
  onSessionChange: React.Dispatch<React.SetStateAction<ApkgImportSession>>;
  isSessionCurrent: (version: number) => boolean;
  onResetSession: (disposeWorker?: boolean) => void;
  onCompleted: (deck: Deck) => unknown;
}

const ANALYSIS_PROGRESS_BY_STEP: Record<string, number> = {
  validate: 5,
  collection: 25,
  cards: 50,
  preview: 85,
};

const APKG_SAMPLE_CARD_LIMIT = 3;
const APKG_CARD_SIDES = [
  { side: "question", label: "Vorderseite", title: "APKG-Vorschau der Vorderseite" },
  { side: "answer", label: "Rückseite", title: "APKG-Vorschau der Rückseite" },
] as const;

function normalizeProgress(percent: number): number {
  return Math.max(0, Math.min(100, Math.round(percent)));
}

function mediaProgressPercent(progress: MediaSyncProgress, status: MediaSyncStatus): number {
  if (status === "cloud-ready") return 100;
  if (progress.total <= 0) return 0;
  return Math.min(99, normalizeProgress((progress.completed / progress.total) * 100));
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
  };
}

function importStatusLabel(status: ImportUiState["status"]): string {
  return {
    idle: "Bereit",
    analyzing: "Analysieren",
    preview: "Vorschau bereit",
    committing: "Übernehmen",
    syncing_cloud: "Cloud-Daten werden synchronisiert",
    syncing_media: "Medien werden synchronisiert",
    succeeded: "Erfolgreich",
    partial: "Teilweise fertig",
    failed_retryable: "Fehlgeschlagen, erneut versuchbar",
    failed_terminal: "Fehlgeschlagen",
    cancelled: "Abgebrochen",
  }[status];
}

function ApkgPreviewBadge({ children }: { children: React.ReactNode }) {
  return <span className="rounded-xl bg-core-success-soft px-3 py-1 core-caption !font-semibold text-core-text">{children}</span>;
}

function ApkgCardSample({ deck, card, definition, mediaStore }: { deck: Deck; card: LearningItem; definition: NoteTypeDefinitionV1 | null; mediaStore: AccountMediaStore | null }) {
  const { urls: mediaUrls } = useCardMediaUrls({ ...deck, cards: [card] }, card.id, mediaStore);
  const variant = getOriginalVariant(card);
  if (!variant || !definition) return null;
  return (
    <article className="core-surface-raised rounded-[18px] p-5">
      <div className="mb-4 flex items-center justify-between gap-3">
        <ApkgPreviewBadge>Originalkarte</ApkgPreviewBadge>
        <span className="core-caption font-medium uppercase tracking-wide text-[var(--core-text-muted)]">{definition.name}</span>
      </div>
      <div className="grid min-w-0 gap-4 xl:grid-cols-2">
        {APKG_CARD_SIDES.map(({ side, label, title }) => (
          <CardPresentationSurface
            key={side}
            item={card}
            variant={variant}
            definition={definition}
            side={side}
            surface="editor-preview"
            title={title}
            mediaUrls={mediaUrls}
            showCompatibility="warnings-only"
            cornerBadge={<ApkgPreviewBadge>{label}</ApkgPreviewBadge>}
          />
        ))}
      </div>
    </article>
  );
}

export function ApkgImportPanel({ existingDecks, workflow, mediaStore, session, onSessionChange, isSessionCurrent, onResetSession, onCompleted }: ApkgImportPanelProps) {
  const fileInputRef = React.useRef<HTMLInputElement | null>(null);
  const [isDragging, setIsDragging] = React.useState(false);
  const [prefersReducedMotion, setPrefersReducedMotion] = React.useState(false);
  const { selectedFile, job, preview, mediaStatus, isParsing, mediaTask, cloudTask, cloudProgress, completedDeck, phaseProgress } = session;
  const sessionVersion = session.version;

  function updateSession(update: (current: ApkgImportSession) => ApkgImportSession) {
    onSessionChange((current) => current.version === sessionVersion ? update(current) : current);
  }

  function setJob(update: React.SetStateAction<ApkgImportJob | null>) {
    updateSession((current) => ({ ...current, job: typeof update === "function" ? update(current.job) : update }));
  }

  function setPreview(update: React.SetStateAction<ApkgCreationPreview | null>) {
    updateSession((current) => ({ ...current, preview: typeof update === "function" ? update(current.preview) : update }));
  }

  function setMediaStatus(value: ApkgPreviewMediaStatus | MediaSyncResult | null) { updateSession((current) => ({ ...current, mediaStatus: value })); }
  function setIsParsing(value: boolean) { updateSession((current) => ({ ...current, isParsing: value })); }
  function setMediaTask(value: MediaSyncTask | null) { updateSession((current) => ({ ...current, mediaTask: value })); }
  function setCloudTask(value: ApkgImportSession["cloudTask"]) { updateSession((current) => ({ ...current, cloudTask: value })); }
  function setCloudProgress(value: ApkgCloudProgress | null) { updateSession((current) => ({ ...current, cloudProgress: value })); }
  function setCompletedDeck(value: Deck | null) { updateSession((current) => ({ ...current, completedDeck: value })); }
  function setSelectedFile(value: File | null) { updateSession((current) => ({ ...current, selectedFile: value })); }
  function setPhaseProgress(update: React.SetStateAction<{ phase: ApkgProgressPhase; percent: number } | null>) {
    updateSession((current) => ({ ...current, phaseProgress: typeof update === "function" ? update(current.phaseProgress) : update }));
  }

  React.useEffect(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") return undefined;
    const mediaQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    const updatePreference = () => setPrefersReducedMotion(mediaQuery.matches);
    updatePreference();
    mediaQuery.addEventListener?.("change", updatePreference);
    return () => mediaQuery.removeEventListener?.("change", updatePreference);
  }, []);

  function beginProgress(phase: ApkgProgressPhase) {
    setPhaseProgress({ phase, percent: 0 });
  }

  function reportProgress(phase: ApkgProgressPhase, percent: number) {
    const next = normalizeProgress(percent);
    setPhaseProgress((current) => {
      if (current?.phase !== phase) return { phase, percent: next };
      return next > current.percent ? { phase, percent: next } : current;
    });
  }

  async function parseFile(file: File) {
    if (preview?.commitGraph.kind === "worker-import") preview.commitGraph.dispose();
    setSelectedFile(file);
    setPreview(null);
    setMediaStatus(null);
    setMediaTask(null);
    setCloudTask(null);
    setCloudProgress(null);
    setCompletedDeck(null);
    beginProgress("analyzing");
    if (file.size > LOCAL_APKG_MAX_BYTES) {
      setPhaseProgress(null);
      setJob({
        fileName: file.name,
        fileSize: file.size,
        status: "error",
        warnings: [],
        errors: ["Die APKG-Datei ist größer als 250 MB. Bitte wähle eine kleinere Datei aus."],
      });
      return;
    }
    setJob({ fileName: file.name, fileSize: file.size, status: "parsing", warnings: [], errors: [] });
    setIsParsing(true);

    try {
      const result = await workflow.parseApkgFile(file as unknown as Parameters<ApkgWorkflow["parseApkgFile"]>[0], {
        existingDecks,
        onStep: (step) => reportProgress("analyzing", ANALYSIS_PROGRESS_BY_STEP[step] ?? 0),
      });
      if (!isSessionCurrent(sessionVersion)) {
        if (result.preview?.commitGraph.kind === "worker-import") result.preview.commitGraph.dispose();
        return;
      }
      reportProgress("analyzing", 100);
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
    if (fileInteractionLocked) return;
    const file = event.dataTransfer.files?.[0];
    if (file) void parseFile(file);
  }

  async function handleCommit() {
    if (!preview) return;
    beginProgress("committing");
    setJob((current) => ({ ...(current ?? { warnings: [], errors: [] }), status: "committing" }));
    setIsParsing(true);
    try {
      const result = await workflow.commitApkgPreview(preview, {
        existingDecks,
        onProgress: (percent) => reportProgress("committing", percent),
      });
      if (result.report.errors.length > 0 || !result.deck) {
        setJob((current) => ({
          ...(current ?? { warnings: [], errors: [] }),
          status: "error",
          warnings: [...new Set([...(current?.warnings ?? []), ...(result.report.warnings ?? [])])],
          errors: [...new Set([...(current?.errors ?? []), ...(result.report.errors ?? [])])],
        }));
        setPreview((current) => current ? { ...current, report: result.report } as ApkgCreationPreview : current);
        return;
      }
      setJob((current) => ({
        ...(current ?? { warnings: [], errors: [] }),
        status: "syncing_cloud",
        warnings: [...new Set([...(current?.warnings ?? []), ...(result.report.warnings ?? [])])],
      }));
      setPreview((current) => current ? { ...current, report: result.report } as ApkgCreationPreview : current);
      setCompletedDeck(result.deck);
      if (!("cloudTask" in result) || !result.cloudTask || !result.mediaTask) throw new Error("Die Synchronisierungsaufgaben des Imports fehlen.");
      const importCloudTask = result.cloudTask;
      const importMediaTask = result.mediaTask;
      let mediaStarted = false;
      setCloudTask(importCloudTask);
      setMediaTask(importMediaTask);
      beginProgress("syncing_cloud");
      importCloudTask.subscribe((cloudResult) => {
        if (cloudResult.status === "local-pending") {
          setJob((current) => ({ ...(current ?? { warnings: [], errors: [] }), status: "syncing_cloud" }));
          return;
        }
        if (cloudResult.status === "blocked") {
          setJob((current) => ({
            ...(current ?? { warnings: [], errors: [] }),
            status: "error",
            errors: [...new Set([...(current?.errors ?? []), cloudResult.message])],
          }));
          return;
        }
        if (cloudResult.status !== "cloud-ready" || mediaStarted) return;
        mediaStarted = true;
        reportProgress("syncing_cloud", 100);
        beginProgress("syncing_media");
        setJob((current) => ({ ...(current ?? { warnings: [], errors: [] }), status: "syncing_media" }));
        importMediaTask.subscribe((progress: MediaSyncProgress, status: MediaSyncStatus) => {
          setCloudProgress({ ...progress, status });
          reportProgress("syncing_media", mediaProgressPercent(progress, status));
        });
        void importMediaTask.result
          .then((mediaResult: MediaSyncResult) => {
            setMediaStatus(mediaResult);
            setCloudProgress({ ...mediaResult.progress, status: mediaResult.status });
            reportProgress("syncing_media", mediaProgressPercent(mediaResult.progress, mediaResult.status));
            setJob((current) => ({ ...(current ?? { warnings: [], errors: [] }), status: mediaResult.status === "cloud-ready" ? "done" : "partial" }));
          })
          .catch((error) => {
            setJob((current) => ({
              ...(current ?? { warnings: [], errors: [] }),
              status: "error",
              errors: [...(current?.errors ?? []), error instanceof Error ? error.message : "Die Mediensynchronisierung ist fehlgeschlagen."],
            }));
          });
      });
    } catch (error) {
      setJob((current) => ({
        ...(current ?? { warnings: [], errors: [] }),
        status: "error",
        errors: [...(current?.errors ?? []), error instanceof Error ? error.message : "Der Import ist fehlgeschlagen."],
      }));
    } finally {
      setIsParsing(false);
      if (preview.commitGraph.kind === "worker-import") preview.commitGraph.dispose();
    }
  }

  const report = preview?.report ?? null;
  const apkgReport = report?.apkg?.contractVersion === 1 ? report.apkg : null;
  const previewWarnings = [...new Set(report?.warnings ?? [])];
  const previewErrors = [...new Set([...(job?.errors ?? []), ...(report?.errors ?? [])])];
  const uiState = projectImportUiState({
    jobStatus: job?.status,
    cloudStatus: cloudTask?.status,
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
    : uiState.status === "syncing_cloud"
    ? 3
    : uiState.status === "syncing_media"
    ? 4
    : 5;
  const activeProgressPhase: ApkgProgressPhase | null = uiState.status === "analyzing" || uiState.status === "committing" || uiState.status === "syncing_cloud" || uiState.status === "syncing_media"
    ? uiState.status
    : null;
  const progressPaused = activeProgressPhase === "syncing_cloud"
    ? cloudTask?.status === "local-pending"
    : activeProgressPhase === "syncing_media" && cloudProgress?.status === "paused";
  const activeProgressPercent = activeProgressPhase && phaseProgress?.phase === activeProgressPhase ? phaseProgress.percent : 0;
  const fileInteractionLocked = activeProgressPhase !== null;
  const progressRunning = fileInteractionLocked && !progressPaused;
  const previewVisible = Boolean(preview) && !["failed_retryable", "failed_terminal", "cancelled"].includes(uiState.status);
  const presentMediaCount = apkgReport?.media.detected ?? 0;
  const previewDefinitions = new Map(preview?.commitGraph.noteTypeDefinitions.map((definition) => [definition.id, definition]) ?? []);

  React.useEffect(() => {
    if (!activeProgressPhase || progressPaused || prefersReducedMotion) return undefined;
    const interval = window.setInterval(() => {
      setPhaseProgress((current) => {
        if (!current || current.phase !== activeProgressPhase || current.percent >= 95) return current;
        const increment = Math.max(1, Math.ceil((95 - current.percent) * 0.08));
        return { ...current, percent: Math.min(95, current.percent + increment) };
      });
    }, 500);
    return () => window.clearInterval(interval);
  }, [activeProgressPhase, prefersReducedMotion, progressPaused]);

  return (
    <div className="grid gap-5">
      <SoftPanel className="p-5 sm:p-6">
        <div className="mb-5 flex items-center gap-3">
          <OrbIcon icon={FileArchive} className="bg-core-success-soft text-core-text" />
          <h2 className="core-heading-2 font-semibold text-[var(--core-text)]">APKG-Dateien importieren</h2>
        </div>

        <label
          onDragOver={(event) => {
            event.preventDefault();
            if (fileInteractionLocked) return;
            setIsDragging(true);
          }}
          onDragLeave={() => setIsDragging(false)}
          onDrop={handleDrop}
          onClick={(event) => {
            if (fileInteractionLocked) event.preventDefault();
          }}
          aria-disabled={fileInteractionLocked}
          className={`flex min-h-32 flex-col items-center justify-center rounded-xl border-2 border-dashed px-5 py-5 text-center transition ${
            fileInteractionLocked
              ? "cursor-not-allowed border-[var(--core-border)] bg-[var(--core-surface-muted)] opacity-70"
              : isDragging
                ? "cursor-pointer border-core-success bg-core-success-soft"
                : "cursor-pointer border-[var(--core-border)] bg-[var(--core-surface-muted)] hover:border-core-success"
          }`}
        >
          <Upload className="mb-2 text-core-text" size={26} aria-hidden="true" />
          <span className="core-body-large font-semibold text-[var(--core-text)]">APKG-Datei ablegen oder auswählen (Max. 250 MB)</span>
          <input ref={fileInputRef} className="sr-only" type="file" accept=".apkg" disabled={fileInteractionLocked} onChange={handleFileInput} />
        </label>

        {selectedFile ? (
          <div
            className="relative mt-4 overflow-hidden rounded-xl border border-[var(--core-border)] bg-core-surface p-4"
            data-testid="apkg-file-progress"
            role={activeProgressPhase ? "progressbar" : undefined}
            aria-label={activeProgressPhase ? `Importfortschritt für ${selectedFile.name}` : undefined}
            aria-valuemin={activeProgressPhase ? 0 : undefined}
            aria-valuemax={activeProgressPhase ? 100 : undefined}
            aria-valuenow={activeProgressPhase ? activeProgressPercent : undefined}
            aria-valuetext={activeProgressPhase ? `${importStatusLabel(uiState.status)}: ${activeProgressPercent} Prozent${progressPaused ? ", pausiert" : ""}` : undefined}
            aria-busy={activeProgressPhase ? progressRunning : undefined}
          >
            {activeProgressPhase ? (
              <span
                data-testid="apkg-progress-fill"
                className="pointer-events-none absolute inset-y-0 left-0 bg-[var(--core-surface-muted)] transition-[width] duration-500 ease-out motion-reduce:transition-none"
                style={{ width: `${activeProgressPercent}%` }}
                aria-hidden="true"
              />
            ) : null}
            <div className="relative grid min-w-0 grid-cols-2 items-center gap-x-3 gap-y-1 sm:grid-cols-[minmax(0,1fr)_auto_auto]">
              <p className="col-span-2 min-w-0 truncate core-body font-semibold text-[var(--core-text)] sm:col-span-1">{selectedFile.name}</p>
              <p className={`core-body font-semibold ${activeProgressPhase ? "text-[var(--core-text)]" : "text-[var(--core-text-muted)]"}`}>
                {activeProgressPhase ? `${activeProgressPercent} %` : importStatusLabel(uiState.status)}
              </p>
              <p className="justify-self-end whitespace-nowrap core-body text-[var(--core-text-muted)]">{formatBytes(selectedFile.size)}</p>
            </div>
          </div>
        ) : null}

        <ol className="mt-5 grid gap-2 md:grid-cols-6" aria-label="Importstatus">
          {importSteps.map((step) => {
            const stepIndex = importSteps.findIndex((item) => item.id === step.id);
            const isActive = stepIndex === currentStepIndex;
            const isDone = stepIndex < currentStepIndex || uiState.status === "succeeded";
            const isFailure = ["failed_retryable", "failed_terminal", "cancelled"].includes(uiState.status);
            const label = step.id === "complete" && currentStepIndex === 5 ? importStatusLabel(uiState.status) : step.label;
            return (
              <li key={step.id} className={`flex items-center gap-2 rounded-xl border px-3 py-2 ${isActive ? isFailure ? "border-core-danger bg-core-danger-soft" : uiState.status === "partial" ? "border-core-warning bg-core-warning-soft" : "border-core-success bg-core-success-soft" : "border-[var(--core-border)]"}`}>
                {isActive && progressRunning ? <Loader2 className="shrink-0 animate-spin text-core-text motion-reduce:animate-none" size={16} aria-hidden="true" /> : isDone ? <CheckCircle2 className="shrink-0 text-core-text" size={16} aria-hidden="true" /> : isActive && isFailure ? <AlertCircle className="shrink-0 text-core-text" size={16} aria-hidden="true" /> : <span className="size-4 shrink-0 rounded-full border border-[var(--core-border)]" />}
                <span className="core-caption font-semibold text-[var(--core-text-secondary)]">{label}</span>
              </li>
            );
          })}
        </ol>

        {uiState.status === "succeeded" && completedDeck ? (
          <div className="core-status-success mt-4 core-body" role="status" aria-live="polite">
            <p className="font-semibold">Import erfolgreich abgeschlossen.</p>
            <ActionButton type="button" variant="primary" onClick={() => {
              onResetSession();
              onCompleted(completedDeck);
            }} className="mt-3">Import abschließen</ActionButton>
          </div>
        ) : null}

        {uiState.status === "syncing_cloud" && cloudTask?.status === "local-pending" ? (
          <div className="core-status-warning mt-4 core-body" role="status">
            <p>Die Karten sind lokal gespeichert; die Synchronisierung steht noch aus.</p>
            <ActionButton type="button" variant="primary" onClick={() => void cloudTask.retry()} className="mt-3">Cloud-Sync erneut versuchen</ActionButton>
          </div>
        ) : null}

        {uiState.status === "partial" ? (
          <div className="core-status-warning mt-4 core-body" role="status">
            <p>Die Karten sind lokal gespeichert; die Cloud- oder Mediensynchronisierung steht noch aus.</p>
            {mediaStatus && "message" in mediaStatus && mediaStatus.message ? <p className="mt-2">{mediaStatus.message}</p> : null}
            <div className="mt-3 flex flex-wrap gap-2">
              {cloudTask?.status === "local-pending" ? <ActionButton type="button" variant="primary" onClick={() => void cloudTask.retry()}>Cloud-Sync erneut versuchen</ActionButton> : null}
              {mediaTask && cloudProgress?.status === "paused" ? <ActionButton type="button" variant="primary" onClick={() => mediaTask.resume()}>Medien-Sync fortsetzen</ActionButton> : null}
            </div>
          </div>
        ) : null}

        {uiState.status === "failed_retryable" || uiState.status === "failed_terminal" ? (
          <div className="core-status-error mt-5 core-body" role="alert">
            {(job?.errors.length ? job.errors : ["Die APKG-Datei konnte nicht verarbeitet werden."]).map((error, index) => (
              <p key={`${error}-${index}`}>{error}</p>
            ))}
            <ActionButton type="button" variant="primary" onClick={() => fileInputRef.current?.click()} className="mt-3">Andere Datei auswählen</ActionButton>
          </div>
        ) : null}
        {uiState.status === "cancelled" ? (
          <div className="core-status-info mt-5 core-body" role="status">
            <p>Import abgebrochen. Es wurden aus diesem Vorgang keine weiteren Karten übernommen.</p>
            <ActionButton type="button" variant="secondary" onClick={() => fileInputRef.current?.click()} className="mt-3">Andere Datei auswählen</ActionButton>
          </div>
        ) : null}
      </SoftPanel>

      <section className="grid gap-5">
        {previewVisible && preview ? (
          <>
            <SoftPanel className="p-6">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <p className="core-body font-semibold uppercase tracking-wide text-core-text">Importvorschau</p>
                  <h3 className="mt-1 core-heading-2 font-semibold text-[var(--core-text)]">{preview.summary.name}</h3>
                </div>
                {uiState.status === "preview" ? (
                  <ActionButton type="button" variant="primary" icon={Database} loading={isParsing} disabled={previewErrors.length > 0} onClick={() => void handleCommit()}>Import übernehmen</ActionButton>
                ) : null}
              </div>
              <div className="mt-4 rounded-xl border border-[var(--core-border)] bg-core-surface px-4 py-3 core-body text-[var(--core-text-muted)]">
                <span className="font-semibold text-[var(--core-text)]">{job?.fileName ?? selectedFile?.name ?? "APKG-Datei"}</span>
                <span> · {formatBytes(job?.fileSize ?? selectedFile?.size ?? 0)}</span>
              </div>
              <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                {[
                  { label: "Erkannte Stapel", value: apkgReport?.decks.length ?? 0 },
                  { label: "Karten", value: apkgReport?.detectedCards ?? 0 },
                  { label: "Medien vorhanden", value: presentMediaCount },
                  { label: "Medien fehlen", value: apkgReport?.media.missing.length ?? 0 },
                ].map(({ label, value }) => (
                  <StatTile key={label} data-testid="apkg-stat-tile" size="compact" label={label} value={value} />
                ))}
              </div>
              {apkgReport ? (
                <div className="mt-5 grid gap-4">
                  <section className="rounded-xl border border-[var(--core-border)] bg-core-surface p-4" aria-labelledby="apkg-decks-heading">
                    <h4 id="apkg-decks-heading" className="font-semibold text-[var(--core-text)]">Erkannte Stapel</h4>
                    <div className="mt-3 grid gap-2 core-body text-[var(--core-text-muted)]">
                      {apkgReport.decks.map((deck) => (
                        <div key={deck.id} className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--core-surface-muted)] pb-2 last:border-0 last:pb-0">
                          <span className="font-medium text-[var(--core-text-secondary)]">{deck.path}</span>
                          <span>{deck.cardCount} Karten</span>
                        </div>
                      ))}
                    </div>
                  </section>

                  {apkgReport.media.missing.length > 0 ? (
                    <div className="flex gap-2 rounded-xl bg-core-warning-soft px-3 py-2 core-body text-core-text">
                      <AlertCircle className="mt-0.5 shrink-0" size={16} aria-hidden="true" />
                      <span>{apkgReport.media.missing.length} referenzierte Medien fehlen im Paket. Betroffene Karten können ohne Bild oder Ton erscheinen.</span>
                    </div>
                  ) : null}
                  {previewWarnings.length > 0 ? (
                    <details className="rounded-xl bg-core-warning-soft px-3 py-2 core-body text-core-text">
                      <summary className="flex cursor-pointer items-center gap-2 font-semibold">
                        <AlertCircle className="shrink-0" size={16} aria-hidden="true" />
                        {previewWarnings.length} {previewWarnings.length === 1 ? "Warnung" : "Warnungen"}
                      </summary>
                      <ul className="mt-3 list-disc space-y-1 pl-6">
                        {previewWarnings.map((warning) => <li key={warning}>{warning}</li>)}
                      </ul>
                    </details>
                  ) : null}

                  <section className="rounded-xl border border-[var(--core-border)] bg-core-surface p-4" aria-labelledby="apkg-reimport-heading">
                    <h4 id="apkg-reimport-heading" className="font-semibold text-[var(--core-text)]">Reimport-Schutz</h4>
                    <dl className="mt-3 grid grid-cols-2 gap-3 core-body sm:grid-cols-4">
                      <div><dt className="text-[var(--core-text-muted)]">Neu</dt><dd className="font-semibold text-[var(--core-text)]">{apkgReport.reimport.newItems}</dd></div>
                      <div><dt className="text-[var(--core-text-muted)]">Wiedererkannt</dt><dd className="font-semibold text-[var(--core-text)]">{apkgReport.reimport.matchedItems}</dd></div>
                      <div><dt className="text-[var(--core-text-muted)]">Übersprungen</dt><dd className="font-semibold text-[var(--core-text)]">{apkgReport.reimport.skippedItems}</dd></div>
                      <div><dt className="text-[var(--core-text-muted)]">Lokale Änderungen geschützt</dt><dd className="font-semibold text-[var(--core-text)]">{apkgReport.reimport.protectedLocalEdits}</dd></div>
                    </dl>
                  </section>
                </div>
              ) : null}
              {mediaTask && uiState.status === "syncing_media" && cloudProgress?.status !== "cloud-ready" && cloudProgress?.status !== "cancelled" ? (
                <div className="mt-4 flex flex-wrap gap-2">
                  {cloudProgress?.status === "paused" ? <ActionButton type="button" variant="secondary" onClick={() => mediaTask.resume()}>Fortsetzen</ActionButton> : <ActionButton type="button" variant="secondary" onClick={() => void mediaTask.pause()}>Pausieren</ActionButton>}
                  <ActionButton type="button" variant="destructive" onClick={() => void mediaTask.cancel()}>Upload abbrechen</ActionButton>
                </div>
              ) : null}
            </SoftPanel>

            {preview.sampleCards.length > 0 ? (
              <details className="core-surface-raised rounded-[18px] p-5">
                <summary className="cursor-pointer font-semibold text-[var(--core-text)]">Kartenbeispiele</summary>
                <div className="mt-4 grid gap-4">
                  {preview.sampleCards.slice(0, APKG_SAMPLE_CARD_LIMIT).map((card) => <ApkgCardSample key={card.id} deck={preview.summary} card={card} definition={previewDefinitions.get(card.noteTypeDefinitionId) ?? null} mediaStore={mediaStore} />)}
                </div>
              </details>
            ) : null}
          </>
        ) : null}
      </section>
    </div>
  );
}
